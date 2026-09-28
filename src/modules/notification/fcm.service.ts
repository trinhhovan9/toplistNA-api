import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { App, getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../../entities/user.entity';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: App | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleInit() {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0 && existingApps[0]) {
        this.firebaseApp = existingApps[0];
        this.logger.log('🔥 Firebase Admin already initialized — reusing instance');
        return;
      }

      const keyPath = path.join(process.cwd(), 'firebase-service-account.json');
      if (!fs.existsSync(keyPath)) {
        this.logger.warn(`⚠️ firebase-service-account.json not found at ${keyPath} — FCM disabled.`);
        return;
      }

      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      this.firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });

      this.logger.log(`🔥 Firebase Admin initialized successfully — project: ${serviceAccount.project_id}`);
    } catch (err: any) {
      this.logger.error(`❌ Firebase init error: ${err.message}`);
    }
  }

  /**
   * Lưu FCM token cho một user vào bảng users trong MySQL
   */
  async saveUserToken(userId: number, token: string): Promise<boolean> {
    try {
      if (!userId || !token) return false;
      const cleanToken = token.trim();
      if (!cleanToken) return false;

      await this.userRepo.update({ id: userId }, { fcmToken: cleanToken });
      this.logger.log(`📱 FCM token updated for user #${userId}: ${cleanToken.substring(0, 25)}...`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to save FCM token for user #${userId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Gửi FCM push notification tới user theo ID
   */
  async sendToUser(
    userId: number,
    title: string,
    body: string,
    data: Record<string, any> = {},
    sound: string = 'default',
  ): Promise<boolean> {
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`Cannot send push: User #${userId} not found in DB`);
        return false;
      }
      if (!user.fcmToken) {
        this.logger.warn(`Cannot send push: User #${userId} (${user.name || user.username}) has no fcm_token registered`);
        // Fallback gửi tới tài khoản đối tác test #817 nếu quán chưa có token
        if (userId !== 817) {
          const partner = await this.userRepo.findOne({ where: { id: 817 } });
          if (partner?.fcmToken) {
            this.logger.log(`🔄 [FCM Fallback] Gửi push tới tài khoản đối tác #817 thay cho user #${userId}`);
            return await this.sendToToken(partner.fcmToken, title, body, data, sound, 817);
          }
        }
        return false;
      }

      return await this.sendToToken(user.fcmToken, title, body, data, sound, userId);
    } catch (err: any) {
      this.logger.error(`Error sending push to user #${userId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Gửi FCM push notification trực tiếp tới token
   */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
    sound: string = 'default',
    targetUserId?: number,
  ): Promise<boolean> {
    if (!this.firebaseApp) {
      this.logger.warn('⚠️ Firebase Admin not initialized — push notification skipped');
      return false;
    }

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      this.logger.warn('⚠️ Invalid or empty FCM token');
      return false;
    }

    // FCM data fields MUST all be strings
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    const isOrderAlert =
      data?.type === 'order:new' ||
      data?.type === 'new_order' ||
      data?.type === 'hotel:booking_new' ||
      data?.isOrderAlert === 'true' ||
      data?.isOrderAlert === true ||
      title.includes('ĐƠN HÀNG MỚI') ||
      title.includes('đơn hàng mới') ||
      title.includes('ĐẶT PHÒNG MỚI') ||
      title.includes('đặt phòng mới');

    const channelId = isOrderAlert
      ? 'toplistna_order_channel_id'
      : 'toplistna_notifications_channel_id';

function stripEmojis(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

    // Luôn loại bỏ emoji để thông báo chuẩn mực, trang trọng
    const cleanTitle = stripEmojis(title);
    const cleanBody = stripEmojis(body);

    const isCustomSound = isOrderAlert || sound === 'alarm' || sound === 'chuong';

    // Cấu hình push message với Priority High và Channel có sound/vibrate chuong.mp3
    const message: Message = {
      token: token.trim(),
      notification: {
        title: cleanTitle,
        body: cleanBody,
      },
      data: {
        ...stringData,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: isCustomSound ? 'chuong' : 'default',
          priority: 'max',
          defaultSound: !isCustomSound,
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: cleanTitle, body: cleanBody },
            sound: isCustomSound ? 'chuong.mp3' : 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
      },
    };

    try {
      this.logger.log(`\n📡 [FCM] Gửi Push Notification:`);
      this.logger.log(`📬 Title: "${title}"`);
      this.logger.log(`📝 Body: "${body}"`);
      this.logger.log(`🔑 Token: ${token.substring(0, 30)}...`);

      const messageId = await getMessaging(this.firebaseApp).send(message);
      this.logger.log(`✅ [FCM] Gửi thành công — MessageId: ${messageId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`❌ [FCM] Gửi thất bại: ${err.message}`);
      // Xóa token rác nếu không còn hợp lệ
      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        if (targetUserId) {
          this.logger.warn(`🗑️ Xóa FCM token hết hạn của user #${targetUserId}`);
          await this.userRepo.update({ id: targetUserId }, { fcmToken: null as any });
        }
      }
      return false;
    }
  }
}

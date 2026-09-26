import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { Notification } from '../../entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * Tạo một thông báo mới vào database
   */
  async createNotification(params: {
    userId: number;
    title: string;
    message: string;
    type?: string;
    data?: Record<string, any>;
  }) {
    try {
      const notif = this.notificationRepo.create({
        id: crypto.randomUUID(),
        type: params.type || 'App\\Notifications\\OrderNotification',
        notifiableType: 'App\\Models\\User',
        notifiableId: params.userId,
        data: JSON.stringify({
          title: params.title,
          message: params.message,
          ...(params.data || {}),
        }),
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return await this.notificationRepo.save(notif);
    } catch (e: any) {
      console.warn(`[NotificationService] Failed to create notification: ${e.message}`);
      return null;
    }
  }

  async fetchNotifications(userId?: number) {
    const query = this.notificationRepo.createQueryBuilder('n');
    const targetUserId = userId && userId > 0 ? userId : 817;
    query.where('n.notifiable_id = :targetUserId OR n.notifiable_id = 0', { targetUserId });
    query.orderBy('n.created_at', 'DESC').limit(50);

    const items = await query.getMany();
    const unreadCount = items.filter((n) => !n.readAt).length;

    const formatted = items.map((n) => {
      let parsedData: any = {};
      try {
        parsedData = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
      } catch {
        parsedData = {};
      }

      return {
        id: n.id,
        type: n.type,
        title: parsedData?.title || 'Thông báo',
        message: parsedData?.message || parsedData?.content || '',
        is_read: !!n.readAt,
        created_at: n.createdAt,
        data: parsedData,
      };
    });

    return {
      success: true,
      notifications: formatted,
      unreadCount,
    };
  }

  async markAsRead(id: string) {
    await this.notificationRepo.update({ id }, { readAt: new Date() });
    return { success: true };
  }

  async markAllAsRead(userId?: number) {
    const targetUserId = userId && userId > 0 ? userId : 817;
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('(notifiable_id = :targetUserId OR notifiable_id = 0) AND read_at IS NULL', { targetUserId })
      .execute();
    return { success: true };
  }
}

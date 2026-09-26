import { Controller, Get, Post, Param, Body, Request, Headers, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { FcmService } from './fcm.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly fcmService: FcmService,
  ) {}

  /** GET /api/v1/notifications */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo' })
  async getNotifications(
    @Request() req: any,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId = req.user?.id ? Number(req.user.id) : undefined;
    if (!userId && (queryUserId || headerUserId)) {
      const parsed = Number(queryUserId || headerUserId);
      if (!isNaN(parsed) && parsed > 0) userId = parsed;
    }
    if (!userId && authHeader?.startsWith('Bearer ')) {
      try {
        const rawJwt = authHeader.replace('Bearer ', '').trim();
        const parts = rawJwt.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const parsed = Number(payload.sub || payload.id || payload.userId);
          if (!isNaN(parsed) && parsed > 0) userId = parsed;
        }
      } catch (_) {}
    }
    return this.notificationService.fetchNotifications(userId);
  }

  /** POST /api/v1/notifications/:id/mark-read */
  @Post(':id/mark-read')
  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  /** POST /api/v1/notifications/mark-all-read */
  @Post('mark-all-read')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  async markAllAsRead(
    @Request() req: any,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId = req.user?.id ? Number(req.user.id) : undefined;
    if (!userId && (queryUserId || headerUserId)) {
      const parsed = Number(queryUserId || headerUserId);
      if (!isNaN(parsed) && parsed > 0) userId = parsed;
    }
    return this.notificationService.markAllAsRead(userId);
  }

  /** POST /api/v1/notifications/register-token */
  @Post('register-token')
  @ApiOperation({ summary: 'Đăng ký FCM token' })
  async registerToken(
    @Body() body: any,
    @Request() req: any,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = body?.token || body?.fcm_token;
    let userId = req.user?.id ? Number(req.user.id) : undefined;

    if (!userId && (body?.user_id || body?.userId)) {
      userId = Number(body.user_id || body.userId);
    }

    // Fallback: Thử giải mã Bearer JWT token nếu có trong Authorization header
    if (!userId && authHeader?.startsWith('Bearer ')) {
      try {
        const rawJwt = authHeader.replace('Bearer ', '').trim();
        const parts = rawJwt.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          userId = payload.sub || payload.id || payload.userId;
          if (userId) userId = Number(userId);
        }
      } catch (_) {}
    }

    // Fallback: Gán cho user #817 (tài khoản đối tác test) nếu không kèm user_id
    const effectiveUserId = userId || 817;

    if (token) {
      await this.fcmService.saveUserToken(effectiveUserId, token);
      return { success: true, message: `FCM token registered for user #${effectiveUserId}`, user_id: effectiveUserId };
    }

    return { success: false, message: 'FCM token missing' };
  }

  /** POST /api/v1/notifications/test-push */
  @Post('test-push')
  @ApiOperation({ summary: 'Test gửi FCM push notification' })
  async testPush(@Body() body: any) {
    const title = body?.title || '[ĐƠN HÀNG MỚI] Kiểm tra Chuông & Push';
    const msg = body?.body || 'Hệ thống chuông báo và thông báo đơn hàng ToplistNA hoạt động chuẩn xác!';
    const data = body?.data || { test: 'true', type: 'order:new', isOrderAlert: 'true' };

    const targetUserId = body?.user_id ? Number(body.user_id) : (!body?.token ? 817 : undefined);

    if (targetUserId) {
      const ok = await this.fcmService.sendToUser(targetUserId, title, msg, data);
      return { success: ok, target: `user #${targetUserId}` };
    }

    if (body?.token) {
      const ok = await this.fcmService.sendToToken(body.token, title, msg, data);
      return { success: ok, target: `token` };
    }

    return { success: false, message: 'Vui lòng truyền user_id hoặc token để test' };
  }
}


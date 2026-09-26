import { Controller, Post, Get, Body, Request, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { Roles } from './guards/roles.decorator';

@ApiTags('Admin Auth')
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Post('auth/login')
  @ApiOperation({ summary: 'Đăng nhập tài khoản quản trị (tài khoản có sẵn trong database)' })
  async login(@Body() body: any, @Request() req: any) {
    const input = body.email || body.username || '';
    const password = body.password || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.adminAuthService.login(input, password, ip, userAgent);
  }

  @Get('auth/profile')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản admin hiện tại' })
  async getProfile(@Request() req: any) {
    return this.adminAuthService.getProfile(req.admin.sub);
  }

  @Post('auth/change-password')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu tài khoản admin' })
  async changePassword(@Body() body: any, @Request() req: any) {
    const oldPassword = body.oldPassword || body.current_password || '';
    const newPassword = body.newPassword || body.new_password || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.adminAuthService.changePassword(req.admin.sub, oldPassword, newPassword, ip, userAgent);
  }

  @Get('audit-logs')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem lịch sử thao tác của các Admin' })
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('source') source?: string,
  ) {
    return this.auditService.getLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      action,
      targetType,
      source,
    );
  }

  @Post('audit-logs/client')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ghi nhận sự kiện / log từ Frontend Client' })
  async logClientEvent(@Body() body: any, @Request() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    await this.auditService.logClientEvent({
      adminId: req.admin?.sub || req.admin?.id || 1,
      adminName: req.admin?.name || req.admin?.email || 'Admin',
      adminEmail: req.admin?.email || '',
      action: body.action || 'CLIENT_EVENT',
      targetType: body.targetType || 'FRONTEND_PAGE',
      targetId: body.targetId ? String(body.targetId) : undefined,
      description: body.description || 'Thao tác trên giao diện quản trị',
      payload: body.payload || null,
      ipAddress: ip,
      location: body.location || undefined,
      userAgent,
    });
    return { success: true };
  }
}

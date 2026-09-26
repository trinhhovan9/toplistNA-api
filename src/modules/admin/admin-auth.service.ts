import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin } from '../../entities/admin.entity';
import { AdminAuditService } from './admin-audit.service';

export interface AdminJwtPayload {
  sub: number;
  email: string;
  name: string;
  role: string;
  isDev: boolean;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    private readonly jwtService: JwtService,
    private readonly auditService: AdminAuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Đăng nhập Admin bằng tài khoản có sẵn trong CSDL (bảo tồn 100% dữ liệu cũ)
   */
  async login(loginInput: string, passwordPlain: string, ipAddress?: string, userAgent?: string) {
    const cleanInput = loginInput.trim().toLowerCase();

    // 1. Tìm tài khoản trong bảng admins
    const admin = await this.adminRepo
      .createQueryBuilder('admin')
      .where('LOWER(admin.email) = :input OR LOWER(admin.username) = :input', { input: cleanInput })
      .getOne();

    if (!admin) {
      throw new UnauthorizedException('Tài khoản hoặc mật khẩu quản trị không chính xác.');
    }

    if (admin.status !== 'active') {
      throw new UnauthorizedException('Tài khoản quản trị đang bị khóa hoặc tạm ngưng.');
    }

    // 2. Xác thực mật khẩu Bcrypt (hỗ trợ $2y$ của Laravel)
    const normalizedHash = admin.password.replace(/^\$2y\$/, '$2a$');
    const isPasswordValid = bcrypt.compareSync(passwordPlain, normalizedHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Tài khoản hoặc mật khẩu quản trị không chính xác.');
    }

    // 3. Lấy quyền / vai trò từ bảng roles hiện có
    let role = 'ADMIN';
    try {
      const rolesRes: any[] = await this.dataSource.query(
        `SELECT r.name FROM roles r
         JOIN model_has_roles m ON m.role_id = r.id
         WHERE m.model_id = ? AND m.model_type LIKE '%Admin%'
         LIMIT 1`,
        [admin.id],
      );
      if (rolesRes.length > 0) {
        const rawRole = rolesRes[0].name.toUpperCase();
        if (rawRole.includes('SUPER')) role = 'SUPER_ADMIN';
        else if (rawRole.includes('MANAGER')) role = 'MANAGER';
        else if (rawRole.includes('STAFF')) role = 'STAFF';
        else role = 'ADMIN';
      }
    } catch (_) {}

    if (admin.id === 1 || admin.isDev) {
      role = 'SUPER_ADMIN';
    }

    // 4. Tạo JWT Token (Access Token 8h, Refresh Token 7 ngày)
    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name || admin.username || 'Admin',
      role,
      isDev: !!admin.isDev,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // 5. Ghi Audit Log đăng nhập
    await this.auditService.log({
      adminId: admin.id,
      adminName: payload.name,
      adminEmail: admin.email,
      action: 'LOGIN',
      targetType: 'AUTH',
      targetId: admin.id,
      description: `Admin đăng nhập thành công (Vai trò: ${role})`,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        name: payload.name,
        email: admin.email,
        role,
        isDev: !!admin.isDev,
        status: admin.status,
      },
    };
  }

  /**
   * Lấy thông tin tài khoản admin hiện tại
   */
  async getProfile(adminId: number) {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Không tìm thấy tài khoản quản trị.');
    }

    let role = 'ADMIN';
    try {
      const rolesRes: any[] = await this.dataSource.query(
        `SELECT r.name FROM roles r
         JOIN model_has_roles m ON m.role_id = r.id
         WHERE m.model_id = ? AND m.model_type LIKE '%Admin%'
         LIMIT 1`,
        [admin.id],
      );
      if (rolesRes.length > 0) {
        const rawRole = rolesRes[0].name.toUpperCase();
        if (rawRole.includes('SUPER')) role = 'SUPER_ADMIN';
        else if (rawRole.includes('MANAGER')) role = 'MANAGER';
        else if (rawRole.includes('STAFF')) role = 'STAFF';
      }
    } catch (_) {}

    if (admin.id === 1 || admin.isDev) {
      role = 'SUPER_ADMIN';
    }

    return {
      success: true,
      admin: {
        id: admin.id,
        name: admin.name || admin.username || 'Admin',
        username: admin.username,
        email: admin.email,
        role,
        status: admin.status,
        isDev: !!admin.isDev,
        createdAt: admin.createdAt,
      },
    };
  }

  /**
   * Đổi mật khẩu cá nhân cho Admin
   */
  async changePassword(
    adminId: number,
    oldPasswordPlain: string,
    newPasswordPlain: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!newPasswordPlain || newPasswordPlain.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Tài khoản không tồn tại.');
    }

    const normalizedHash = admin.password.replace(/^\$2y\$/, '$2a$');
    const isOldValid = bcrypt.compareSync(oldPasswordPlain, normalizedHash);
    if (!isOldValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }

    // Hash mật khẩu mới bằng Bcrypt
    const salt = bcrypt.genSaltSync(12);
    const newHashedPassword = bcrypt.hashSync(newPasswordPlain, salt);

    await this.adminRepo.update({ id: adminId }, { password: newHashedPassword });

    await this.auditService.log({
      adminId: admin.id,
      adminName: admin.name || 'Admin',
      adminEmail: admin.email,
      action: 'CHANGE_PASSWORD',
      targetType: 'AUTH',
      targetId: admin.id,
      description: 'Admin đổi mật khẩu thành công',
      ipAddress,
      userAgent,
    });

    return { success: true, message: 'Đổi mật khẩu thành công.' };
  }
}

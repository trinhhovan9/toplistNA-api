import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(identifier: string, password: string) {
    // Tìm user theo email hoặc username (giống booking-na)
    const user = await this.userRepo.findOne({
      where: [{ email: identifier }, { username: identifier }],
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    const payload = { sub: user.id, username: user.username, email: user.email };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  sanitizeUser(user: User) {
    const { password, ...rest } = user as any;
    return {
      ...rest,
      id: Number(user.id),
      province_id: user.provinceId ? Number(user.provinceId) : null,
      is_partner: user.role === 'Đối tác' || user.partnerStatus === 'approved',
      partner_status: user.partnerStatus,
      isPartner: user.role === 'Đối tác' || user.partnerStatus === 'approved',
    };
  }
}

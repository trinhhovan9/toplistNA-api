import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu mã xác thực truy cập quản trị (Bearer Token).');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    try {
      const payload: any = this.jwtService.verify(token);
      if (payload && !payload.id && payload.sub) {
        payload.id = payload.sub;
      }
      request.admin = payload;
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập quản trị đã hết hạn hoặc không hợp lệ.');
    }
  }
}

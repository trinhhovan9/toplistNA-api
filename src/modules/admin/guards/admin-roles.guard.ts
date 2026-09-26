import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { admin } = context.switchToHttp().getRequest();
    if (!admin) {
      throw new ForbiddenException('Không có quyền truy cập chức năng này.');
    }

    // Super Admin luôn có quyền truy cập tất cả
    if (admin.role === 'SUPER_ADMIN' || admin.isDev) {
      return true;
    }

    const hasRole = requiredRoles.includes(admin.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Vai trò ${admin.role} không được phép thực hiện hành động này. Yêu cầu: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

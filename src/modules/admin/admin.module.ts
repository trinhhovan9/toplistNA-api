import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Admin } from '../../entities/admin.entity';
import { AdminAuditLog } from '../../entities/admin-audit-log.entity';
import { SettlementRecord } from '../../entities/settlement-record.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Payment } from '../../entities/payment.entity';
import { Listing } from '../../entities/listing.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Voucher } from '../../entities/voucher.entity';
import { Promotion } from '../../entities/promotion.entity';
import { PromotionItem } from '../../entities/promotion-item.entity';
import { User } from '../../entities/user.entity';
import { Review } from '../../entities/review.entity';
import { Notification } from '../../entities/notification.entity';
import { AppVersion } from '../../entities/app-version.entity';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminDataController } from './admin-data.controller';
import { AdminDataService } from './admin-data.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      AdminAuditLog,
      SettlementRecord,
      Order,
      OrderItem,
      Payment,
      Listing,
      MenuItem,
      Voucher,
      Promotion,
      PromotionItem,
      User,
      Review,
      Notification,
      AppVersion,
    ]),
    JwtModule.register({
      secret: process.env.ADMIN_JWT_SECRET || 'TOPLIST_ADMIN_SECURE_KEY_2026_VINH_NGHEAN',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AdminAuthController, AdminDataController],
  providers: [
    AdminAuthService,
    AdminAuditService,
    AdminDataService,
    AdminJwtGuard,
    AdminRolesGuard,
  ],
  exports: [
    AdminAuditService,
    AdminAuthService,
    AdminDataService,
    AdminJwtGuard,
    AdminRolesGuard,
  ],
})
export class AdminModule {}

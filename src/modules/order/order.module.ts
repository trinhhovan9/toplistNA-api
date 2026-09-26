import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderGateway } from './order.gateway';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Cart } from '../../entities/cart.entity';
import { CartItem } from '../../entities/cart-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Voucher } from '../../entities/voucher.entity';
import { Listing } from '../../entities/listing.entity';
import { User } from '../../entities/user.entity';
import { FireGoModule } from '../firego/firego.module';
import { NotificationModule } from '../notification/notification.module';
import { PromotionModule } from '../promotion/promotion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Cart, CartItem, MenuItem, Voucher, Listing, User]),
    forwardRef(() => FireGoModule),
    NotificationModule,
    PromotionModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderGateway],
  exports: [OrderGateway, OrderService],
})
export class OrderModule {}


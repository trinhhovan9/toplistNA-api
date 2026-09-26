import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { Listing } from '../../entities/listing.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Review } from '../../entities/review.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { User } from '../../entities/user.entity';
import { DeliveryEtaModule } from '../delivery-eta/delivery-eta.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing, MenuItem, Review, Order, OrderItem, User]),
    DeliveryEtaModule,
  ],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

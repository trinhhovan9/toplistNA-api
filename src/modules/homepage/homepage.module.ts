import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomepageController } from './homepage.controller';
import { HomepageService } from './homepage.service';
import { HomeFeedEngineService } from './home-feed-engine.service';
import { Listing } from '../../entities/listing.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { HotelRoom } from '../../entities/hotel-room.entity';
import { HotelReservation } from '../../entities/hotel-reservation.entity';
import { HomepageCollection } from '../../entities/homepage-collection.entity';
import { HomepageEvent } from '../../entities/homepage-event.entity';
import { PromotionModule } from '../promotion/promotion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      MenuItem,
      Order,
      OrderItem,
      HotelRoom,
      HotelReservation,
      HomepageCollection,
      HomepageEvent,
    ]),
    PromotionModule,
  ],
  controllers: [HomepageController],
  providers: [HomepageService, HomeFeedEngineService],
  exports: [HomeFeedEngineService],
})
export class HomepageModule {}

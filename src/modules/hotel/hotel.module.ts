import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { Listing } from '../../entities/listing.entity';
import { HotelRoom } from '../../entities/hotel-room.entity';
import { HotelReservation } from '../../entities/hotel-reservation.entity';
import { HotelFloor } from '../../entities/hotel-floor.entity';
import { HotelPhysicalRoom } from '../../entities/hotel-physical-room.entity';
import { StoreWalletModule } from '../store-wallet/store-wallet.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      HotelRoom,
      HotelReservation,
      HotelFloor,
      HotelPhysicalRoom,
    ]),
    StoreWalletModule,
    NotificationModule,
    forwardRef(() => OrderModule),
  ],
  controllers: [HotelController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}

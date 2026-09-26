import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableBookingController } from './table-booking.controller';
import { TableBookingService } from './table-booking.service';
import { RestaurantReservation } from '../../entities/restaurant-reservation.entity';
import { Listing } from '../../entities/listing.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RestaurantReservation, Listing])],
  controllers: [TableBookingController],
  providers: [TableBookingService],
})
export class TableBookingModule {}

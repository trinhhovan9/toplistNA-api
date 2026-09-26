import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestaurantReservation } from '../../entities/restaurant-reservation.entity';
import { Listing } from '../../entities/listing.entity';

function generateBookingCode(): string {
  return `TB${Math.floor(100000 + Math.random() * 900000)}`;
}

@Injectable()
export class TableBookingService {
  constructor(
    @InjectRepository(RestaurantReservation)
    private readonly reservationRepo: Repository<RestaurantReservation>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  async create(
    userId: number,
    listingId: number,
    customerName: string,
    phoneNumber: string,
    email: string,
    guestCount: number,
    reservationDate: string,
    reservationTime: string,
    area?: string,
    note?: string,
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Quán ăn không tồn tại');

    const reservationDateTime = new Date(`${reservationDate}T${reservationTime}:00`);

    const reservation = this.reservationRepo.create({
      listingId,
      userId,
      customerName,
      phoneNumber,
      email,
      guestCount,
      reservationTime: reservationDateTime,
      area,
      notes: note,
      status: 'pending',
      bookingCode: generateBookingCode(),
    });

    const saved = await this.reservationRepo.save(reservation);

    return {
      reservation_id: saved.id,
      booking_code: saved.bookingCode,
      listing_name: listing.name,
      listing_address: listing.address,
      customer_name: customerName,
      guest_count: guestCount,
      reservation_time: reservationDateTime,
      area,
      status: 'pending',
      message: 'Đặt bàn thành công! Đang chờ xác nhận từ nhà hàng.',
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    userId: number | null,
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
      userId: userId ? Number(userId) : null as any,
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

  async getMyTableBookings(filter: { userId?: number; phone?: string }) {
    const qb = this.reservationRepo.createQueryBuilder('r')
      .orderBy('r.id', 'DESC');

    const conditions: string[] = [];
    const params: any = {};

    if (filter.userId && Number(filter.userId) > 0) {
      conditions.push('r.user_id = :userId');
      params.userId = Number(filter.userId);
    }
    if (filter.phone) {
      const cleanPhone = filter.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 7) {
        conditions.push("REPLACE(REPLACE(r.phone_number, ' ', ''), '-', '') LIKE :phone");
        params.phone = `%${cleanPhone.slice(-9)}%`;
      }
    }

    if (conditions.length === 0) {
      return [];
    }

    qb.where(`(${conditions.join(' OR ')})`, params);
    const reservations = await qb.getMany();
    if (!reservations.length) return [];

    const listingIds = Array.from(new Set(reservations.map(r => Number(r.listingId)).filter(Boolean)));
    let listingMap = new Map<number, Listing>();
    if (listingIds.length > 0) {
      const listings = await this.listingRepo.find({ where: { id: In(listingIds) } });
      listingMap = new Map(listings.map(l => [Number(l.id), l]));
    }

    return reservations.map(r => {
      const listing = listingMap.get(Number(r.listingId));
      return {
        id: Number(r.id),
        order_id: Number(r.id),
        order_type: 'restaurant',
        type: 'restaurant',
        id_code: r.bookingCode || `TB${r.id}`,
        booking_code: r.bookingCode || `TB${r.id}`,
        full_name: r.customerName,
        phone: r.phoneNumber,
        place: listing?.name || 'Nhà hàng Toplist',
        address: listing?.address || 'Nghệ An, Việt Nam',
        guest_count: r.guestCount || 1,
        area: r.area || 'Bàn chung',
        reservation_time: r.reservationTime,
        date: r.reservationTime ? new Date(r.reservationTime).toISOString().replace('T', ' ').slice(0, 16) : '',
        price: 'Miễn phí đặt chỗ',
        status: r.status || 'pending',
        notes: r.notes,
        created_at: r.createdAt,
      };
    });
  }

  async cancelTableBooking(id: number) {
    const reservation = await this.reservationRepo.findOne({ where: { id } });
    if (!reservation) throw new NotFoundException('Không tìm thấy lịch đặt bàn');
    reservation.status = 'cancelled';
    await this.reservationRepo.save(reservation);
    return { success: true, message: 'Đã hủy lịch đặt bàn thành công' };
  }
}


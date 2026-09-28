// Ánh xạ bảng `restaurant_reservations` đã có trong database
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('restaurant_reservations')
export class RestaurantReservation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'listing_id', type: 'bigint' })
  listingId: number;

  @Column({ name: 'user_id', nullable: true, type: 'bigint' })
  userId: number;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column({ name: 'phone_number' })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  @Column({ name: 'number_of_guests', nullable: true, type: 'int' })
  guestCount: number;

  @Column({ name: 'reservation_time', nullable: true })
  reservationTime: Date;

  @Column({ name: 'note', nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, default: 'pending' })
  status: string;

  // Cột mới (thêm bởi migration mới – nullable để an toàn)
  @Column({ name: 'booking_code', nullable: true })
  bookingCode: string;

  @Column({ nullable: true })
  area: string;

  @Column({ name: 'confirmed_at', nullable: true })
  confirmedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

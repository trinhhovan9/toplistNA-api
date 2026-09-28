// Ánh xạ bảng `hotel_reservations` đã có trong database booking-na
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('hotel_reservations')
export class HotelReservation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'booking_code', nullable: true })
  bookingCode: string;

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

  @Column({ name: 'checkin_date', nullable: true, type: 'date' })
  checkinDate: Date;

  @Column({ name: 'checkout_date', nullable: true, type: 'date' })
  checkoutDate: Date;

  @Column({ name: 'date_of_arrival', nullable: true, type: 'date' })
  dateOfArrival: Date;

  @Column({ name: 'checkin_time', nullable: true, type: 'time' })
  checkinTime: string;

  @Column({ name: 'number_of_nights', default: 1, type: 'int' })
  numberOfNights: number;

  @Column({ name: 'number_of_rooms', default: 1, type: 'int' })
  numberOfRooms: number;

  @Column({ nullable: true, type: 'int', default: 1 })
  adults: number;

  @Column({ nullable: true, type: 'int', default: 0 })
  children: number;

  @Column({ name: 'room_type', nullable: true, type: 'bigint' })
  roomType: number;

  @Column({ name: 'physical_room_id', nullable: true, type: 'int' })
  physicalRoomId?: number;

  @Column({ name: 'room_number', nullable: true })
  roomNumber?: string;

  @Column({ name: 'room_price', default: 0, type: 'int' })
  roomPrice: number;

  @Column({ name: 'gross_amount', default: 0, type: 'int' })
  grossAmount: number;

  @Column({ name: 'discount_amount', default: 0, type: 'int' })
  discountAmount: number;

  @Column({ name: 'commission_rate', default: 15, type: 'int' })
  commissionRate: number;

  @Column({ name: 'commission_amount', default: 0, type: 'int' })
  commissionAmount: number;

  @Column({ name: 'customer_payable', default: 0, type: 'int' })
  customerPayable: number;

  @Column({ name: 'hotel_net_amount', default: 0, type: 'int' })
  hotelNetAmount: number;

  @Column({ name: 'financial_breakdown', nullable: true, type: 'longtext' })
  financialBreakdown: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, default: 'pending' })
  status: string;

  // Các cột cọc & thanh toán
  @Column({ name: 'deposit_method', nullable: true })
  depositMethod: string;

  @Column({ name: 'deposit_percentage', nullable: true, type: 'int' })
  depositPercentage: number;

  @Column({ name: 'deposit_amount', nullable: true, type: 'bigint' })
  depositAmount: number;

  @Column({ name: 'total_price', nullable: true, type: 'bigint' })
  totalPrice: number;

  @Column({ name: 'payment_status', nullable: true, default: 'pending' })
  paymentStatus: string;

  @Column({ name: 'payment_transaction_id', nullable: true })
  paymentTransactionId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

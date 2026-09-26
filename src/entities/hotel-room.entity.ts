// Ánh xạ bảng `hotel_rooms` đã có trong database booking-na
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('hotel_rooms')
export class HotelRoom {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'listing_id', type: 'bigint' })
  listingId: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, type: 'int' })
  price: number;

  @Column({ name: 'original_price', nullable: true, type: 'int' })
  originalPrice?: number;

  @Column({ nullable: true, type: 'int' })
  capacity: number;

  @Column({ name: 'total_rooms', default: 5, type: 'int' })
  totalRooms: number;

  @Column({ name: 'bed_type', nullable: true })
  bedType?: string;

  @Column({ nullable: true, type: 'text' })
  amenities?: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ name: 'is_available', nullable: true, default: true })
  isAvailable: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

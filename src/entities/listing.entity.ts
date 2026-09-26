// Ánh xạ bảng `listings` đã có trong database booking-na
// KHÔNG sửa cấu trúc bảng này
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('listings')
export class Listing {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  type: string;

  @Column({ name: 'latitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  latitude: number;

  @Column({ name: 'longitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  longitude: number;

  @Column({ name: 'price_min', nullable: true, type: 'int' })
  priceMin: number;

  @Column({ name: 'price_max', nullable: true, type: 'int' })
  priceMax: number;

  @Column({ name: 'rating_avg', nullable: true, type: 'decimal', precision: 3, scale: 1 })
  ratingAvg: number;

  @Column({ name: 'rating_count', nullable: true, type: 'int', default: 0 })
  ratingCount: number;

  @Column({ nullable: true })
  status: string;

  @Column({ name: 'thumb', nullable: true })
  thumb: string;

  @Column({ name: 'images', nullable: true, type: 'text' })
  images: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ name: 'content', nullable: true, type: 'longtext' })
  content: string;

  @Column({ name: 'phone', nullable: true })
  phone: string;

  @Column({ name: 'owner_user_id', nullable: true, type: 'bigint' })
  ownerUserId: number;

  @Column({ name: 'district_id', nullable: true, type: 'bigint' })
  districtId: number;

  @Column({ name: 'is_featured', nullable: true, default: false })
  isFeatured: boolean;

  @Column({ name: 'json_params', nullable: true, type: 'json' })
  jsonParams: object;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

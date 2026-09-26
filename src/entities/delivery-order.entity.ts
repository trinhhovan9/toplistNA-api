// Bảng `delivery_orders` – BẢNG MỚI (đơn giao hàng hộ/ship hộ)
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('delivery_orders')
export class DeliveryOrder {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'order_code', unique: true })
  orderCode: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'pickup_address' })
  pickupAddress: string;

  @Column({ name: 'pickup_latitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  pickupLatitude: number;

  @Column({ name: 'pickup_longitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  pickupLongitude: number;

  @Column({ name: 'delivery_address' })
  deliveryAddress: string;

  @Column({ name: 'delivery_latitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  deliveryLatitude: number;

  @Column({ name: 'delivery_longitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  deliveryLongitude: number;

  @Column({ name: 'package_type', nullable: true })
  packageType: string;

  @Column({ name: 'package_weight', nullable: true })
  packageWeight: string;

  @Column({ name: 'recipient_name' })
  recipientName: string;

  @Column({ name: 'recipient_phone' })
  recipientPhone: string;

  @Column({ nullable: true, type: 'text' })
  note: string;

  @Column({ name: 'distance_km', nullable: true, type: 'decimal', precision: 5, scale: 2 })
  distanceKm: number;

  @Column({ nullable: true, type: 'int' })
  fare: number;

  @Column({ name: 'duration_minutes', nullable: true, type: 'int' })
  durationMinutes: number;

  @Column({ name: 'vehicle_type', default: 'motorbike' }) // 'motorbike' | 'truck'
  vehicleType: string;

  @Column({ default: 'created' })
  // 'created' | 'searching' | 'accepted' | 'shipping' | 'completed' | 'cancelled'
  status: string;

  @Column({ name: 'driver_id', nullable: true, type: 'bigint' })
  driverId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

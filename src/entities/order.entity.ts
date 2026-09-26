// Bảng `orders` – BẢNG MỚI
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'order_code', unique: true })
  orderCode: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'listing_id', type: 'bigint' })
  listingId: number;

  @Column({ name: 'delivery_address' })
  deliveryAddress: string;

  @Column({ name: 'delivery_latitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  deliveryLatitude: number;

  @Column({ name: 'delivery_longitude', nullable: true, type: 'decimal', precision: 20, scale: 17 })
  deliveryLongitude: number;

  @Column({ name: 'distance_km', nullable: true, type: 'decimal', precision: 5, scale: 2 })
  distanceKm: number;

  @Column({ name: 'duration_minutes', nullable: true, type: 'int' })
  durationMinutes: number;

  @Column({ name: 'pricing_version', nullable: true, length: 50 })
  pricingVersion: string;

  @Column({ name: 'vehicle_type', nullable: true, length: 30, default: 'bike' })
  vehicleType: string;

  @Column({ name: 'service_type', nullable: true, length: 50, default: 'food_delivery' })
  serviceType: string;

   @Column({ name: 'pricing_breakdown', nullable: true, type: 'longtext' })
  pricingBreakdown: string;

  @Column({ name: 'original_subtotal', type: 'int', default: 0 })
  originalSubtotal: number;

  @Column({ name: 'promotion_discount', type: 'int', default: 0 })
  promotionDiscount: number;

  @Column({ name: 'store_discount', type: 'int', default: 0 })
  storeDiscount: number;

  @Column({ name: 'platform_discount', type: 'int', default: 0 })
  platformDiscount: number;

  @Column({ name: 'food_total', type: 'int', default: 0 })
  foodTotal: number;

  @Column({ type: 'int', default: 0 })
  subtotal: number;

  @Column({ name: 'shipping_fee', type: 'int', default: 0 })
  shippingFee: number;

  @Column({ name: 'discount_amount', type: 'int', default: 0 })
  discountAmount: number;

  @Column({ name: 'total_amount', type: 'int', default: 0 })
  totalAmount: number;

  @Column({ name: 'store_subsidy', type: 'int', default: 0 })
  storeSubsidy: number;

  @Column({ name: 'platform_subsidy', type: 'int', default: 0 })
  platformSubsidy: number;

  @Column({ name: 'merchant_payable', type: 'int', default: 0 })
  merchantPayable: number;

  @Column({ name: 'financial_breakdown', nullable: true, type: 'longtext' })
  financialBreakdown: string;

  @Column({ nullable: true })
  note: string;

  @Column({ name: 'payment_method', default: 'cash' })
  paymentMethod: string;

  @Column({ name: 'payment_status', default: 'pending' })
  paymentStatus: string;

  @Column({ name: 'order_status', default: 'pending' })
  orderStatus: string;

  @Column({ name: 'driver_id', nullable: true, type: 'bigint' })
  driverId: number;

  @Column({ name: 'firego_delivery_id', nullable: true, length: 64 })
  firegoDeliveryId: string;

  @Column({ name: 'firego_driver_id', nullable: true, length: 64 })
  firegoDriverId: string;

  @Column({ name: 'driver_name', nullable: true, length: 100 })
  driverName: string;

  @Column({ name: 'driver_phone', nullable: true, length: 30 })
  driverPhone: string;

  @Column({ name: 'driver_plate', nullable: true, length: 30 })
  driverPlate: string;

  @Column({ name: 'driver_vehicle', nullable: true, length: 50 })
  driverVehicle: string;

  @Column({ name: 'driver_avatar', nullable: true, length: 500 })
  driverAvatar: string;

  @Column({ name: 'driver_rating', nullable: true, type: 'decimal', precision: 3, scale: 2 })
  driverRating: number;

  @OneToMany(() => OrderItem, (item) => item.order, { eager: true })
  items: OrderItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('settlement_records')
export class SettlementRecord {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId: number;

  @Column({ name: 'restaurant_id', type: 'bigint', unsigned: true })
  restaurantId: number;

  @Column({ name: 'order_code', type: 'varchar', length: 50 })
  orderCode: string;

  @Column({ name: 'gross_amount', type: 'int', default: 0 })
  grossAmount: number;

  @Column({ name: 'store_discount', type: 'int', default: 0 })
  storeDiscount: number;

  @Column({ name: 'platform_subsidy', type: 'int', default: 0 })
  platformSubsidy: number;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  commissionRate: number;

  @Column({ name: 'commission_amount', type: 'int', default: 0 })
  commissionAmount: number;

  @Column({ name: 'payment_fee', type: 'int', default: 0 })
  paymentFee: number;

  @Column({ name: 'refund_amount', type: 'int', default: 0 })
  refundAmount: number;

  @Column({ name: 'restaurant_payable', type: 'int', default: 0 })
  restaurantPayable: number;

  @Column({ type: 'enum', enum: ['pending', 'verified', 'paid', 'disputed'], default: 'pending' })
  status: string;

  @Column({ name: 'settlement_period', type: 'varchar', length: 20, nullable: true })
  settlementPeriod: string;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

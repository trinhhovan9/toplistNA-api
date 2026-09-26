import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  @Column({ name: 'order_code', length: 32 })
  orderCode: string;

  @Column({ name: 'transaction_id', length: 64, unique: true })
  transactionId: string;

  @Column({ length: 30 })
  provider: string; // 'vnpay' | 'momo' | 'zalopay' | 'sepay_vietqr'

  @Column({ type: 'int' })
  amount: number;

  @Column({ length: 30, default: 'pending' })
  status: string; // 'pending' | 'paid' | 'failed' | 'expired'

  @Column({ name: 'provider_transaction_id', length: 100, nullable: true })
  providerTransactionId: string;

  @Column({ name: 'payment_url', type: 'text', nullable: true })
  paymentUrl: string;

  @Column({ name: 'qr_code_url', type: 'text', nullable: true })
  qrCodeUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ type: 'longtext', nullable: true })
  metadata: string;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum StoreWalletTransactionType {
  ORDER_REVENUE_PENDING = 'ORDER_REVENUE_PENDING', // Doanh thu đơn hàng ghi vào Ví Chờ đối soát
  PENDING_SETTLED = 'PENDING_SETTLED',             // Đối soát chuyển từ Ví Chờ sang Ví Khả Dụng
  ORDER_REVENUE = 'ORDER_REVENUE',                 // Doanh thu trực tiếp
  WITHDRAWAL = 'WITHDRAWAL',                       // Lệnh rút tiền về ngân hàng
  WITHDRAWAL_REFUND = 'WITHDRAWAL_REFUND',         // Hoàn tiền rút thất bại
  ADJUSTMENT = 'ADJUSTMENT',                       // Điều chỉnh kế toán
  PROPERTY_COLLECT_COMMISSION_DEBT = 'PROPERTY_COLLECT_COMMISSION_DEBT', // Ghi nhận công nợ hoa hồng phòng trả tại chỗ (Property Collect)
  COMMISSION_AUTO_DEDUCTION = 'COMMISSION_AUTO_DEDUCTION',               // Tự động khấu trừ công nợ hoa hồng từ booking thanh toán trước / số dư ví
  DEBT_REPAYMENT = 'DEBT_REPAYMENT',                                     // Thanh toán nộp công nợ hoa hồng qua VietQR
}

@Entity('store_wallet_transactions')
export class StoreWalletTransaction {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Index()
  @Column({ name: 'wallet_id', type: 'bigint', unsigned: true })
  walletId: number;

  @Index()
  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId: number;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId: number;

  @Column({ name: 'order_code', type: 'varchar', length: 50, nullable: true })
  orderCode: string;

  @Column({ type: 'enum', enum: StoreWalletTransactionType })
  type: StoreWalletTransactionType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ name: 'balance_before', type: 'int' })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter: number;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

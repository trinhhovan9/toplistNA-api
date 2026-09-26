import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('store_wallets')
export class StoreWallet {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true, unique: true })
  storeId: number;

  @Column({ type: 'int', default: 0 })
  balance: number; // Số dư khả dụng có thể rút

  @Column({ name: 'pending_balance', type: 'int', default: 0 })
  pendingBalance: number; // Ví chờ: Số dư đơn hàng mới hoàn thành chờ đối soát / bảo lưu

  @Column({ name: 'held_balance', type: 'int', default: 0 })
  heldBalance: number; // Số dư đang chờ xử lý rút tiền

  @Column({ name: 'debt_balance', type: 'int', default: 0 })
  debtBalance: number; // Ví công nợ hoa hồng: Số nợ hoa hồng sàn từ đơn khách thanh toán tại khách sạn (Property Collect)

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string;

  @Column({ name: 'bank_account_number', type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string;

  @Column({ name: 'bank_account_holder', type: 'varchar', length: 100, nullable: true })
  bankAccountHolder: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

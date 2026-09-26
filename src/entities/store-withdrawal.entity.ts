import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum StoreWithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Entity('store_withdrawals')
export class StoreWithdrawal {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'wallet_id', type: 'bigint', unsigned: true })
  walletId: number;

  @Index()
  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId: number;

  @Column({ type: 'int' })
  amount: number;

  @Column({ name: 'bank_name', type: 'varchar', length: 100 })
  bankName: string;

  @Column({ name: 'bank_account_number', type: 'varchar', length: 50 })
  bankAccountNumber: string;

  @Column({ name: 'bank_account_holder', type: 'varchar', length: 100 })
  bankAccountHolder: string;

  @Column({ type: 'enum', enum: StoreWithdrawalStatus, default: StoreWithdrawalStatus.PENDING })
  status: StoreWithdrawalStatus;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 255, nullable: true })
  rejectionReason: string;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

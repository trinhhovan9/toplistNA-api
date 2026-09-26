// Bảng `vouchers` – BẢNG MỚI
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ name: 'discount_type' }) // 'percentage' | 'fixed'
  discountType: string;

  @Column({ name: 'discount_value', type: 'int' })
  discountValue: number;

  @Column({ name: 'min_order_value', type: 'int', default: 0 })
  minOrderValue: number;

  @Column({ name: 'max_discount', nullable: true, type: 'int' })
  maxDiscount: number;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ default: 'active' }) // 'active' | 'inactive'
  status: string;

  @Column({ name: 'listing_id', nullable: true, type: 'int' })
  listingId?: number;

  @Column({ name: 'funded_by', default: 'PLATFORM' })
  fundedBy: string; // 'PLATFORM' | 'STORE' | 'SPLIT'

  @Column({ name: 'store_share_pct', type: 'int', default: 0 })
  storeSharePct: number;

  @Column({ name: 'platform_share_pct', type: 'int', default: 100 })
  platformSharePct: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'usage_limit', nullable: true, type: 'int' })
  usageLimit?: number;

  @Column({ name: 'applicable_type', default: 'all' }) // 'all' | 'specific_dishes'
  applicableType: string;

  @Column({ name: 'applicable_dish_ids', nullable: true, type: 'text' })
  applicableDishIds?: string;

  @Column({ name: 'applicable_dish_names', nullable: true, type: 'text' })
  applicableDishNames?: string;

  @Column({ name: 'used_count', default: 0, type: 'int' })
  usedCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

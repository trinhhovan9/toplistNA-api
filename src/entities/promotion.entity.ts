import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PromotionItem } from './promotion-item.entity';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'store_id', type: 'bigint' })
  storeId: number;

  @Column()
  name: string;

  @Column({ default: 'flash_sale' })
  type: string; // 'flash_sale', 'shop_discount', etc.

  @Column({ name: 'start_at', type: 'datetime' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime' })
  endAt: Date;

  @Column({ default: 'active' })
  status: string; // 'active', 'inactive', 'expired'

  @Column({ name: 'banner_color', default: '#E53935' })
  bannerColor: string;

  @Column({ name: 'funding_source', default: 'STORE' })
  fundingSource: string; // 'STORE', 'PLATFORM', 'SPLIT'

  @Column({ name: 'store_share_pct', type: 'int', default: 100 })
  storeSharePct: number;

  @Column({ name: 'platform_share_pct', type: 'int', default: 0 })
  platformSharePct: number;

  @OneToMany(() => PromotionItem, (item) => item.promotion, { cascade: true })
  items: PromotionItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

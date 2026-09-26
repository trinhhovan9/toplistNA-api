import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Promotion } from './promotion.entity';

@Entity('promotion_items')
export class PromotionItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'promotion_id', type: 'bigint' })
  promotionId: number;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: number; // menuItemId

  @Column({ name: 'original_price', type: 'int' })
  originalPrice: number;

  @Column({ name: 'sale_price', type: 'int' })
  salePrice: number;

  @Column({ name: 'max_quantity', type: 'int', default: 0 })
  maxQuantity: number; // 0 = unlimited

  @Column({ name: 'reserved_quantity', type: 'int', default: 0 })
  reservedQuantity: number;

  @Column({ name: 'sold_quantity', type: 'int', default: 0 })
  soldQuantity: number;

  @Column({ default: 'active' })
  status: string;

  @ManyToOne(() => Promotion, (promo) => promo.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// Bảng `order_items` – BẢNG MỚI
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  @Column({ name: 'menu_item_id', type: 'bigint' })
  menuItemId: number;

  @Column() // Lưu tên tại thời điểm mua (snapshot)
  name: string;

  @Column({ name: 'original_price', type: 'int', default: 0 })
  originalPrice: number;

  @Column({ type: 'int' }) // Lưu giá thực tế tại thời điểm mua (snapshot)
  price: number;

  @Column({ name: 'discount_amount', type: 'int', default: 0 })
  discountAmount: number;

  @Column({ name: 'promotion_id', nullable: true, type: 'bigint' })
  promotionId: number | null;

  @Column({ name: 'promotion_type', type: 'varchar', length: 50, nullable: true })
  promotionType: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ nullable: true })
  note: string;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

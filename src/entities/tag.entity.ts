// Ánh xạ bảng `tags` có sẵn trong database bookingna
// KHÔNG sửa cấu trúc bảng này trong DB
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ name: 'count_used', nullable: true, type: 'int', default: 0 })
  countUsed: number;

  @Column({ nullable: true })
  status: string;

  @Column({ name: 'admin_created_id', nullable: true, type: 'bigint' })
  adminCreatedId: number;

  @Column({ name: 'admin_updated_id', nullable: true, type: 'bigint' })
  adminUpdatedId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'int', default: 5 })
  rating: number;

  @Column({ default: 'approved' })
  status: string;

  @Column({ name: 'target_type', default: 'listings' })
  targetType: string;

  @Column({ name: 'target_id', type: 'bigint' })
  targetId: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: number;

  @Column({ name: 'assigned_admin_id', type: 'bigint', nullable: true })
  assignedAdminId: number;

  @Column({ name: 'json_params', type: 'json', nullable: true })
  jsonParams: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

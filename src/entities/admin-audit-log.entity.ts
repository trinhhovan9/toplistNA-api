import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'admin_id', type: 'bigint', unsigned: true })
  adminId: number;

  @Column({ name: 'admin_name', type: 'varchar', length: 255, nullable: true })
  adminName?: string | null;

  @Column({ name: 'admin_email', type: 'varchar', length: 255, nullable: true })
  adminEmail?: string | null;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'varchar', length: 50, default: 'BACKEND_API' })
  source: string;

  @Column({ name: 'target_type', type: 'varchar', length: 100 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 100, nullable: true })
  targetId?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ name: 'before_data', type: 'json', nullable: true })
  beforeData?: any;

  @Column({ name: 'after_data', type: 'json', nullable: true })
  afterData?: any;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'TP. Vinh, Nghệ An, VN' })
  location?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

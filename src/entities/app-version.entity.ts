import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_versions')
export class AppVersion {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ length: 30 })
  platform: string; // 'ios' | 'android'

  @Column({ length: 50 })
  version: string; // e.g. '1.2.0'

  @Column({ name: 'build_number', type: 'int', default: 1 })
  buildNumber: number;

  @Column({ name: 'force_update', default: false })
  forceUpdate: boolean;

  @Column({ name: 'update_url', type: 'varchar', length: 500, nullable: true })
  updateUrl: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

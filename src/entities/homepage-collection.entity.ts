import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('homepage_collections')
export class HomepageCollection {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'collection_key', unique: true, length: 64 })
  collectionKey: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 255, nullable: true })
  subtitle: string;

  @Column({ length: 100, nullable: true })
  badge: string;

  @Column({ name: 'banner_color', length: 50, nullable: true })
  bannerColor: string;

  @Column({ name: 'banner_url', length: 500, nullable: true })
  bannerUrl: string;

  @Column({ name: 'is_enabled', type: 'tinyint', default: 1 })
  isEnabled: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'int', default: 50 })
  priority: number;

  @Column({ name: 'ui_type', length: 50, default: 'FOOD_CAROUSEL' })
  uiType: string;

  @Column({ name: 'source_type', length: 50, default: 'FLASH_SALE' })
  sourceType: string;

  @Column({ name: 'ranking_mode', length: 50, default: 'HYBRID' })
  rankingMode: string;

  @Column({ name: 'display_limit', type: 'int', default: 10 })
  displayLimit: number;

  @Column({ name: 'filter_params', type: 'json', nullable: true })
  filterParams: Record<string, any>;

  @Column({ name: 'start_at', type: 'datetime', nullable: true })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime', nullable: true })
  endAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', length: 100, nullable: true })
  createdBy: string;

  @Column({ name: 'updated_by', length: 100, nullable: true })
  updatedBy: string;
}

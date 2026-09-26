// Ánh xạ bảng `categories` có sẵn trong database bookingna
// KHÔNG sửa cấu trúc bảng này trong DB
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  alias: string;

  @Column({ name: 'parent_id', nullable: true, type: 'bigint' })
  parentId: number;

  @Column({ name: 'json_params', nullable: true, type: 'json' })
  jsonParams: any;

  @Column({ name: 'meta_description', nullable: true, type: 'text' })
  metaDescription: string;

  @Column({ name: 'seo_content', nullable: true, type: 'text' })
  seoContent: string;

  @Column({ name: 'faqs', nullable: true, type: 'json' })
  faqs: any;

  @Column({ name: 'show_read_more', nullable: true, type: 'int' })
  showReadMore: number;

  @Column({ name: 'sidebar_config', nullable: true, type: 'json' })
  sidebarConfig: any;

  @Column({ name: 'is_featured', nullable: true, default: false })
  isFeatured: boolean;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true, type: 'int' })
  iorder: number;

  @Column({ nullable: true, type: 'int', default: 0 })
  viewcount: number;

  @Column({ name: 'admin_created_id', nullable: true, type: 'bigint' })
  adminCreatedId: number;

  @Column({ name: 'admin_updated_id', nullable: true, type: 'bigint' })
  adminUpdatedId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

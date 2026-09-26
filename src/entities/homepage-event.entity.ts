import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('homepage_events')
export class HomepageEvent {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Index()
  @Column({ name: 'event_name', length: 64 })
  eventName: string;

  @Index()
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number;

  @Index()
  @Column({ name: 'anonymous_device_id', length: 128, nullable: true })
  anonymousDeviceId: string;

  @Column({ name: 'feed_session_id', length: 128, nullable: true })
  feedSessionId: string;

  @Index()
  @Column({ name: 'collection_key', length: 64, nullable: true })
  collectionKey: string;

  @Column({ name: 'item_id', type: 'int', nullable: true })
  itemId: number;

  @Column({ name: 'restaurant_id', type: 'int', nullable: true })
  restaurantId: number;

  @Column({ type: 'int', nullable: true })
  position: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('hotel_physical_rooms')
export class HotelPhysicalRoom {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'listing_id', type: 'bigint' })
  listingId: number;

  @Column({ name: 'floor_id', type: 'bigint' })
  floorId: number;

  @Column({ name: 'room_type_id', type: 'bigint' })
  roomTypeId: number;

  @Column({ name: 'room_number', type: 'varchar', length: 50 })
  roomNumber: string;

  @Column({ type: 'varchar', length: 50, default: 'available' })
  status: string; // 'available' | 'occupied' | 'booked' | 'cleaning' | 'maintenance'

  @Column({ name: 'clean_status', type: 'varchar', length: 50, default: 'clean' })
  cleanStatus: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

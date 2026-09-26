import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipController } from './ship.controller';
import { ShipService } from './ship.service';
import { DeliveryOrder } from '../../entities/delivery-order.entity';
import { FireGoModule } from '../firego/firego.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryOrder]), forwardRef(() => FireGoModule)],
  controllers: [ShipController],
  providers: [ShipService],
})
export class ShipModule {}

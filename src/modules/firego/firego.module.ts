import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { Listing } from '../../entities/listing.entity';
import { User } from '../../entities/user.entity';
import { FireGoService } from './firego.service';
import { FireGoController } from './firego.controller';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';
import { StoreWalletModule } from '../store-wallet/store-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Listing, User]),
    forwardRef(() => OrderModule),
    NotificationModule,
    StoreWalletModule,
  ],
  controllers: [FireGoController],
  providers: [FireGoService],
  exports: [FireGoService],
})
export class FireGoModule {}


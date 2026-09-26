import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreWallet } from '../../entities/store-wallet.entity';
import { StoreWalletTransaction } from '../../entities/store-wallet-transaction.entity';
import { StoreWithdrawal } from '../../entities/store-withdrawal.entity';
import { StoreWalletService } from './store-wallet.service';
import { StoreWalletController } from './store-wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreWallet,
      StoreWalletTransaction,
      StoreWithdrawal,
    ]),
  ],
  providers: [StoreWalletService],
  controllers: [StoreWalletController],
  exports: [StoreWalletService],
})
export class StoreWalletModule {}

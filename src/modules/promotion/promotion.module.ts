import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from '../../entities/promotion.entity';
import { PromotionItem } from '../../entities/promotion-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Listing } from '../../entities/listing.entity';
import { PromotionService } from './promotion.service';
import { PromotionController } from './promotion.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Promotion, PromotionItem, MenuItem, Listing]),
  ],
  controllers: [PromotionController],
  providers: [PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}

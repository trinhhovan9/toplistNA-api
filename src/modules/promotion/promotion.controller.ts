import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { PromotionService } from './promotion.service';

@Controller('promotions')
export class PromotionController {
  constructor(private readonly promoService: PromotionService) {}

  @Get('active')
  async getActiveFlashSales(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 10;
    const items = await this.promoService.getPublicFlashSales(lim);
    return {
      success: true,
      data: items,
    };
  }

  @Get('store/:storeId')
  async getStorePromotions(@Param('storeId', ParseIntPipe) storeId: number) {
    const promotions = await this.promoService.getActivePromotionsForStore(storeId);
    return {
      success: true,
      data: promotions,
    };
  }
}

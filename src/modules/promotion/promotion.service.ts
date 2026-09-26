import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Promotion } from '../../entities/promotion.entity';
import { PromotionItem } from '../../entities/promotion-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Listing } from '../../entities/listing.entity';
import { getFoodImageByDishName } from '../../common/utils/food-image.util';

export interface ActiveDishPromotion {
  promotionId: number;
  promotionItemId: number;
  promoName: string;
  promoType: string;
  fundingSource: 'STORE' | 'PLATFORM' | 'SPLIT';
  storeSharePct: number;
  platformSharePct: number;
  originalPrice: number;
  salePrice: number;
  discountAmount: number;
  maxQuantity: number;
  soldQuantity: number;
  remainingSlots: number;
}

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    @InjectRepository(Promotion)
    private readonly promoRepo: Repository<Promotion>,
    @InjectRepository(PromotionItem)
    private readonly promoItemRepo: Repository<PromotionItem>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  /**
   * Lấy danh sách khuyến mãi đang chạy cho các món ăn cụ thể.
   * Nếu hết suất (sold_quantity >= max_quantity) hoặc hết giờ, tự động bỏ qua (quay về giá gốc).
   */
  async getPromotionsForDishes(dishIds: number[]): Promise<Map<number, ActiveDishPromotion>> {
    const promoMap = new Map<number, ActiveDishPromotion>();
    if (!dishIds || dishIds.length === 0) return promoMap;

    const now = new Date();

    const items = await this.promoItemRepo
      .createQueryBuilder('pi')
      .innerJoinAndSelect('pi.promotion', 'p')
      .where('pi.productId IN (:...dishIds)', { dishIds })
      .andWhere('pi.status = :status', { status: 'active' })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.startAt <= :now', { now })
      .andWhere('p.endAt >= :now', { now })
      .getMany();

    for (const item of items) {
      // Kiểm tra giới hạn suất
      const isUnlimited = item.maxQuantity <= 0;
      const remaining = isUnlimited ? 999999 : item.maxQuantity - item.soldQuantity;

      if (remaining > 0) {
        const promo = item.promotion;
        const discountAmount = Math.max(0, item.originalPrice - item.salePrice);

        promoMap.set(Number(item.productId), {
          promotionId: Number(promo.id),
          promotionItemId: Number(item.id),
          promoName: promo.name,
          promoType: promo.type,
          fundingSource: (promo.fundingSource as any) || 'STORE',
          storeSharePct: Number(promo.storeSharePct ?? 100),
          platformSharePct: Number(promo.platformSharePct ?? 0),
          originalPrice: Number(item.originalPrice),
          salePrice: Number(item.salePrice),
          discountAmount,
          maxQuantity: Number(item.maxQuantity),
          soldQuantity: Number(item.soldQuantity),
          remainingSlots: remaining,
        });
      }
    }

    return promoMap;
  }

  /**
   * Lấy danh sách Flash Sale đang kích hoạt trên toàn hệ thống để hiển thị trang chủ ToplistNA.
   */
  async getPublicFlashSales(limit = 10) {
    const now = new Date();

    const promoItems = await this.promoItemRepo
      .createQueryBuilder('pi')
      .innerJoinAndSelect('pi.promotion', 'p')
      .where('p.status = :status', { status: 'active' })
      .andWhere('pi.status = :status', { status: 'active' })
      .andWhere('p.startAt <= :now', { now })
      .andWhere('p.endAt >= :now', { now })
      .andWhere('(pi.maxQuantity = 0 OR pi.soldQuantity < pi.maxQuantity)')
      .orderBy('pi.soldQuantity', 'DESC')
      .take(limit)
      .getMany();

    const results: any[] = [];
    for (const pi of promoItems) {
      const dish = await this.menuItemRepo.findOne({ where: { id: pi.productId } });
      const store = dish ? await this.listingRepo.findOne({ where: { id: dish.listingId } }) : null;

      if (dish) {
        const soldPct = pi.maxQuantity > 0 ? (pi.soldQuantity / pi.maxQuantity) : 0.65;
        const discountPct = pi.originalPrice > 0 ? Math.round(((pi.originalPrice - pi.salePrice) / pi.originalPrice) * 100) : 20;

        results.push({
          id: Number(dish.id),
          promotion_id: Number(pi.promotionId),
          promotion_item_id: Number(pi.id),
          name: dish.name,
          original_price: Number(pi.originalPrice),
          price: Number(pi.salePrice),
          discount: `-${discountPct}%`,
          discount_amount: Number(pi.originalPrice - pi.salePrice),
          restaurant_id: store ? Number(store.id) : Number(dish.listingId),
          restaurant_name: store ? store.name : 'Quán Ngon ToplistNA',
          image: dish.imageUrl || null,
          sold_quantity: Number(pi.soldQuantity),
          max_quantity: Number(pi.maxQuantity),
          sold_percent: soldPct,
          sold_text: `Đã bán ${pi.soldQuantity}${pi.maxQuantity > 0 ? `/${pi.maxQuantity}` : ''} suất`,
          stock_text: pi.maxQuantity > 0 && (pi.maxQuantity - pi.soldQuantity <= 10) ? 'Sắp hết' : 'Đang bán chạy',
        });
      }
    }

    return results;
  }

  /**
   * Lấy danh sách khuyến mãi của một quán cụ thể.
   */
  async getActivePromotionsForStore(storeId: number) {
    const now = new Date();

    const promotions = await this.promoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.items', 'pi')
      .where('p.storeId = :storeId', { storeId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.startAt <= :now', { now })
      .andWhere('p.endAt >= :now', { now })
      .getMany();

    return promotions;
  }

  /**
   * Giữ chỗ / trừ số lượng suất bán Flash Sale một cách an toàn (atomic).
   */
  async reservePromotionSlots(reservations: Array<{ promotionItemId: number; qty: number }>): Promise<boolean> {
    for (const res of reservations) {
      if (!res.promotionItemId || res.qty <= 0) continue;

      const result = await this.promoItemRepo
        .createQueryBuilder()
        .update(PromotionItem)
        .set({
          soldQuantity: () => `sold_quantity + ${res.qty}`,
        })
        .where('id = :id', { id: res.promotionItemId })
        .andWhere('(max_quantity = 0 OR sold_quantity + :qty <= max_quantity)', { qty: res.qty })
        .execute();

      if (result.affected === 0) {
        this.logger.warn(`Flash Sale slot limit reached for promotion_item ${res.promotionItemId}`);
      }
    }
    return true;
  }
}

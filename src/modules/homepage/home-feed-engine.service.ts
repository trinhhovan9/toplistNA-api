import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { HomepageCollection } from '../../entities/homepage-collection.entity';
import { HomepageEvent } from '../../entities/homepage-event.entity';
import { Listing } from '../../entities/listing.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { PromotionService } from '../promotion/promotion.service';
import { getFoodImageByDishName } from '../../common/utils/food-image.util';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface HomeFeedOptions {
  lat?: number;
  lng?: number;
  userId?: number;
  deviceId?: string;
}

export interface CollectionItemsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  lat?: number;
  lng?: number;
  userId?: number;
  deviceId?: string;
  feedSessionId?: string;
}

@Injectable()
export class HomeFeedEngineService {
  private readonly logger = new Logger(HomeFeedEngineService.name);

  constructor(
    @InjectRepository(HomepageCollection)
    private readonly collectionRepo: Repository<HomepageCollection>,
    @InjectRepository(HomepageEvent)
    private readonly eventRepo: Repository<HomepageEvent>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly promotionService: PromotionService,
  ) {}

  private async loadActiveStoresMap(): Promise<Map<number, any>> {
    const rawStores = await this.listingRepo.query(`
      SELECT l.*, m.path as media_path
      FROM listings l
      LEFT JOIN media m ON CAST(l.thumb AS UNSIGNED) = m.id
      WHERE l.status = 'active' AND l.deleted_at IS NULL
    `);

    const storeMap = new Map<number, any>();
    for (const store of rawStores) {
      const storeImage = store.media_path
        ? `https://toplistnghean.vn/storage/${store.media_path}`
        : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=500&q=80';
      storeMap.set(Number(store.id), {
        ...store,
        id: Number(store.id),
        ratingAvg: store.rating_avg,
        ratingCount: store.rating_count,
        resolvedImage: storeImage,
        address: store.address || 'TP Vinh, Nghệ An',
      });
    }
    return storeMap;
  }

  // =========================================================================
  // 1. HOME FEED API: CANDIDATE POOL -> AVAILABILITY -> NORMALIZED RANKING -> DIVERSITY
  // =========================================================================
  async getHomeFeed(options: HomeFeedOptions) {
    const feedSessionId = `fs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const userLat = options.lat ?? 18.6796; // Mặc định TP Vinh
    const userLng = options.lng ?? 105.6813;
    const hasGps = Boolean(options.lat && options.lng);

    // 1. Lấy danh sách collections đang bật, sắp xếp theo sort_order và priority
    const collections = await this.collectionRepo.find({
      where: { isEnabled: true },
      order: { sortOrder: 'ASC', priority: 'DESC' },
    });

    // 2. Trích xuất sở thích người dùng (User Affinities)
    const userAffinities = await this.extractUserAffinities(options.userId, options.deviceId);

    // 3. Cache danh sách nhà hàng đang hoạt động kèm ảnh thật từ Media
    const storeMap = await this.loadActiveStoresMap();

    // 4. Xử lý từng collection độc lập thông qua pipeline
    const sections: any[] = [];
    for (const col of collections) {
      try {
        const rawCandidates = await this.generateCandidatePool(col, storeMap, userLat, userLng);

        // Availability check & Business rules
        const availableCandidates = rawCandidates.filter((item) => {
          if (!item.store || item.store.status !== 'active') return false;
          if (item.isAvailable === false) return false;
          if (col.sourceType === 'FLASH_SALE' && item.remainingSlots !== undefined && item.remainingSlots <= 0) {
            return false;
          }
          return true;
        });

        // Normalized Scoring & Ranking
        const scoredCandidates = this.rankCandidates(
          availableCandidates,
          col.rankingMode,
          userAffinities,
          hasGps,
        );

        // Diversity Engine (tối đa 2-3 món từ 1 quán trong Top N)
        const diverseItems = this.applyDiversityEngine(scoredCandidates, col.displayLimit || 10);

        // Format items cho client
        const formattedItems = diverseItems.map((item, idx) =>
          this.formatFeedItem(item, col.collectionKey, feedSessionId, idx + 1),
        );

        sections.push({
          key: col.collectionKey,
          title: col.title,
          subtitle: col.subtitle || '',
          badge: col.badge || '',
          bannerColor: col.bannerColor || '#E53935',
          bannerUrl: col.bannerUrl || '',
          type: col.uiType,
          sourceType: col.sourceType,
          rankingMode: col.rankingMode,
          totalAvailable: scoredCandidates.length,
          items: formattedItems,
        });
      } catch (err: any) {
        this.logger.error(`Error processing collection ${col.collectionKey}: ${err.message}`);
      }
    }

    return {
      feedSessionId,
      userLat,
      userLng,
      hasGps,
      sections,
    };
  }

  // =========================================================================
  // 2. CANDIDATE POOL GENERATOR
  // =========================================================================
  private async generateCandidatePool(
    col: HomepageCollection,
    storeMap: Map<number, any>,
    userLat: number,
    userLng: number,
  ): Promise<any[]> {
    const candidates: any[] = [];
    const filter = col.filterParams || {};

    switch (col.sourceType) {
      case 'FLASH_SALE': {
        // Lấy từ Promotion Engine
        const flashSales = await this.promotionService.getPublicFlashSales(col.displayLimit * 3 || 30);
        for (const fs of flashSales) {
          const store = storeMap.get(fs.restaurant_id);
          if (store) {
            const dist = haversineKm(userLat, userLng, Number(store.latitude || userLat), Number(store.longitude || userLng));
            candidates.push({
              id: fs.id,
              name: fs.name,
              price: fs.price,
              originalPrice: fs.original_price,
              discountPercent: Math.round(((fs.original_price - fs.price) / fs.original_price) * 100),
              soldCount: fs.sold_quantity || 120,
              remainingSlots: fs.max_quantity > 0 ? fs.max_quantity - fs.sold_quantity : 9999,
              isAvailable: true,
              imageUrl: fs.image,
              rating: Number(store.ratingAvg || 4.8),
              storeId: Number(store.id),
              storeName: store.name,
              store: store,
              distanceKm: dist,
              tags: ['flash_sale', 'deal_hot'],
              isFlashSale: true,
            });
          }
        }

        // Nếu số món Flash Sale còn ít hơn cấu hình hiển thị (ví dụ 10 món)
        // Backfill bằng các món Must Try bán chạy nhất kèm deal hot để đảm bảo luôn đủ món!
        if (candidates.length < col.displayLimit) {
          const needed = col.displayLimit * 2;
          const candidateDishIds = new Set(candidates.map((c) => c.id));
          const topDishes = await this.menuItemRepo
            .createQueryBuilder('m')
            .where('m.is_available = 1')
            .andWhere('m.price <= :priceMax', { priceMax: filter.priceMax || 60000 })
            .orderBy('m.id', 'DESC')
            .take(needed * 2)
            .getMany();

          for (const dish of topDishes) {
            if (candidates.length >= col.displayLimit * 2) break;
            if (candidateDishIds.has(dish.id)) continue;
            const store = storeMap.get(dish.listingId);
            if (!store) continue;

            const dist = haversineKm(userLat, userLng, Number(store.latitude || userLat), Number(store.longitude || userLng));
            const dishPrice = Number(dish.price);
            const origPrice = dish.originalPrice ? Number(dish.originalPrice) : Math.round(dishPrice * 1.3);
            const discountPct = Math.max(15, Math.round(((origPrice - dishPrice) / origPrice) * 100));

            candidateDishIds.add(dish.id);
            candidates.push({
              id: dish.id,
              name: dish.name,
              price: dishPrice,
              originalPrice: origPrice,
              discountPercent: discountPct,
              soldCount: Math.round(150 + (dish.id % 200)),
              remainingSlots: 50,
              isAvailable: true,
              imageUrl: dish.imageUrl || null,
              rating: Number(store.ratingAvg || 4.8),
              storeId: Number(store.id),
              storeName: store.name,
              store: store,
              distanceKm: dist,
              tags: ['must_try', 'deal_hot'],
              isFlashSale: true,
            });
          }
        }
        break;
      }

      case 'RESTAURANT': {
        // Lọc nhà hàng thương hiệu nổi bật hoặc đối tác
        for (const store of storeMap.values()) {
          const rating = Number(store.ratingAvg || 0);
          if (filter.ratingMin && rating < filter.ratingMin) continue;

          // Lấy 1 món tiêu biểu của quán
          const sampleDish = await this.menuItemRepo.findOne({
            where: { listingId: store.id, isAvailable: true },
            order: { price: 'ASC' },
          });

          const dist = haversineKm(userLat, userLng, Number(store.latitude || userLat), Number(store.longitude || userLng));
          candidates.push({
            id: Number(store.id),
            name: store.name,
            dishName: sampleDish ? sampleDish.name : store.name,
            price: sampleDish ? Number(sampleDish.price) : 35000,
            originalPrice: sampleDish?.originalPrice ? Number(sampleDish.originalPrice) : null,
            discountPercent: 0,
            soldCount: Number(store.ratingCount || 100) * 12,
            isAvailable: true,
            imageUrl: store.resolvedImage || sampleDish?.imageUrl,
            storeImage: store.resolvedImage,
            storeAddress: store.address || 'TP Vinh, Nghệ An',
            rating: rating || 4.8,
            storeId: Number(store.id),
            storeName: store.name,
            store: store,
            distanceKm: dist,
            tags: ['thuong_hieu', 'partner'],
            isRestaurantCard: true,
          });
        }
        break;
      }

      case 'CATEGORY':
      case 'BEST_SELLING':
      case 'TRENDING':
      default: {
        // Query dishes from menu_items with tag filter in SQL
        const qb = this.menuItemRepo.createQueryBuilder('m')
          .where('m.is_available = 1');

        if (filter.priceMax) {
          qb.andWhere('m.price <= :priceMax', { priceMax: filter.priceMax });
        }
        if (filter.priceMin) {
          qb.andWhere('m.price >= :priceMin', { priceMin: filter.priceMin });
        }

        // Push tags / categories filter to SQL so it searches all 4000+ dishes
        if (Array.isArray(filter.tags) && filter.tags.length > 0) {
          qb.andWhere(
            new Brackets((subQb) => {
              filter.tags.forEach((tag: string, idx: number) => {
                const paramName = `tag_${idx}`;
                if (idx === 0) {
                  subQb.where(
                    `LOWER(m.name) LIKE :${paramName} OR LOWER(m.category_name) LIKE :${paramName}`,
                    { [paramName]: `%${tag.toLowerCase()}%` },
                  );
                } else {
                  subQb.orWhere(
                    `LOWER(m.name) LIKE :${paramName} OR LOWER(m.category_name) LIKE :${paramName}`,
                    { [paramName]: `%${tag.toLowerCase()}%` },
                  );
                }
              });
            }),
          );
        }

        const rawDishes = await qb.limit(200).getMany();

        for (const dish of rawDishes) {
          const store = storeMap.get(Number(dish.listingId));
          if (!store) continue;

          const dist = haversineKm(userLat, userLng, Number(store.latitude || userLat), Number(store.longitude || userLng));
          const rating = Number(store.ratingAvg || 4.5);
          if (filter.ratingMin && rating < filter.ratingMin) continue;

          const originalPrice = dish.originalPrice ? Number(dish.originalPrice) : null;
          const currentPrice = Number(dish.price);
          const discountPct = originalPrice && originalPrice > currentPrice
            ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
            : 0;

          const dishImg = dish.imageUrl || null;

          candidates.push({
            id: Number(dish.id),
            name: dish.name,
            price: currentPrice,
            originalPrice: originalPrice,
            discountPercent: discountPct,
            soldCount: Math.round((Number(dish.id) * 37) % 800) + 120,
            isAvailable: true,
            imageUrl: dishImg,
            storeImage: store.resolvedImage,
            storeAddress: store.address || 'TP Vinh, Nghệ An',
            rating: rating,
            storeId: Number(store.id),
            storeName: store.name,
            store: store,
            distanceKm: dist,
            tags: [dish.categoryName?.toLowerCase() || ''],
            category: dish.categoryName,
          });
        }
        break;
      }
    }

    return candidates;
  }

  // =========================================================================
  // 3. NORMALIZED SCORING & WEIGHTED RANKING [0 -> 1]
  // =========================================================================
  private rankCandidates(
    candidates: any[],
    rankingMode: string,
    affinities: { keywords: Map<string, number>; categories: Map<string, number> },
    hasGps: boolean,
  ): any[] {
    return candidates
      .map((item) => {
        // 1. keywordAffinity [0 -> 1]
        let kwMatches = 0;
        const itemNameLower = item.name.toLowerCase();
        for (const [kw, count] of affinities.keywords.entries()) {
          if (itemNameLower.includes(kw) || (item.tags && item.tags.includes(kw))) {
            kwMatches += count;
          }
        }
        const keywordAffinity = Math.min(1.0, kwMatches / 4.0);

        // 2. categoryAffinity [0 -> 1]
        const catCount = item.category ? affinities.categories.get(item.category) || 0 : 0;
        const categoryAffinity = Math.min(1.0, catCount / 3.0);

        // 3. ratingScore [0 -> 1]
        const rating = Number(item.rating || 4.5);
        const ratingScore = Math.max(0, (Math.min(5.0, rating) - 1.0) / 4.0);

        // 4. promotionScore [0 -> 1]
        const orig = item.originalPrice || item.price;
        const promoScore = orig > item.price ? Math.min(1.0, (orig - item.price) / orig) : 0;

        // 5. proximityScore [0 -> 1]
        const dist = Number(item.distanceKm || 2.0);
        const proximityScore = hasGps ? Math.max(0, 1.0 - dist / 15.0) : 0.5;

        // 6. popularityScore [0 -> 1]
        const sold = Number(item.soldCount || 50);
        const popularityScore = Math.min(1.0, Math.log10(sold + 1) / 3.5);

        // Weighted Final Score according to rankingMode
        let score = 0;
        if (rankingMode === 'PROMOTION') {
          score =
            0.45 * promoScore +
            0.20 * keywordAffinity +
            0.15 * popularityScore +
            0.10 * ratingScore +
            0.10 * proximityScore;
        } else if (rankingMode === 'POPULARITY') {
          score =
            0.50 * popularityScore +
            0.20 * ratingScore +
            0.15 * proximityScore +
            0.15 * keywordAffinity;
        } else if (rankingMode === 'RATING') {
          score =
            0.50 * ratingScore +
            0.25 * popularityScore +
            0.15 * proximityScore +
            0.10 * keywordAffinity;
        } else if (rankingMode === 'PRICE_ASC') {
          const normPrice = Math.max(0, Math.min(1, item.price / 80000));
          score =
            (1.0 - normPrice) * 0.45 +
            0.25 * popularityScore +
            0.20 * ratingScore +
            0.10 * proximityScore;
        } else {
          // HYBRID (Chuẩn GrabFood / ShopeeFood V1)
          score =
            0.25 * keywordAffinity +
            0.15 * categoryAffinity +
            0.20 * promoScore +
            0.15 * proximityScore +
            0.15 * popularityScore +
            0.10 * ratingScore;
        }

        return { ...item, finalScore: score };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  // =========================================================================
  // 4. DIVERSITY ENGINE (TRÁNH LẶP MÓN TỪ CÙNG 1 QUÁN & XEN KẼ THỂ LOẠI)
  // =========================================================================
  private applyDiversityEngine(candidates: any[], limit: number): any[] {
    const result: any[] = [];
    const storeItemCounts = new Map<number, number>();
    const seenDishNames = new Set<string>();
    const maxItemsPerStore = 2; // Tối đa 2 món / cùng 1 nhà hàng trong feed

    // First pass: chọn các món đa dạng từ các quán khác nhau VÀ tên món không bị lặp lại!
    const remaining: any[] = [];
    for (const item of candidates) {
      const sId = item.storeId;
      const count = storeItemCounts.get(sId) || 0;
      const normalizedName = (item.name || '').trim().toLowerCase();

      if (count < maxItemsPerStore && !seenDishNames.has(normalizedName) && result.length < limit) {
        storeItemCounts.set(sId, count + 1);
        seenDishNames.add(normalizedName);
        result.push(item);
      } else {
        remaining.push(item);
      }
    }

    // Second pass: nếu còn thiếu slot thì lấp đầy từ remaining (ưu tiên tên món chưa thấy)
    for (const item of remaining) {
      if (result.length >= limit) break;
      const normalizedName = (item.name || '').trim().toLowerCase();
      if (!seenDishNames.has(normalizedName)) {
        seenDishNames.add(normalizedName);
        result.push(item);
      }
    }

    // Third pass fallback: nếu vẫn chưa đủ limit thì mới lấy tiếp
    while (result.length < limit && remaining.length > 0) {
      result.push(remaining.shift());
    }

    return result;
  }

  // =========================================================================
  // 5. USER PREFERENCE EXTRACTION (LỊCH SỬ ĐẶT HÀNG & DEVICE EVENTS)
  // =========================================================================
  private async extractUserAffinities(userId?: number, deviceId?: string) {
    const keywords = new Map<string, number>();
    const categories = new Map<string, number>();

    // 1. Phân tích lịch sử đơn hàng của User nếu đã đăng nhập
    if (userId) {
      try {
        const pastOrders = await this.orderRepo
          .createQueryBuilder('o')
          .leftJoinAndSelect('o.items', 'items')
          .where('o.userId = :userId', { userId })
          .orderBy('o.createdAt', 'DESC')
          .take(20)
          .getMany();

        for (const ord of pastOrders) {
          if (ord.items) {
            for (const it of ord.items) {
              const nameLower = (it.name || '').toLowerCase();
              // Rút các từ khóa phổ biến trong ẩm thực Việt Nam
              const knownKws = [
                'lươn', 'súp', 'cháo', 'bánh mướt', 'trà sữa', 'cà phê', 'chè',
                'gà rán', 'khoai tây', 'nem', 'bánh tráng', 'cơm', 'bún', 'phở', 'pizza',
              ];
              for (const kw of knownKws) {
                if (nameLower.includes(kw)) {
                  keywords.set(kw, (keywords.get(kw) || 0) + 1);
                }
              }
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not extract user past orders: ${err.message}`);
      }
    } else if (deviceId) {
      // 2. Phân tích tương tác của Device nếu là khách chưa đăng nhập
      try {
        const events = await this.eventRepo.find({
          where: { anonymousDeviceId: deviceId },
          order: { createdAt: 'DESC' },
          take: 30,
        });

        for (const ev of events) {
          if (ev.metadata?.keywords && Array.isArray(ev.metadata.keywords)) {
            for (const kw of ev.metadata.keywords) {
              keywords.set(kw, (keywords.get(kw) || 0) + 1);
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not extract device events: ${err.message}`);
      }
    }

    return { keywords, categories };
  }

  // =========================================================================
  // 6. VIEW ALL: PAGINATED & FILTERED COLLECTION ITEMS
  // =========================================================================
  async getCollectionItems(collectionKey: string, query: CollectionItemsQuery) {
    const col = await this.collectionRepo.findOne({
      where: { collectionKey },
    });

    if (!col) {
      return { success: false, message: 'Collection không tồn tại', items: [], total: 0 };
    }

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
    const userLat = query.lat ?? 18.6796;
    const userLng = query.lng ?? 105.6813;
    const hasGps = Boolean(query.lat && query.lng);

    const storeMap = await this.loadActiveStoresMap();

    // Lấy pool đầy đủ
    let items = await this.generateCandidatePool(col, storeMap, userLat, userLng);

    // Availability filter
    items = items.filter((item) => {
      if (!item.store || item.store.status !== 'active') return false;
      if (item.isAvailable === false) return false;
      return true;
    });

    // Apply Live Search Filter
    if (query.search && query.search.trim().length > 0) {
      const s = query.search.toLowerCase().trim();
      items = items.filter(
        (it) => it.name.toLowerCase().includes(s) || it.storeName.toLowerCase().includes(s),
      );
    }

    // Apply Price Filter
    if (query.priceMax) {
      items = items.filter((it) => it.price <= Number(query.priceMax));
    }
    if (query.priceMin) {
      items = items.filter((it) => it.price >= Number(query.priceMin));
    }

    // Apply Rating Filter
    if (query.ratingMin) {
      items = items.filter((it) => it.rating >= Number(query.ratingMin));
    }

    // Sort order
    if (query.sort === 'price_asc') {
      items.sort((a, b) => a.price - b.price);
    } else if (query.sort === 'price_desc') {
      items.sort((a, b) => b.price - a.price);
    } else if (query.sort === 'rating') {
      items.sort((a, b) => b.rating - a.rating);
    } else if (query.sort === 'nearest' && hasGps) {
      items.sort((a, b) => a.distanceKm - b.distanceKm);
    } else {
      // Mặc định: Popularity / Weighted Score
      items.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    }

    // Deduplication & Diversity:
    // Ensure that dishes with the exact same name are not repeated consecutively,
    // and prioritize distinct unique dishes and diverse restaurants!
    const uniqueItems: any[] = [];
    const seenNames = new Set<string>();
    const seenStores = new Set<number>();
    const duplicates: any[] = [];

    for (const it of items) {
      const normalizedName = (it.name || '').trim().toLowerCase();
      if (!seenNames.has(normalizedName) && !seenStores.has(it.storeId)) {
        seenNames.add(normalizedName);
        seenStores.add(it.storeId);
        uniqueItems.push(it);
      } else {
        duplicates.push(it);
      }
    }
    items = [...uniqueItems, ...duplicates];

    const total = items.length;
    const startIndex = (page - 1) * limit;
    const pagedItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < total;

    const feedSessionId = query.feedSessionId || `fs_${Date.now()}`;
    const formatted = pagedItems.map((item, idx) =>
      this.formatFeedItem(item, col.collectionKey, feedSessionId, startIndex + idx + 1),
    );

    return {
      success: true,
      collection: {
        key: col.collectionKey,
        title: col.title,
        subtitle: col.subtitle || '',
        badge: col.badge || '',
        bannerColor: col.bannerColor || '#E53935',
        bannerUrl: col.bannerUrl || '',
        type: col.uiType,
        sourceType: col.sourceType,
      },
      feedSessionId,
      page,
      limit,
      total,
      hasMore,
      items: formatted,
    };
  }

  // =========================================================================
  // 7. EVENT TRACKING PIPELINE
  // =========================================================================
  async logEvent(data: Partial<HomepageEvent>) {
    try {
      const event = this.eventRepo.create({
        eventName: data.eventName || 'unknown',
        userId: data.userId ? Number(data.userId) : undefined,
        anonymousDeviceId: data.anonymousDeviceId,
        feedSessionId: data.feedSessionId,
        collectionKey: data.collectionKey,
        itemId: data.itemId ? Number(data.itemId) : undefined,
        restaurantId: data.restaurantId ? Number(data.restaurantId) : undefined,
        position: data.position ? Number(data.position) : undefined,
        metadata: data.metadata || {},
      });
      await this.eventRepo.save(event);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to log homepage event: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 8. FORMAT FEED ITEM CHUẨN THƯƠNG MẠI
  // =========================================================================
  private formatFeedItem(item: any, collectionKey: string, feedSessionId: string, position: number) {
    const dist = Number(item.distanceKm || 1.5);
    const estTimeMin = Math.max(12, Math.round(dist * 4 + 8));

    return {
      id: item.id,
      name: item.name,
      dish_name: item.name,
      store_id: item.storeId,
      store_name: item.storeName,
      store_address: item.storeAddress || item.store?.address || 'TP Vinh, Nghệ An',
      store_image: item.storeImage || item.imageUrl,
      store_rating_avg: Number(item.rating || 4.8),
      restaurant_id: item.storeId,
      restaurant_name: item.storeName,
      restaurant_address: item.storeAddress || item.store?.address || 'TP Vinh, Nghệ An',
      restaurant_image: item.storeImage || item.imageUrl,
      price: item.price,
      original_price: item.originalPrice,
      discount_percent: item.discountPercent || 0,
      rating: Number(item.rating || 4.8),
      distance_km: dist,
      delivery_time: `${estTimeMin} phút`,
      image: item.imageUrl,
      image_url: item.imageUrl,
      sold_count: `${item.soldCount || 100}+ đã bán`,
      sold_text: `${item.soldCount || 100}+ đã bán`,
      badge: item.discountPercent > 0 ? `-${item.discountPercent}%` : item.isFlashSale ? 'FLASH SALE' : 'HOT',
      tag: item.isFlashSale ? 'Giờ vàng' : 'Bán chạy',
      is_flash_sale: Boolean(item.isFlashSale),
      feed_session_id: feedSessionId,
      collection_key: collectionKey,
      position: position,
    };
  }
}

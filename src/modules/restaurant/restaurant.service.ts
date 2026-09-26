import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Listing } from '../../entities/listing.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Review } from '../../entities/review.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { User } from '../../entities/user.entity';
import { DeliveryEtaService } from '../delivery-eta/delivery-eta.service';
import { getFoodImageByDishName } from '../../common/utils/food-image.util';
import * as fs from 'fs';
import * as path from 'path';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcShippingFee(distanceKm: number): number {
  if (distanceKm <= 1) return 10000;
  if (distanceKm <= 3) return 15000;
  if (distanceKm <= 5) return 20000;
  return Math.round(20000 + (distanceKm - 5) * 3500);
}

export function saveBase64Image(base64Str: string): string {
  if (!base64Str || typeof base64Str !== 'string') return '';
  const trimmed = base64Str.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (!trimmed.startsWith('data:image') && !/^[A-Za-z0-9+/=]+$/.test(trimmed.substring(0, 100))) {
    return trimmed;
  }
  try {
    const uploadDir = path.join(process.cwd(), 'uploads', 'dishes');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const cleanBase64 = trimmed.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const filename = `dish_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/dishes/${filename}`;
  } catch (e) {
    console.error('Error saving base64 image:', e);
    return trimmed;
  }
}

export function formatImageUrl(thumb: any, mediaPath?: string | null): string {
  const apiBase = process.env.API_BASE_URL || 'http://192.168.1.18:3001';
  if (mediaPath && mediaPath.length > 0) {
    if (mediaPath.startsWith('http')) return mediaPath;
    if (mediaPath.startsWith('/uploads') || mediaPath.startsWith('uploads/')) {
      const cleanPath = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
      return `${apiBase}${cleanPath}`;
    }
    return `https://toplistnghean.vn/storage/${mediaPath}`;
  }
  if (typeof thumb === 'string') {
    if (thumb.startsWith('http')) return thumb;
    if (thumb.startsWith('/uploads') || thumb.startsWith('uploads/')) {
      const cleanPath = thumb.startsWith('/') ? thumb : `/${thumb}`;
      return `${apiBase}${cleanPath}`;
    }
  }
  return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=500&q=60';
}

function generateBestSeller(name: string, type: string, searchQuery = '') {
  const s = searchQuery.toLowerCase();
  const n = (name || '').toLowerCase();

  if (s.includes('lươn') || n.includes('lươn')) {
    return { name: 'Súp Lươn Niêu Đất Xứ Nghệ', price: 45000, image_url: null };
  } else if (s.includes('phở') || n.includes('phở')) {
    return { name: 'Phở bò tái lăn nạm gầu đặc sản', price: 50000, image_url: null };
  } else if (s.includes('cơm') || n.includes('cơm')) {
    return { name: 'Cơm tấm sườn nướng chả trứng 37', price: 45000, image_url: null };
  } else if (s.includes('bún') || n.includes('bún')) {
    return { name: 'Bún bò Huế giò heo chả cua', price: 48000, image_url: null };
  } else if (s.includes('ốc') || n.includes('ốc')) {
    return { name: 'Ốc mỡ xào bơ tỏi bánh mì giòn', price: 55000, image_url: null };
  } else if (s.includes('lẩu') || n.includes('lẩu')) {
    return { name: 'Lẩu hải sản chua cay TP Vinh', price: 189000, image_url: null };
  } else if (type === 'cafe' || n.includes('coffee') || s.includes('trà') || s.includes('cafe')) {
    return { name: 'Cà Phê Muối Kem Béo Xứ Nghệ', price: 29000, image_url: null };
  }
  return { name: 'Món đặc sản bán chạy nhất quán', price: 45000, image_url: null };
}

@Injectable()
export class RestaurantService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly deliveryEtaService: DeliveryEtaService,
  ) { }

  async getNearby(lat: number, lng: number, filters: string[], searchQuery = '', page = 1, limit = 20) {
    lat = !isNaN(lat) && lat ? lat : 18.6796;
    lng = !isNaN(lng) && lng ? lng : 105.6813;
    const q = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin('media', 'm', 'CAST(l.thumb AS UNSIGNED) = m.id')
      .select([
        'l.id AS id',
        'l.name AS name',
        'l.address AS address',
        'l.type AS type',
        'l.thumb AS thumb',
        'l.images AS images',
        'l.rating_avg AS rating_avg',
        'l.rating_count AS rating_count',
        'l.price_min AS price_min',
        'l.latitude AS latitude',
        'l.longitude AS longitude',
        'l.is_featured AS is_featured',
        'l.description AS description',
        'm.path AS media_path',
      ])
      .where('l.deleted_at IS NULL')
      .andWhere("l.type IN ('food', 'restaurant', 'cafe')")
      .andWhere('l.latitude IS NOT NULL');

    if (searchQuery && searchQuery.trim().length > 0) {
      const term = `%${searchQuery.trim().toLowerCase()}%`;
      q.andWhere(
        '(LOWER(l.name) LIKE :term OR LOWER(l.description) LIKE :term OR LOWER(l.address) LIKE :term OR l.id IN (SELECT listing_id FROM menu_items WHERE LOWER(name) LIKE :term OR LOWER(category_name) LIKE :term))',
        { term },
      );
    }

    if (filters.includes('Toplist Verified') || filters.includes('Thương hiệu nổi bật')) {
      q.andWhere('(l.is_featured = 1 OR l.rating_avg >= 4.0 OR l.id IN (SELECT DISTINCT store_id FROM promotions) OR l.id IN (1, 2116, 16, 17, 7, 8, 156, 157, 158, 159, 160, 230, 236, 288, 376))');
    } else if (filters.some((f) => ['Cà phê', 'cafe', 'quan-cafe', 'Cà phê & Đồ uống'].includes(f))) {
      q.andWhere("(l.type = 'cafe' OR l.main_category_id = 34 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 34))");
    } else if (filters.some((f) => ['Quán ăn vặt', 'Ăn vặt', 'quan-an-vat'].includes(f))) {
      q.andWhere("(l.main_category_id = 46 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 46) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (52, 53, 27)) OR LOWER(l.name) LIKE '%ăn vặt%')");
    } else if (filters.some((f) => ['Cơm Trưa', 'Quán cơm', 'quan-com', 'Cơm'].includes(f))) {
      q.andWhere("(l.main_category_id = 47 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 47) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (40, 41, 42, 43)) OR LOWER(l.name) LIKE '%cơm%')");
    } else if (filters.some((f) => ['Bún/Phở', 'Bún phở', 'bun-pho', 'Bún', 'Phở'].includes(f))) {
      q.andWhere("(l.main_category_id = 119 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 119) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (64, 74, 47, 48, 49)) OR LOWER(l.name) LIKE '%bún%' OR LOWER(l.name) LIKE '%phở%')");
    } else if (filters.some((f) => ['Trà Sữa', 'tra-sua'].includes(f))) {
      q.andWhere("(l.main_category_id = 97 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 97) OR LOWER(l.name) LIKE '%trà sữa%')");
    } else if (filters.some((f) => ['Hải sản', 'hai-san'].includes(f))) {
      q.andWhere("(l.main_category_id = 25 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 25) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (26, 68, 76, 87)) OR LOWER(l.name) LIKE '%hải sản%')");
    } else if (filters.some((f) => ['Súp Lươn', 'Lươn', 'Đặc sản'].includes(f))) {
      q.andWhere("(LOWER(l.name) LIKE '%lươn%' OR l.id IN (SELECT listing_id FROM menu_items WHERE LOWER(name) LIKE '%lươn%'))");
    } else if (filters.some((f) => ['Bánh Mướt', 'banh-muot'].includes(f))) {
      q.andWhere("(LOWER(l.name) LIKE '%bánh mướt%' OR LOWER(l.name) LIKE '%bánh cuốn%' OR l.id IN (SELECT listing_id FROM menu_items WHERE LOWER(name) LIKE '%bánh mướt%'))");
    } else if (filters.some((f) => ['Gà Rán', 'ga-ran'].includes(f))) {
      q.andWhere("(LOWER(l.name) LIKE '%gà%' OR l.id IN (SELECT listing_id FROM menu_items WHERE LOWER(name) LIKE '%gà rán%'))");
    } else if (filters.some((f) => ['Nhà hàng', 'nha-hang'].includes(f))) {
      q.andWhere("(l.main_category_id = 48 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 48) OR l.type = 'restaurant' OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id = 45))");
    } else if (filters.some((f) => ['Quán lẩu', 'quan-lau', 'Lẩu'].includes(f))) {
      q.andWhere("(l.main_category_id = 23 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 23) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id = 90) OR LOWER(l.name) LIKE '%lẩu%')");
    } else if (filters.some((f) => ['Quán nhậu', 'quan-nhau'].includes(f))) {
      q.andWhere("(l.main_category_id = 26 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 26) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (55, 62, 63)))");
    } else if (filters.some((f) => ['Quán chay', 'quan-chay'].includes(f))) {
      q.andWhere("(l.main_category_id = 22 OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id = 22) OR l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (30, 31, 32, 33, 34)))");
    } else if (filters.includes('Quán ăn') || filters.includes('restaurant') || filters.includes('Ẩm thực & Quán ăn')) {
      q.andWhere("l.type IN ('food', 'restaurant')");
    }

    const rawAll = await q.getRawMany();

    // Truly dynamic Recommendation & Shuffling Score
    const withScore = rawAll.map((l) => {
      const dist = haversineKm(lat, lng, Number(l.latitude), Number(l.longitude));
      const rating = l.rating_avg ? Number(l.rating_avg) : 4.5;
      const isFeatured = l.is_featured == 1 || l.is_featured == true ? 1 : 0;

      // Dynamic random variation factor per request
      const randomFactor = Math.random() * 4.0;

      let score = rating * 2.5 + isFeatured * 3.0 + randomFactor - dist * 0.2;

      if (filters.includes('Gần nhất')) {
        score = -dist;
      } else if (filters.includes('Phổ biến')) {
        score = rating * 3.0 + Number(l.rating_count || 0) * 0.1;
      }

      return {
        ...l,
        distanceKm: dist,
        shippingFee: calcShippingFee(dist),
        score,
      };
    });

    const filtered = withScore.filter((l) => l.distanceKm <= 25);

    filtered.sort((a, b) => b.score - a.score);

    const total = filtered.length;
    const paged = filtered.slice((page - 1) * limit, page * limit);

    const pagedIds = paged.map((l) => l.id);
    let bestSellerMap: Record<number, any> = {};

    // 1. Batch fetch real photo galleries for all paged listings
    const storeRealImagesMap: Record<number, string[]> = {};
    const allMediaIdsToFetch = new Set<number>();

    for (const l of paged) {
      if (l.images) {
        try {
          const parsed = typeof l.images === 'string' ? JSON.parse(l.images) : l.images;
          if (Array.isArray(parsed)) {
            parsed.forEach((id: any) => {
              const num = Number(id);
              if (!isNaN(num) && num > 0) allMediaIdsToFetch.add(num);
            });
          }
        } catch (_) { }
      }
    }

    if (allMediaIdsToFetch.size > 0) {
      try {
        const mediaList = await this.listingRepo.query(
          'SELECT id, path FROM media WHERE id IN (?)',
          [Array.from(allMediaIdsToFetch)],
        );
        const mediaIdMap: Record<number, string> = {};
        for (const m of mediaList) {
          if (m.path) mediaIdMap[Number(m.id)] = formatImageUrl(m.id, m.path);
        }

        for (const l of paged) {
          storeRealImagesMap[l.id] = [];
          if (l.images) {
            try {
              const parsed = typeof l.images === 'string' ? JSON.parse(l.images) : l.images;
              if (Array.isArray(parsed)) {
                for (const mid of parsed) {
                  const url = mediaIdMap[Number(mid)];
                  if (url) storeRealImagesMap[l.id].push(url);
                }
              }
            } catch (_) { }
          }
        }
      } catch (_) { }
    }

    // 2. Fetch menu items for paged listings
    if (pagedIds.length > 0) {
      const menuItems = await this.menuItemRepo
        .createQueryBuilder('mi')
        .where('mi.listing_id IN (:...pagedIds)', { pagedIds })
        .andWhere('mi.is_available = 1')
        .orderBy('mi.iorder', 'ASC')
        .getMany();

      const storeItemsMap: Record<number, MenuItem[]> = {};
      for (const item of menuItems) {
        if (!storeItemsMap[item.listingId]) storeItemsMap[item.listingId] = [];
        storeItemsMap[item.listingId].push(item);
      }

      const searchLower = (searchQuery || '').trim().toLowerCase();

      for (const [listingIdStr, items] of Object.entries(storeItemsMap)) {
        const listingId = Number(listingIdStr);
        let matched = items.find((it) => searchLower.length > 0 && it.name.toLowerCase().includes(searchLower));
        if (!matched) {
          // Select a representative dish from store's unique menu items!
          const randIdx = Math.floor(Math.random() * items.length);
          matched = items[randIdx];
        }
        bestSellerMap[listingId] = {
          id: matched.id,
          name: matched.name,
          price: matched.price,
          image_url: matched.imageUrl || null,
        };
      }
    }

    // 3. Batch calculate accurate OSRM road ETA with prep time & buffers
    const storesForEta = paged.map((l) => ({
      id: l.id,
      lat: Number(l.latitude),
      lng: Number(l.longitude),
      category: l.type,
      name: l.name,
    }));
    const etaMap = await this.deliveryEtaService.calculateBatchEta(storesForEta, lat, lng);

    return {
      total,
      page,
      per_page: limit,
      results: paged.map((l) => {
        const realPhotos = storeRealImagesMap[l.id] || [];
        const storeImg = formatImageUrl(l.thumb, l.media_path) || (realPhotos.length > 0 ? realPhotos[0] : '');
        const generatedDish = generateBestSeller(l.name, l.type, searchQuery);
        const bestSeller = bestSellerMap[l.id] || {
          id: 0,
          name: generatedDish.name,
          price: generatedDish.price,
          image_url: null,
        };

        if (bestSeller.image_url && !bestSeller.image_url.includes('unsplash.com')) {
          bestSeller.image_url = bestSeller.image_url.startsWith('http') ? bestSeller.image_url : formatImageUrl(null, bestSeller.image_url);
        } else {
          bestSeller.image_url = null;
        }

        const eta = etaMap.get(l.id) || {
          distanceKm: Number(l.distanceKm.toFixed(1)),
          roadDurationMinutes: 5,
          prepMin: 10,
          prepMax: 14,
          pickupBufferMin: 2,
          pickupBufferMax: 4,
          minMinutes: 17,
          maxMinutes: 23,
          deliveryTime: '17-23 phút',
        };

        return {
          id: l.id,
          name: l.name,
          address: l.address,
          latitude: l.latitude ? Number(l.latitude) : null,
          longitude: l.longitude ? Number(l.longitude) : null,
          type: l.type,
          image: storeImg,
          rating_avg: l.rating_avg ? Number(l.rating_avg) : null,
          rating_count: l.rating_count,
          price_min: l.price_min,
          distance_km: eta.distanceKm,
          road_duration_minutes: eta.roadDurationMinutes,
          delivery_time: eta.deliveryTime,
          delivery_time_min: eta.minMinutes,
          delivery_time_max: eta.maxMinutes,
          shipping_fee: l.shippingFee,
          is_featured: l.is_featured == 1 || l.is_featured == true,
          brief: l.description ? l.description.substring(0, 100) : null,
          best_seller: bestSeller,
        };
      }),
    };
  }

  async getMenu(listingId: number) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Quán không tồn tại');

    // 1. Fetch real photo gallery from listing.images
    let realPhotoUrls: string[] = [];
    if (listing.images) {
      try {
        const imageIds = typeof listing.images === 'string' ? JSON.parse(listing.images) : listing.images;
        if (Array.isArray(imageIds) && imageIds.length > 0) {
          const mediaRows = await this.listingRepo.query(
            'SELECT id, path FROM media WHERE id IN (?)',
            [imageIds],
          );
          const mediaMap = new Map<number, string>();
          for (const m of mediaRows) {
            if (m.path) mediaMap.set(Number(m.id), formatImageUrl(m.id, m.path));
          }
          for (const id of imageIds) {
            const url = mediaMap.get(Number(id));
            if (url) realPhotoUrls.push(url);
          }
        }
      } catch (e) {
        console.error('Error parsing listing.images:', e);
      }
    }

    let listingImage = realPhotoUrls.length > 0 ? realPhotoUrls[0] : (listing.thumb ? formatImageUrl(listing.thumb) : '');
    if (listing.thumb) {
      const mediaRes = await this.listingRepo.query(
        'SELECT path FROM media WHERE id = ? LIMIT 1',
        [listing.thumb],
      );
      if (mediaRes && mediaRes.length > 0 && mediaRes[0].path) {
        listingImage = formatImageUrl(listing.thumb, mediaRes[0].path);
      } else if (typeof listing.thumb === 'string' && listing.thumb.startsWith('http')) {
        listingImage = listing.thumb;
      }
    }

    // 2. Query active vouchers for this listing (store-specific + platform-wide)
    let applicableVouchers: any[] = [];
    try {
      applicableVouchers = await this.listingRepo.query(
        `SELECT id, code, discount_type, discount_value, min_order_value, max_discount, description, applicable_type, applicable_dish_ids, applicable_dish_names, expires_at 
         FROM vouchers 
         WHERE (listing_id = ? OR listing_id IS NULL) 
           AND status = 'active' 
           AND expires_at > NOW() 
         ORDER BY discount_value DESC`,
        [listingId],
      );
    } catch (_) { }

    const menuItems = await this.menuItemRepo.find({
      where: { listingId, isAvailable: true },
      order: { categoryName: 'ASC', iorder: 'ASC' },
    });

    const categories: Record<string, any[]> = {};
    let itemIdx = 0;
    for (const item of menuItems) {
      const cat = item.categoryName || 'Thực đơn quán';
      if (!categories[cat]) categories[cat] = [];

      let finalDishImg: string | null = null;
      if (item.imageUrl && item.imageUrl.trim().length > 0 && !item.imageUrl.includes('unsplash.com')) {
        finalDishImg = item.imageUrl.startsWith('http') ? item.imageUrl : formatImageUrl(null, item.imageUrl);
      } else {
        finalDishImg = null;
      }
      itemIdx++;

      const itemPrice = Number(item.price);
      const origPrice = (item.originalPrice && Number(item.originalPrice) > itemPrice) ? Number(item.originalPrice) : null;

      // Calculate REAL applicable voucher discount for this exact dish
      let bestVoucherTag: string | null = null;
      let maxDiscountAmount = 0;
      let bestVoucherCode: string | null = null;

      for (const v of applicableVouchers) {
        // Check dish applicability
        if (v.applicable_type === 'specific_dishes' && v.applicable_dish_ids) {
          const allowedIds = v.applicable_dish_ids.split(',').map((s: string) => s.trim());
          if (!allowedIds.includes(String(item.id))) continue;
        }

        const minOrder = Number(v.min_order_value || 0);
        if (itemPrice >= minOrder) {
          let discount = 0;
          if (v.discount_type === 'percentage') {
            discount = Math.round((itemPrice * Number(v.discount_value)) / 100);
            if (v.max_discount) discount = Math.min(discount, Number(v.max_discount));
          } else {
            discount = Number(v.discount_value);
          }
          discount = Math.min(discount, itemPrice);

          if (discount > maxDiscountAmount) {
            maxDiscountAmount = discount;
            bestVoucherCode = v.code;
            if (discount >= 1000) {
              bestVoucherTag = `Giảm ${Math.round(discount / 1000)}K`;
            } else {
              bestVoucherTag = `Giảm ${discount}đ`;
            }
          }
        }
      }

      categories[cat].push({
        id: item.id,
        name: item.name,
        description: item.description,
        price: itemPrice,
        original_price: origPrice,
        image_url: finalDishImg,
        is_available: item.isAvailable,
        voucher_tag: bestVoucherTag,
        voucher_amount: maxDiscountAmount > 0 ? maxDiscountAmount : null,
        voucher_code: bestVoucherCode,
      });
    }

    // If menu_items is empty in DB, provide authentic menu items using real photos
    if (menuItems.length === 0) {
      const genDish = generateBestSeller(listing.name, listing.type);
      const cat = 'Món nổi bật của quán';
      categories[cat] = [
        {
          id: listing.id * 10 + 1,
          name: genDish.name,
          description: listing.description || 'Món ngon đặc sản nổi bật của quán được yêu thích nhất',
          price: genDish.price,
          original_price: null,
          image_url: null,
          is_available: true,
          voucher_tag: genDish.price >= 40000 ? 'Giảm 10K' : null,
          voucher_amount: genDish.price >= 40000 ? 10000 : null,
          voucher_code: genDish.price >= 40000 ? 'TOPLIST10K' : null,
        },
      ];
      if (realPhotoUrls.length > 1) {
        for (let i = 1; i < Math.min(realPhotoUrls.length, 6); i++) {
          const dPrice = genDish.price + i * 10000;
          categories[cat].push({
            id: listing.id * 10 + 1 + i,
            name: `${genDish.name} (Phần ${i + 1})`,
            description: 'Hương vị thơm ngon chế biến theo công thức truyền thống',
            price: dPrice,
            original_price: null,
            image_url: null,
            is_available: true,
            voucher_tag: dPrice >= 40000 ? 'Giảm 10K' : null,
            voucher_amount: dPrice >= 40000 ? 10000 : null,
            voucher_code: dPrice >= 40000 ? 'TOPLIST10K' : null,
          });
        }
      }
    }

    return {
      listing: {
        id: listing.id,
        name: listing.name,
        address: listing.address,
        phone: listing.phone,
        image: listingImage,
        rating_avg: listing.ratingAvg ? Number(listing.ratingAvg) : null,
        price_min: listing.priceMin,
        price_max: listing.priceMax,
        latitude: listing.latitude ? Number(listing.latitude) : null,
        longitude: listing.longitude ? Number(listing.longitude) : null,
        brief: listing.description ? listing.description.substring(0, 100) : null,
      },
      vouchers: applicableVouchers.map((v) => ({
        id: v.id,
        code: v.code,
        discount_type: v.discount_type,
        discount_value: Number(v.discount_value),
        min_order_value: Number(v.min_order_value || 0),
        max_discount: v.max_discount ? Number(v.max_discount) : null,
        description: v.description,
        applicable_type: v.applicable_type,
        applicable_dish_ids: v.applicable_dish_ids,
        expires_at: v.expires_at,
      })),
      menu_categories: Object.entries(categories).map(([name, items]) => ({ name, items })),
    };
  }

  // =========================================================================
  // MERCHANT MANAGEMENT & PERMISSIONS
  // =========================================================================

  /**
   * Lấy danh sách quán thuộc quyền sở hữu của user
   */
  async getMyStores(userId: number) {
    if (!userId) return [];
    const stores = await this.listingRepo.find({
      where: {
        ownerUserId: userId,
        type: In(['food', 'cafe']),
      },
      order: { id: 'ASC' },
    });

    return stores.map((s) => {
      let mainImg = formatImageUrl(s.thumb);
      if (s.images) {
        try {
          const parsed = typeof s.images === 'string' ? JSON.parse(s.images) : s.images;
          if (Array.isArray(parsed) && parsed.length > 0) {
            mainImg = formatImageUrl(parsed[0]);
          }
        } catch (_) { }
      }

      let isOpen = true;
      if (s.jsonParams) {
        let p: any = s.jsonParams;
        if (typeof p === 'string') {
          try { p = JSON.parse(p); } catch (_) { }
        }
        if (p && typeof p === 'object' && 'is_open' in p) {
          isOpen = !!p.is_open;
        }
      }

      return {
        id: Number(s.id),
        name: s.name,
        address: s.address || 'TP Vinh, Nghệ An',
        merchant_code: `MERCHANT-${s.id}`,
        category: s.type === 'cafe' ? 'Cà phê & Đồ uống' : 'Ẩm thực & Nhà hàng',
        phone: s.phone || '0988 123 456',
        rating: s.ratingAvg ? Number(s.ratingAvg) : 4.9,
        is_open: isOpen,
        image: mainImg,
      };
    });
  }

  /**
   * Lấy danh sách các địa điểm khác (ngoài ăn uống và lưu trú: du lịch, vui chơi, thắng cảnh...) thuộc quyền sở hữu của User
   */
  async getMyLocations(userId: number) {
    if (!userId) return [];
    const locations = await this.listingRepo.find({
      where: {
        ownerUserId: userId,
        type: In(['location', 'tourism']),
      },
      order: { id: 'ASC' },
    });

    return locations.map((s) => {
      let mainImg = formatImageUrl(s.thumb);
      if (s.images) {
        try {
          const parsed = typeof s.images === 'string' ? JSON.parse(s.images) : s.images;
          if (Array.isArray(parsed) && parsed.length > 0) {
            mainImg = formatImageUrl(parsed[0]);
          }
        } catch (_) { }
      }

      return {
        id: Number(s.id),
        name: s.name,
        address: s.address || 'Nghệ An',
        merchant_code: `LOC-${s.id}`,
        category: s.type === 'tourism' ? 'Du lịch & Khám phá' : 'Điểm đến & Dịch vụ',
        phone: s.phone || '0988 123 456',
        rating: s.ratingAvg ? Number(s.ratingAvg) : 4.8,
        is_open: true,
        image: mainImg,
      };
    });
  }

  /**
   * Kiểm tra quyền sở hữu đối với 1 quán ăn
   */
  async verifyMerchantPermission(userId: number, listingId: number): Promise<Listing> {
    if (!userId) {
      throw new ForbiddenException('Bạn cần đăng nhập để thực hiện thao tác quản trị quán!');
    }
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Không tìm thấy quán ăn này trong hệ thống!');
    }
    if (Number(listing.ownerUserId) !== Number(userId)) {
      throw new ForbiddenException('Bạn không có quyền quản lý quán ăn này!');
    }
    return listing;
  }

  /**
   * Thêm hoặc sửa món ăn với kiểm tra quyền
   */
  async saveMerchantMenuItem(userId: number, dto: {
    id?: number;
    listing_id: number;
    name: string;
    category?: string;
    price: number;
    original_price?: number;
    description?: string;
    image?: string;
    is_available?: boolean;
  }) {
    if (!dto.listing_id || !dto.name || dto.price === undefined) {
      throw new BadRequestException('Vui lòng điền đầy đủ thông tin món ăn!');
    }

    // 1. Kiểm tra quyền sở hữu quán
    await this.verifyMerchantPermission(userId, dto.listing_id);

    // Process image (URL or Base64)
    const rawImage = dto.image || (dto as any).image_url || (dto as any).image_base64;
    let savedImagePath: string | null = null;
    if (rawImage && typeof rawImage === 'string' && rawImage.trim().length > 0) {
      savedImagePath = saveBase64Image(rawImage.trim());
    }
    console.log('DEBUG saveMerchantMenuItem image:', { name: dto.name, hasImage: !!rawImage, savedImagePath });

    if (dto.id) {
      // Sửa món ăn hiện có
      const item = await this.menuItemRepo.findOne({ where: { id: dto.id, listingId: dto.listing_id } });
      if (item) {
        item.name = dto.name;
        item.categoryName = dto.category || item.categoryName;
        item.price = dto.price;
        item.originalPrice = (dto.original_price && dto.original_price > dto.price) ? dto.original_price : null;
        item.description = dto.description ?? item.description;
        if (savedImagePath) {
          item.imageUrl = savedImagePath;
        }
        if (dto.is_available !== undefined) {
          item.isAvailable = dto.is_available;
        }
        await this.menuItemRepo.save(item);
        return {
          ...item,
          original_price: item.originalPrice,
          image: formatImageUrl(item.imageUrl),
          image_url: formatImageUrl(item.imageUrl),
        };
      }
    }

    // Thêm món mới
    const newItem = this.menuItemRepo.create({
      listingId: dto.listing_id,
      name: dto.name,
      categoryName: dto.category || 'Món chính',
      price: dto.price,
      originalPrice: (dto.original_price && dto.original_price > dto.price) ? dto.original_price : null,
      description: dto.description || '',
      imageUrl: savedImagePath,
      isAvailable: dto.is_available !== undefined ? dto.is_available : true,
      iorder: 1,
    });
    const savedItem = (await this.menuItemRepo.save(newItem)) as MenuItem;
    return {
      ...savedItem,
      original_price: savedItem.originalPrice,
      image: formatImageUrl(savedItem.imageUrl),
      image_url: formatImageUrl(savedItem.imageUrl),
    };
  }

  /**
   * Bật / tắt còn món hoặc hết món nhanh 1-chạm
   */
  async toggleMenuItemAvailability(userId: number, menuItemId: number, isAvailable: boolean) {
    const item = await this.menuItemRepo.findOne({ where: { id: menuItemId } });
    if (!item) {
      throw new NotFoundException('Không tìm thấy món ăn!');
    }
    await this.verifyMerchantPermission(userId, item.listingId);
    item.isAvailable = isAvailable;
    await this.menuItemRepo.save(item);
    return {
      success: true,
      id: item.id,
      is_available: item.isAvailable,
      message: item.isAvailable ? 'Món ăn đã sẵn sàng phục vụ' : 'Đã chuyển sang tạm hết món hôm nay',
    };
  }

  /**
   * Xóa món ăn với kiểm tra quyền
   */
  async deleteMerchantMenuItem(userId: number, menuItemId: number) {
    const item = await this.menuItemRepo.findOne({ where: { id: menuItemId } });
    if (!item) {
      throw new NotFoundException('Không tìm thấy món ăn cần xóa!');
    }
    // Kiểm tra quyền đối với quán chứa món này
    await this.verifyMerchantPermission(userId, item.listingId);
    await this.menuItemRepo.remove(item);
    return { success: true, message: 'Đã xóa món ăn khỏi thực đơn' };
  }

  /**
   * Bật / tắt trạng thái mở cửa quán
   */
  async toggleStoreStatus(userId: number, listingId: number, isOpen: boolean) {
    const listing = await this.verifyMerchantPermission(userId, listingId);
    let params: any = listing.jsonParams || {};
    if (typeof params === 'string') {
      try { params = JSON.parse(params); } catch (_) { params = {}; }
    }
    params.is_open = isOpen;
    listing.jsonParams = params;
    await this.listingRepo.save(listing);
    return { success: true, is_open: isOpen, listing_id: listingId };
  }

  /**
   * Thống kê doanh thu thực tế và món bán chạy của quán theo chu kỳ
   */
  async getStoreRevenueStats(storeId: number, period: string = 'today') {
    const numStoreId = Number(storeId);
    const now = new Date();
    let startDate: Date | null = null;

    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    }

    const allOrders = await this.orderRepo.find({
      where: { listingId: numStoreId },
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });

    const filteredOrders = allOrders.filter((o) => {
      if (!startDate) return true;
      const orderDate = new Date(o.createdAt);
      return orderDate >= startDate;
    });

    let totalRevenue = 0;
    let completedRevenue = 0;
    let completedCount = 0;
    let shippingCount = 0;
    let cookingCount = 0;
    let cancelledCount = 0;
    let codAmount = 0;
    let onlineAmount = 0;

    const dishSalesMap: { [name: string]: { name: string; quantity: number; totalRevenue: number } } = {};

    for (const o of filteredOrders) {
      const isCompleted = o.orderStatus === 'completed' || o.orderStatus === 'delivered';
      const isShipping = o.orderStatus === 'shipping' || o.orderStatus === 'delivering';
      const isCooking = o.orderStatus === 'preparing' || o.orderStatus === 'cooking';
      const isCancelled = o.orderStatus === 'cancelled' || o.orderStatus === 'rejected';
      const amount = Number(o.totalAmount || 0);

      if (isCancelled) {
        cancelledCount++;
      } else {
        if (isCompleted) {
          completedCount++;
          completedRevenue += amount;
        } else if (isShipping) {
          shippingCount++;
        } else if (isCooking) {
          cookingCount++;
        }

        totalRevenue += amount;

        const isOnline =
          o.paymentStatus === 'paid' ||
          o.paymentMethod === 'vietqr' ||
          o.paymentMethod === 'online' ||
          o.paymentMethod === 'banking' ||
          o.paymentMethod === 'transfer' ||
          o.paymentMethod === 'momo';
        if (isOnline) {
          onlineAmount += amount;
        } else {
          codAmount += amount;
        }

        if (o.items && o.items.length > 0) {
          for (const it of o.items) {
            const dishName = it.name?.trim() || 'Món ăn';
            const qty = Number(it.quantity || 1);
            const price = Number(it.price || 0);
            if (!dishSalesMap[dishName]) {
              dishSalesMap[dishName] = { name: dishName, quantity: 0, totalRevenue: 0 };
            }
            dishSalesMap[dishName].quantity += qty;
            dishSalesMap[dishName].totalRevenue += price * qty;
          }
        }
      }
    }

    const totalOrders = filteredOrders.length;
    const acceptanceRate =
      totalOrders > 0 ? Math.round(((totalOrders - cancelledCount) / totalOrders) * 100) : 100;

    const topSellingDishes = Object.values(dishSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const recentSoldOrders = filteredOrders
      .filter((o) => o.orderStatus !== 'cancelled' && o.orderStatus !== 'rejected')
      .slice(0, 20)
      .map((o) => {
        let customerName = 'Khách hàng';
        let customerPhone = '';
        if (o.deliveryAddress) {
          const match = o.deliveryAddress.match(/Người nhận:\s*([^(]+)\s*\(([^)]+)\)/);
          if (match) {
            customerName = match[1].trim();
            customerPhone = match[2].trim();
          }
        }
        return {
          id: o.id,
          order_code: o.orderCode || `OD${o.id}`,
          customer_name: customerName,
          customer_phone: customerPhone,
          total_amount: Number(o.totalAmount || 0),
          order_status: o.orderStatus,
          payment_method: o.paymentMethod || 'cash',
          is_paid: o.paymentStatus === 'paid' || o.paymentMethod === 'vietqr' || o.paymentMethod === 'online',
          created_at: o.createdAt,
          items_count: o.items?.length || 0,
          items:
            o.items?.map((it) => ({
              name: it.name,
              quantity: it.quantity,
              price: it.price,
            })) || [],
        };
      });

    return {
      period,
      total_revenue: totalRevenue,
      completed_revenue: completedRevenue,
      completed_orders_count: completedCount,
      shipping_orders_count: shippingCount,
      cooking_orders_count: cookingCount,
      cancelled_orders_count: cancelledCount,
      total_orders_count: totalOrders,
      acceptance_rate: acceptanceRate,
      cod_amount: codAmount,
      online_amount: onlineAmount,
      top_selling_dishes: topSellingDishes,
      recent_sold_orders: recentSoldOrders,
    };
  }

  /**
   * Lấy danh sách đánh giá của quán & món ăn từ CSDL
   */
  async getStoreReviews(storeId: number, starFilter?: number) {
    const numStoreId = Number(storeId);
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .where('r.target_id = :storeId', { storeId: numStoreId })
      .andWhere("r.target_type = 'listings'")
      .orderBy('r.id', 'DESC');

    if (starFilter && Number(starFilter) > 0) {
      qb.andWhere('r.rating = :star', { star: Number(starFilter) });
    }

    const allStoreReviews = await this.reviewRepo.find({
      where: { targetId: numStoreId, targetType: 'listings' },
      order: { id: 'DESC' },
    });

    const reviews = await qb.getMany();

    const starCounts: { [key: number]: number } = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumRating = 0;

    for (const r of allStoreReviews) {
      const star = Math.min(5, Math.max(1, Number(r.rating) || 5));
      starCounts[star] = (starCounts[star] || 0) + 1;
      sumRating += star;
    }

    const totalCount = allStoreReviews.length;
    const averageRating = totalCount > 0 ? Number((sumRating / totalCount).toFixed(1)) : 5.0;

    const formattedReviews = reviews.map((r) => {
      let dishReview: any = null;
      let ownerReply: any = null;
      let images: string[] = [];

      if (r.jsonParams) {
        let params = r.jsonParams;
        if (typeof params === 'string') {
          try {
            params = JSON.parse(params);
          } catch (_) { }
        }
        if (params) {
          dishReview =
            params.dish_review ||
            params.dishes ||
            (params.dish_name
              ? { name: params.dish_name, rating: params.dish_rating || r.rating, comment: params.dish_comment }
              : null);
          ownerReply = params.owner_reply || params.reply || null;
          images = Array.isArray(params.images) ? params.images : [];
        }
      }

      return {
        id: r.id,
        name: r.name || 'Khách hàng Toplist',
        rating: Number(r.rating) || 5,
        comment: r.comment || 'Trải nghiệm ẩm thực tuyệt vời!',
        created_at: r.createdAt,
        dish_review: dishReview,
        owner_reply: ownerReply,
        images: images,
      };
    });

    return {
      store_id: numStoreId,
      average_rating: averageRating,
      total_reviews: totalCount,
      rating_distribution: starCounts,
      reviews: formattedReviews,
    };
  }

  /**
   * Chủ quán phản hồi đánh giá của khách hàng
   */
  async replyStoreReview(userId: number, reviewId: number, replyText: string) {
    const review = await this.reviewRepo.findOne({ where: { id: Number(reviewId) } });
    if (!review) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    const store = await this.listingRepo.findOne({ where: { id: review.targetId } });

    let params: any = review.jsonParams || {};
    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch (_) {
        params = {};
      }
    }

    const u = await this.userRepo.findOne({ where: { id: userId } });
    const merchantName = u?.name || store?.name || 'Tian Long Quán';

    params.owner_reply = {
      name: merchantName,
      reply: replyText.trim(),
      user_id: userId,
      replied_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    review.jsonParams = params;
    await this.reviewRepo.save(review);

    return {
      success: true,
      review_id: review.id,
      owner_reply: params.owner_reply,
    };
  }

  /**
   * Khách hàng gửi đánh giá cho quán & các món ăn
   */
  async createStoreReview(
    userId: number,
    storeId: number,
    rating: number,
    comment: string,
    dishReviews?: any,
    images?: string[],
  ) {
    const u = await this.userRepo.findOne({ where: { id: userId } });
    const review = this.reviewRepo.create({
      name: u?.name || 'Khách hàng Toplist',
      phone: u?.phone || null,
      email: u?.email || null,
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      comment: comment.trim(),
      status: 'approved',
      targetType: 'listings',
      targetId: Number(storeId),
      userId: userId,
      jsonParams: {
        dish_review: dishReviews || null,
        images: images || [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const saved = await this.reviewRepo.save(review);
    return {
      success: true,
      review: saved,
    };
  }
}

function resolveFoodImage(dishName: string, categoryName: string, dishId: any): string {
  const text = `${dishName || ''} ${categoryName || ''}`.toLowerCase();
  const numId = Math.abs(parseInt(dishId, 10) || 0);

  // 1. Phở / Bún / Miến / Mì / Hủ tiếu
  if (text.includes('phở') || text.includes('pho')) {
    const pool = [
      'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1634818462211-be4565b16f73?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1576577445504-6af96477db52?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('bún bò') || text.includes('bun bo')) {
    const pool = [
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1594998893017-36147cbcae05?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('bún chả') || text.includes('bún đậu') || text.includes('bún')) {
    const pool = [
      'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('mì cay') || text.includes('ramen') || text.includes('mì')) {
    const pool = [
      'https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 2. Cơm các loại
  if (text.includes('cơm gà') || text.includes('gà xối mỡ') || text.includes('gà quay')) {
    const pool = [
      'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('cơm tấm') || text.includes('sườn nướng') || text.includes('cơm sườn')) {
    const pool = [
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('cơm thố') || text.includes('cơm niêu') || text.includes('cơm rang') || text.includes('cơm chiên')) {
    const pool = [
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('cơm')) {
    const pool = [
      'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 3. Bò né, bít tết, bò chảo
  if (text.includes('bò né') || text.includes('bít tết') || text.includes('steak') || text.includes('bò chảo') || text.includes('bò')) {
    const pool = [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 4. Gà rán
  if (text.includes('gà rán') || text.includes('cánh gà') || text.includes('chicken') || text.includes('gà')) {
    const pool = [
      'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 5. Hải sản, Ốc
  if (text.includes('ốc') || text.includes('nghêu') || text.includes('sò') || text.includes('hàu')) {
    const pool = [
      'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('hải sản') || text.includes('tôm') || text.includes('cua') || text.includes('mực') || text.includes('cá')) {
    const pool = [
      'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 6. Lươn đặc sản Nghệ An
  if (text.includes('lươn') || text.includes('súp lươn') || text.includes('cháo lươn')) {
    return 'https://toplistnghean.vn/storage/media/sup-luon-nghe-an-toplistnghean13.jpg';
  }

  // 7. Bánh mì / Bánh mướt / Nem / Cuốn
  if (text.includes('bánh mì') || text.includes('banh mi') || text.includes('bánh mỳ')) {
    const pool = [
      'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('bánh mướt') || text.includes('bánh cuốn') || text.includes('nem') || text.includes('ram')) {
    const pool = [
      'https://toplistnghean.vn/storage/media/2026/04/banh-muot-dien-chau-toplistnghean.webp',
      'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 8. Lẩu, Nướng, BBQ
  if (text.includes('lẩu') || text.includes('hotpot')) {
    const pool = [
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('nướng') || text.includes('bbq') || text.includes('dê') || text.includes('nhậu')) {
    const pool = [
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 9. Pizza, Fastfood
  if (text.includes('pizza')) {
    const pool = [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('burger') || text.includes('khoai tây')) {
    const pool = [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // 10. Đồ uống
  if (text.includes('trà sữa') || text.includes('milk tea') || text.includes('boba') || text.includes('trân châu')) {
    const pool = [
      'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('cà phê') || text.includes('coffee') || text.includes('cafe')) {
    const pool = [
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }
  if (text.includes('trà') || text.includes('tea') || text.includes('nước') || text.includes('sinh tố') || text.includes('chè')) {
    const pool = [
      'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
    ];
    return pool[numId % pool.length];
  }

  // Curated diverse delicious food fallbacks
  const diversePool = [
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80',
  ];
  return diversePool[numId % diversePool.length];
}

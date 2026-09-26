import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, LessThan, DataSource } from 'typeorm';
import { Listing } from '../../entities/listing.entity';
import { HotelRoom } from '../../entities/hotel-room.entity';

// Công thức Haversine tính khoảng cách (km) giữa 2 tọa độ
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SERVICES = [
  { id: 'food', name: 'Đồ ăn', icon: 'restaurant', route: 'restaurants' },
  { id: 'hotel', name: 'Khách sạn', icon: 'hotel', route: 'hotels' },
  { id: 'cafe', name: 'Cà phê', icon: 'coffee', route: 'cafes' },
  { id: 'ship', name: 'Giao hàng', icon: 'local_shipping', route: 'ship' },
  { id: 'tourist', name: 'Du lịch', icon: 'tour', route: 'tourist' },
  { id: 'spa', name: 'Spa', icon: 'spa', route: 'spa' },
  { id: 'toplist', name: 'Toplist', icon: 'star', route: 'explore' },
  { id: 'more', name: 'Thêm', icon: 'apps', route: 'category' },
];

import { PromotionService } from '../promotion/promotion.service';

@Injectable()
export class HomepageService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(HotelRoom)
    private readonly hotelRoomRepo: Repository<HotelRoom>,
    private readonly promotionService: PromotionService,
    private readonly dataSource: DataSource,
  ) {}

  async getPublicConfig() {
    const defaults = {
      min_dish_price: 5000,
      max_dish_price: 5000000,
      platform_commission_rate: 10,
      max_tags_per_dish: 5,
    };
    try {
      const rows = await this.dataSource.query(
        'SELECT option_value FROM options WHERE option_name = ? LIMIT 1',
        ['system_operational_config'],
      );
      if (rows && rows.length > 0 && rows[0].option_value) {
        return { ...defaults, ...JSON.parse(rows[0].option_value) };
      }
    } catch (_) {}
    return defaults;
  }

  async getServiceFeeConfig(foodSubtotal: number = 100000, now: Date = new Date()) {
    const defaultServiceFeeConfig = {
      enabled: true,
      calculation_mode: 'PERCENTAGE',
      normal_rate_percent: 2,
      min_fee: 1000,
      max_fee: 50000,
      peak_hour_enabled: true,
      peak_rate_percent: 3,
      peak_ranges: [
        { start: '11:00', end: '13:30', label: 'Giờ cao điểm trưa' },
        { start: '17:30', end: '20:00', label: 'Giờ cao điểm tối' },
      ],
      night_fee_enabled: true,
      night_surcharge_amount: 3000,
      night_start: '22:00',
      night_end: '06:00',
      weather_mode: 'NORMAL',
      weather_surcharge_rain: 2000,
      weather_surcharge_storm: 5000,
    };

    let config = defaultServiceFeeConfig;
    try {
      const rows = await this.dataSource.query(
        'SELECT option_value FROM options WHERE option_name = ? LIMIT 1',
        ['system_operational_config'],
      );
      if (rows && rows.length > 0 && rows[0].option_value) {
        const parsed = JSON.parse(rows[0].option_value);
        if (parsed.service_fee_config) {
          config = { ...defaultServiceFeeConfig, ...parsed.service_fee_config };
        }
      }
    } catch (_) {}

    if (config.enabled === false) {
      return {
        enabled: false,
        rate_percent: 0,
        base_fee: 0,
        peak_surcharge: 0,
        night_surcharge: 0,
        weather_surcharge: 0,
        total_service_fee: 0,
        is_peak: false,
        is_night: false,
        weather_mode: config.weather_mode || 'NORMAL',
        breakdown_labels: ['Miễn phí dịch vụ & tiện ích'],
        config,
      };
    }

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMin;

    let isPeak = false;
    let peakLabel = '';
    if (config.peak_hour_enabled && Array.isArray(config.peak_ranges)) {
      for (const range of config.peak_ranges) {
        if (!range.start || !range.end) continue;
        const [sH, sM] = range.start.split(':').map(Number);
        const [eH, eM] = range.end.split(':').map(Number);
        const startVal = sH * 60 + (sM || 0);
        const endVal = eH * 60 + (eM || 0);
        if (currentTimeVal >= startVal && currentTimeVal <= endVal) {
          isPeak = true;
          peakLabel = range.label || `${range.start} - ${range.end}`;
          break;
        }
      }
    }

    let isNight = false;
    let nightSurcharge = 0;
    if (config.night_fee_enabled) {
      const [nsH, nsM] = (config.night_start || '22:00').split(':').map(Number);
      const [neH, neM] = (config.night_end || '06:00').split(':').map(Number);
      const nStartVal = nsH * 60 + (nsM || 0);
      const nEndVal = neH * 60 + (neM || 0);
      if (currentTimeVal >= nStartVal || currentTimeVal < nEndVal) {
        isNight = true;
        nightSurcharge = Number(config.night_surcharge_amount ?? 3000);
      }
    }

    const effectiveRatePercent = isPeak
      ? Number(config.peak_rate_percent ?? 3)
      : Number(config.normal_rate_percent ?? 2);

    let baseFeeFromPercent = Math.round((foodSubtotal * effectiveRatePercent) / 100);
    const minFee = Number(config.min_fee ?? 1000);
    if (baseFeeFromPercent < minFee) {
      baseFeeFromPercent = minFee;
    }
    const maxFee = Number(config.max_fee ?? 50000);
    if (maxFee > 0 && baseFeeFromPercent > maxFee) {
      baseFeeFromPercent = maxFee;
    }

    // Round up to nearest 500đ
    baseFeeFromPercent = Math.ceil(baseFeeFromPercent / 500) * 500;

    let weatherSurcharge = 0;
    const wMode = config.weather_mode || 'NORMAL';
    if (wMode === 'RAIN') {
      weatherSurcharge = Number(config.weather_surcharge_rain ?? 2000);
    } else if (wMode === 'STORM') {
      weatherSurcharge = Number(config.weather_surcharge_storm ?? 5000);
    }

    const totalFee = baseFeeFromPercent + nightSurcharge + weatherSurcharge;

    const breakdownLabels: string[] = [
      isPeak
        ? `Phí dịch vụ (${effectiveRatePercent}% • ${peakLabel}): ${baseFeeFromPercent.toLocaleString('vi-VN')}đ`
        : `Phí dịch vụ (${effectiveRatePercent}% tiền món): ${baseFeeFromPercent.toLocaleString('vi-VN')}đ`,
    ];
    if (isNight && nightSurcharge > 0) {
      breakdownLabels.push(`Phụ phí đêm khuya (22:00 - 06:00): +${nightSurcharge.toLocaleString('vi-VN')}đ`);
    }
    if (wMode === 'RAIN' && weatherSurcharge > 0) {
      breakdownLabels.push(`Phụ phí thời tiết (Trời mưa): +${weatherSurcharge.toLocaleString('vi-VN')}đ`);
    } else if (wMode === 'STORM' && weatherSurcharge > 0) {
      breakdownLabels.push(`Phụ phí thời tiết (Mưa bão lớn): +${weatherSurcharge.toLocaleString('vi-VN')}đ`);
    }

    return {
      enabled: true,
      rate_percent: effectiveRatePercent,
      base_fee: baseFeeFromPercent,
      night_surcharge: nightSurcharge,
      weather_surcharge: weatherSurcharge,
      total_service_fee: totalFee,
      is_peak: isPeak,
      is_night: isNight,
      weather_mode: wMode,
      breakdown_labels: breakdownLabels,
      config,
    };
  }

  async getAppVersion(platform: string = 'android') {
    const defaults = {
      latest_version: '1.0.0',
      min_version: '1.0.0',
      is_force_update: false,
      update_title: 'Bản cập nhật mới',
      update_message: 'Vui lòng cập nhật ứng dụng Toplist Nghệ An để trải nghiệm phiên bản mới nhất!',
      app_store_url: 'https://apps.apple.com',
      play_store_url: 'https://play.google.com/store/apps/details?id=vn.toplistna.app',
    };

    try {
      // 1. Kiểm tra từ bảng app_versions nếu có
      const cleanPlatform = (platform || 'android').toLowerCase().includes('ios') ? 'ios' : 'android';
      const rows = await this.dataSource.query(
        'SELECT * FROM app_versions WHERE platform = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
        [cleanPlatform]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          ...defaults,
          latest_version: row.version || '1.0.0',
          min_version: row.force_update ? row.version : '1.0.0',
          is_force_update: Boolean(row.force_update),
          update_title: 'Bản cập nhật mới',
          update_message: row.message || defaults.update_message,
          play_store_url: row.platform === 'android' && row.update_url ? row.update_url : defaults.play_store_url,
          app_store_url: row.platform === 'ios' && row.update_url ? row.update_url : defaults.app_store_url,
        };
      }

      // 2. Fallback sang bảng options
      const optRows = await this.dataSource.query(
        'SELECT option_value FROM options WHERE option_name = ? LIMIT 1',
        ['app_version_config']
      );
      if (optRows && optRows.length > 0 && optRows[0].option_value) {
        return { ...defaults, ...JSON.parse(optRows[0].option_value) };
      }
    } catch (_) {}

    return defaults;
  }

  async getHomepage(lat?: number, lng?: number) {
    const userLat = lat ?? 18.6796; // Mặc định tọa độ TP Vinh
    const userLng = lng ?? 105.6813;

    // Lấy deals gần nhất (20 địa điểm active gần nhất, sắp xếp theo rating)
    let nearbyListings: Listing[] = [];
    try {
      nearbyListings = await this.listingRepo
        .createQueryBuilder('l')
        .where('l.deleted_at IS NULL')
        .andWhere('l.status = :status', { status: 'active' })
        .andWhere('l.latitude IS NOT NULL')
        .andWhere('l.longitude IS NOT NULL')
        .orderBy('l.rating_avg', 'DESC')
        .limit(20)
        .getMany();
    } catch (e) {
      nearbyListings = [];
    }

    // Tính khoảng cách và filter + sort theo vị trí
    const withDistance = nearbyListings
      .map((l) => ({
        ...l,
        distanceKm: haversineKm(userLat, userLng, Number(l.latitude), Number(l.longitude)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // Lấy deals nổi bật (top rating, priceMin có sẵn)
    const deals = withDistance
      .filter((l) => l.priceMin && l.priceMin > 0)
      .slice(0, 6)
      .map((l) => this.formatListing(l));

    // Lấy món ngon (loại nhà hàng)
    const dbFoods = withDistance
      .filter((l) => ['restaurant', 'cafe'].includes(l.type ?? ''))
      .slice(0, 8)
      .map((l) => this.formatListing(l));

    // Danh sách món ăn cực kỳ hấp dẫn ShopeeFood / GrabFood style (Nghệ An Specialties & Hot Trending Foods)
    const appetizingFoods = [
      {
        id: 101,
        name: 'Súp Lươn Niêu Đất Bà Lan',
        restaurant_name: 'Quán Lươn Bà Lan - 25 Nguyễn Văn Cừ',
        dish_name: 'Súp Lươn Niêu + Bánh Mì Nóng',
        price: 35000,
        original_price: 45000,
        discount_percent: 22,
        rating: 4.9,
        rating_count: 1250,
        sold_count: '1.8k+',
        delivery_time: '15-20 phút',
        distance_km: 1.1,
        ship_fee: '15K',
        image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=500&q=80',
        badge: 'Bán chạy #1',
        tag: 'Freeship 0Đ',
        type: 'restaurant',
      },
      {
        id: 102,
        name: 'Bánh Mướt Giò Nóng Tráng Tay',
        restaurant_name: 'Bánh Mướt Chợ Vinh - Cổng Số 2',
        dish_name: 'Bánh Mướt Giò Lụa Nóng Đặc Biệt',
        price: 20000,
        original_price: 28000,
        discount_percent: 28,
        rating: 4.8,
        rating_count: 890,
        sold_count: '2.1k+',
        delivery_time: '12-18 phút',
        distance_km: 1.8,
        ship_fee: '15K',
        image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
        badge: 'Món sáng hot',
        tag: 'Giảm 25%',
        type: 'restaurant',
      },
      {
        id: 103,
        name: 'Cháo Lươn Niêu Xứ Nghệ',
        restaurant_name: 'Lươn Niêu Xứ Nghệ - 88 Đại Lộ Lê Nin',
        dish_name: 'Cháo Lươn Niêu Đập Trứng Cút',
        price: 40000,
        original_price: 55000,
        discount_percent: 27,
        rating: 4.9,
        rating_count: 2100,
        sold_count: '3.4k+',
        delivery_time: '20-25 phút',
        distance_km: 2.5,
        ship_fee: '20K',
        image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80',
        badge: 'Quán Yêu Thích+',
        tag: 'Voucher 30K',
        type: 'restaurant',
      },
      {
        id: 104,
        name: 'Ram Bánh Mướt Hà Cường',
        restaurant_name: 'Ram Bánh Mướt Hà Cường - 12 Trần Phú',
        dish_name: 'Ram Giòn Rụm + Bánh Mướt Tráng Nóng',
        price: 25000,
        original_price: 35000,
        discount_percent: 28,
        rating: 4.7,
        rating_count: 960,
        sold_count: '1.5k+',
        delivery_time: '15 phút',
        distance_km: 0.8,
        ship_fee: '15K',
        image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=80',
        badge: 'Giao siêu tốc',
        tag: 'Đồng giá 25k',
        type: 'restaurant',
      },
      {
        id: 105,
        name: 'Trà Sữa Ô Long Kem Cheese Trân Châu',
        restaurant_name: 'Tocotoco Vinh - 45 Nguyễn Văn Cừ',
        dish_name: 'Trà Sữa Ô Long Kem Cheese Nướng',
        price: 28000,
        original_price: 42000,
        discount_percent: 33,
        rating: 4.9,
        rating_count: 3400,
        sold_count: '5.2k+',
        delivery_time: '15 phút',
        distance_km: 1.3,
        ship_fee: '15K',
        image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=500&q=80',
        badge: 'Mua 1 Tặng 1',
        tag: 'Bán chạy nhất',
        type: 'cafe',
      },
      {
        id: 106,
        name: 'Bún Chả Nướng Củi Bà Thụ',
        restaurant_name: 'Bún Chả Bà Thụ - 18 Đinh Công Trứ',
        dish_name: 'Suất Bún Chả Nước Mắm Nóng + Nem Giòn',
        price: 35000,
        original_price: 48000,
        discount_percent: 27,
        rating: 4.8,
        rating_count: 1750,
        sold_count: '2.8k+',
        delivery_time: '20 phút',
        distance_km: 2.0,
        ship_fee: '18K',
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=500&q=80',
        badge: 'Cơm Trưa Hot',
        tag: 'Giảm 30%',
        type: 'restaurant',
      },
      {
        id: 107,
        name: 'Cơm Tấm Sườn Bì Chả Trứng',
        restaurant_name: 'Cơm Tấm Sài Gòn - 56 Hà Huy Tập',
        dish_name: 'Cơm Tấm Sườn Nướng Mật Ông Đầy Đủ',
        price: 42000,
        original_price: 55000,
        discount_percent: 23,
        rating: 4.8,
        rating_count: 1420,
        sold_count: '2.6k+',
        delivery_time: '18 phút',
        distance_km: 1.5,
        ship_fee: '15K',
        image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80',
        badge: 'Bữa Trưa No Căng',
        tag: 'Freeship 0Đ',
        type: 'restaurant',
      },
      {
        id: 108,
        name: 'Chè Dừa Dầm & Ăn Vặt Sài Gòn',
        restaurant_name: 'Quán Ăn Vặt - 99 Hồ Tùng Mậu',
        dish_name: 'Chè Dừa Dầm Sốt Kem Dừa Thạch Dừa',
        price: 18000,
        original_price: 25000,
        discount_percent: 28,
        rating: 4.7,
        rating_count: 1100,
        sold_count: '1.9k+',
        delivery_time: '15 phút',
        distance_km: 0.9,
        ship_fee: '12K',
        image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=500&q=80',
        badge: 'Ăn vặt chiều',
        tag: 'Đồng giá 18k',
        type: 'cafe',
      },
    ];

    // Kết hợp dữ liệu từ DB (nếu có) và danh sách mock lôi cuốn
    const foods = dbFoods.length > 0 ? [...dbFoods, ...appetizingFoods] : appetizingFoods;

    // Flash sale items (Món giảm giá chớp nháy ShopeeFood style)
    const flashSales = [
      {
        id: 201,
        name: 'Súp Lươn Special + 2 Bánh Mì',
        shop_name: 'Quán Lươn Bà Lan',
        price: 29000,
        original_price: 50000,
        discount: '-42%',
        image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=500&q=80',
        sold_percent: 0.88,
        sold_text: 'Đã bán 88%',
        stock_text: 'Còn 5 suất',
      },
      {
        id: 202,
        name: 'Bánh Mướt Giò Tráng Tay Nóng',
        shop_name: 'Bánh Mướt Chợ Vinh',
        price: 15000,
        original_price: 30000,
        discount: '-50%',
        image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
        sold_percent: 0.92,
        sold_text: 'Đã bán 92%',
        stock_text: 'Còn 3 suất',
      },
      {
        id: 203,
        name: 'Trà Sữa Trân Châu Đường Đen 500ml',
        shop_name: 'Tocotoco Vinh',
        price: 19000,
        original_price: 39000,
        discount: '-51%',
        image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=500&q=80',
        sold_percent: 0.75,
        sold_text: 'Đã bán 75%',
        stock_text: 'Sắp hết',
      },
      {
        id: 204,
        name: 'Gà Rán Sốt Cay Hàn Quốc (2 miếng)',
        shop_name: 'Chicken Crispy Vinh',
        price: 32000,
        original_price: 55000,
        discount: '-41%',
        image: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=500&q=80',
        sold_percent: 0.64,
        sold_text: 'Đã bán 64%',
        stock_text: 'Còn 10 suất',
      },
    ];

    // Vouchers ShopeeFood style
    const vouchers = [
      {
        code: 'FREESHIP0D',
        title: 'Freeship 0Đ',
        subtitle: 'Đơn từ 0Đ toàn TP Vinh',
        tag: 'Mã Hot',
        color: '#E53935',
      },
      {
        code: 'GIAM30K',
        title: 'Giảm 30.000đ',
        subtitle: 'Đơn từ 99.000đ',
        tag: 'ShopeePay',
        color: '#FF8A00',
      },
      {
        code: 'DEAL1K',
        title: 'Đồng giá 1K',
        subtitle: 'Áp dụng cho khách hàng mới',
        tag: 'Ưu đãi',
        color: '#7B1FA2',
      },
      {
        code: 'HOANXU20',
        title: 'Hoàn 20% Xu',
        subtitle: 'Tối đa 20k xu ToplistPay',
        tag: 'Hoàn xu',
        color: '#00897B',
      },
    ];

    // Flash sales từ Promotion Engine thật
    let realFlashSales: any[] = [];
    try {
      realFlashSales = await this.promotionService.getPublicFlashSales(6);
    } catch (e) {
      realFlashSales = [];
    }
    const finalFlashSales = realFlashSales.length > 0 ? realFlashSales : flashSales;

    // Lấy phòng trống tối nay (loại hotel)
    const hotels = withDistance
      .filter((l) => l.type === 'hotel')
      .slice(0, 6)
      .map((l) => this.formatListing(l));

    return {
      location: 'TP. Vinh, Nghệ An',
      services: SERVICES,
      deals_today: deals,
      foods_nearby: foods,
      flash_sales: finalFlashSales,
      vouchers: vouchers,
      available_rooms: hotels,
    };
  }

  private formatListing(l: any) {
    return {
      id: l.id,
      name: l.name,
      address: l.address,
      type: l.type,
      image: l.thumb || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=60',
      rating_avg: l.ratingAvg ? Number(l.ratingAvg) : 4.8,
      rating_count: l.ratingCount || 120,
      price_min: l.priceMin || 30000,
      price_max: l.priceMax || 60000,
      distance_km: l.distanceKm ? Number(l.distanceKm.toFixed(1)) : 1.2,
      latitude: l.latitude ? Number(l.latitude) : null,
      longitude: l.longitude ? Number(l.longitude) : null,
      brief: l.description ? l.description.substring(0, 100) : 'Quán ăn nổi tiếng tại Vinh, Nghệ An',
    };
  }
}

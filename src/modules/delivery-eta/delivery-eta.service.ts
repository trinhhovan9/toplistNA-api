import { Injectable, Logger } from '@nestjs/common';

export interface RouteEstimateResult {
  distanceKm: number;
  roadDurationMinutes: number;
}

export interface DeliveryEtaResult {
  distanceKm: number;
  roadDurationMinutes: number;
  prepMin: number;
  prepMax: number;
  pickupBufferMin: number;
  pickupBufferMax: number;
  minMinutes: number;
  maxMinutes: number;
  deliveryTime: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class DeliveryEtaService {
  private readonly logger = new Logger(DeliveryEtaService.name);

  // In-memory cache for OSRM routes to avoid spamming the routing server
  // Key format: "round(lat1,3),round(lng1,3)->round(lat2,3),round(lng2,3)"
  // TTL: 15 minutes
  private readonly routeCache = new Map<string, { result: RouteEstimateResult; timestamp: number }>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;

  /**
   * Lấy cự ly đường bộ và thời gian di chuyển qua OSRM (với cache & graceful fallback)
   */
  async getRoadRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteEstimateResult> {
    // Round to 3 decimal places (~110m precision) for cache hits
    const key = `${originLat.toFixed(3)},${originLng.toFixed(3)}->${destLat.toFixed(3)},${destLng.toFixed(3)}`;
    const now = Date.now();

    const cached = this.routeCache.get(key);
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.result;
    }

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });

      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distanceKm = Number((route.distance / 1000).toFixed(1));
          const roadDurationMinutes = Math.max(2, Math.round(route.duration / 60));

          const result = { distanceKm, roadDurationMinutes };
          this.routeCache.set(key, { result, timestamp: now });
          return result;
        }
      }
    } catch (err: any) {
      this.logger.warn(`[OSRM Routing] Error/timeout: ${err?.message}. Using network fallback.`);
    }

    // Graceful Fallback khi OSRM timeout: Haversine * 1.35 hệ số đường bộ đô thị Vinh
    const straightDist = haversineKm(originLat, originLng, destLat, destLng);
    const distanceKm = Number((straightDist * 1.35).toFixed(1));
    const roadDurationMinutes = Math.max(2, Math.round(distanceKm * 2.4));

    const fallbackResult = { distanceKm, roadDurationMinutes };
    this.routeCache.set(key, { result: fallbackResult, timestamp: now });
    return fallbackResult;
  }

  /**
   * Xác định thời gian chuẩn bị (Kitchen Prep Time) theo danh mục/loại món
   */
  resolvePrepTime(categoryOrType?: string, restaurantName?: string): { prepMin: number; prepMax: number } {
    const raw = `${categoryOrType || ''} ${restaurantName || ''}`.toLowerCase();

    // 1. Đồ uống, Trà sữa, Cà phê (Pha chế nhanh: 8 - 12 phút)
    if (
      raw.includes('tra-sua') ||
      raw.includes('trà sữa') ||
      raw.includes('cafe') ||
      raw.includes('cà phê') ||
      raw.includes('coffee') ||
      raw.includes('đồ uống') ||
      raw.includes('chè') ||
      raw.includes('nước ép')
    ) {
      return { prepMin: 8, prepMax: 12 };
    }

    // 2. Fastfood, Đồ ăn vặt (Chiên nướng nhanh: 8 - 12 phút)
    if (
      raw.includes('fastfood') ||
      raw.includes('ăn vặt') ||
      raw.includes('an-vat') ||
      raw.includes('gà rán') ||
      raw.includes('ga-ran') ||
      raw.includes('burger') ||
      raw.includes('khoai tây') ||
      raw.includes('nem chua') ||
      raw.includes('bánh mì')
    ) {
      return { prepMin: 8, prepMax: 12 };
    }

    // 3. Món nấu nóng, Đặc sản, Cơm trưa, Bún phở, Lẩu, Nướng (12 - 16 phút)
    if (
      raw.includes('cơm') ||
      raw.includes('com') ||
      raw.includes('lẩu') ||
      raw.includes('lau') ||
      raw.includes('nướng') ||
      raw.includes('bún') ||
      raw.includes('phở') ||
      raw.includes('lươn') ||
      raw.includes('hải sản') ||
      raw.includes('bò né') ||
      raw.includes('đặc sản')
    ) {
      return { prepMin: 12, prepMax: 16 };
    }

    // 4. Mặc định cho các quán khác: 10 - 14 phút
    return { prepMin: 10, prepMax: 14 };
  }

  /**
   * Tính toán ETA đầy đủ chuẩn FireGo + ToplistNA:
   * minETA = prepMin + roadDuration + bufferMin
   * maxETA = prepMax + roadDuration + bufferMax
   */
  async calculateEta(params: {
    storeLat: number;
    storeLng: number;
    customerLat: number;
    customerLng: number;
    category?: string;
    restaurantName?: string;
    customPrepMin?: number;
    customPrepMax?: number;
  }): Promise<DeliveryEtaResult> {
    const { storeLat, storeLng, customerLat, customerLng } = params;

    // 1. OSRM Road Route
    const route = await this.getRoadRoute(storeLat, storeLng, customerLat, customerLng);

    // 2. Kitchen Preparation Time
    let prepMin: number;
    let prepMax: number;
    if (params.customPrepMin && params.customPrepMax) {
      prepMin = params.customPrepMin;
      prepMax = params.customPrepMax;
    } else {
      const prep = this.resolvePrepTime(params.category, params.restaurantName);
      prepMin = prep.prepMin;
      prepMax = prep.prepMax;
    }

    // 3. Pickup / Dropoff Handover Buffer (2 - 4 phút)
    const pickupBufferMin = 2;
    const pickupBufferMax = 4;

    // 4. Final ETA
    const minMinutes = prepMin + route.roadDurationMinutes + pickupBufferMin;
    const maxMinutes = prepMax + route.roadDurationMinutes + pickupBufferMax;
    const deliveryTime = `${minMinutes}-${maxMinutes} phút`;

    return {
      distanceKm: route.distanceKm,
      roadDurationMinutes: route.roadDurationMinutes,
      prepMin,
      prepMax,
      pickupBufferMin,
      pickupBufferMax,
      minMinutes,
      maxMinutes,
      deliveryTime,
    };
  }

  /**
   * Batch ETA calculation cho danh sách quán
   */
  async calculateBatchEta(
    stores: Array<{
      id: number | string;
      lat: number;
      lng: number;
      category?: string;
      name?: string;
    }>,
    customerLat: number,
    customerLng: number,
  ): Promise<Map<string | number, DeliveryEtaResult>> {
    const results = new Map<string | number, DeliveryEtaResult>();

    const promises = stores.map(async (store) => {
      try {
        const eta = await this.calculateEta({
          storeLat: store.lat,
          storeLng: store.lng,
          customerLat,
          customerLng,
          category: store.category,
          restaurantName: store.name,
        });
        results.set(store.id, eta);
      } catch (_) {
        // Fallback default safe ETA
        results.set(store.id, {
          distanceKm: 1.0,
          roadDurationMinutes: 5,
          prepMin: 10,
          prepMax: 14,
          pickupBufferMin: 2,
          pickupBufferMax: 4,
          minMinutes: 17,
          maxMinutes: 23,
          deliveryTime: '17-23 phút',
        });
      }
    });

    await Promise.all(promises);
    return results;
  }
}

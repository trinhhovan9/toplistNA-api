import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryOrder } from '../../entities/delivery-order.entity';
import { FireGoService } from '../firego/firego.service';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateShipCode(): string {
  return `SH${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function getOsrmRoadRoute(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<{ distanceKm: number; durationMinutes: number }> {
  try {
    // OSRM format: lng,lat;lng,lat
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMinutes = Math.max(1, Math.round(route.duration / 60));
        return { distanceKm, durationMinutes };
      }
    }
  } catch (err: any) {
    console.warn('[OSRM Routing] Error or timeout, falling back to estimated road factor:', err?.message);
  }

  // Fallback: Haversine * 1.35 (hệ số mạng lưới đường bộ đô thị)
  const straightDist = haversineKm(lat1, lng1, lat2, lng2);
  const distanceKm = Number((straightDist * 1.35).toFixed(2));
  const durationMinutes = Math.max(3, Math.round(distanceKm * 2.5 + 4));
  return { distanceKm, durationMinutes };
}

@Injectable()
export class ShipService {
  constructor(
    @InjectRepository(DeliveryOrder)
    private readonly deliveryOrderRepo: Repository<DeliveryOrder>,
    @Inject(forwardRef(() => FireGoService))
    private readonly firegoService: FireGoService,
  ) {}

  async estimate(
    pickupLat: number,
    pickupLng: number,
    deliveryLat: number,
    deliveryLng: number,
    vehicleType?: string,
  ) {
    const est = await this.firegoService.estimateDelivery({
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
    });

    return {
      distance_km: est.distanceKm,
      fare: est.shippingFee,
      duration_minutes: est.durationMin,
      vehicle_type: est.vehicleType,
      pricing_version: est.pricingVersion,
      breakdown: est.breakdown,
    };
  }

  async findDriver(
    userId: number,
    pickupAddress: string,
    pickupLat: number,
    pickupLng: number,
    deliveryAddress: string,
    deliveryLat: number,
    deliveryLng: number,
    packageType: string,
    packageWeight: string,
    recipientName: string,
    recipientPhone: string,
    vehicleType: string,
    note?: string,
  ) {
    const pricing = await this.firegoService.estimateDelivery({
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
      pickupAddress,
      deliveryAddress,
    });
    const distanceKm = pricing.distanceKm;
    const durationMinutes = pricing.durationMin;
    const fare = pricing.shippingFee;

    const order = this.deliveryOrderRepo.create({
      orderCode: generateShipCode(),
      userId,
      pickupAddress,
      pickupLatitude: pickupLat,
      pickupLongitude: pickupLng,
      deliveryAddress,
      deliveryLatitude: deliveryLat,
      deliveryLongitude: deliveryLng,
      packageType,
      packageWeight,
      recipientName,
      recipientPhone,
      vehicleType,
      note,
      distanceKm,
      fare,
      durationMinutes,
      status: 'searching',
    });

    const saved = await this.deliveryOrderRepo.save(order);

    return {
      order_id: saved.id,
      order_code: saved.orderCode,
      status: 'searching',
      distance_km: saved.distanceKm,
      fare: saved.fare,
      duration_minutes: saved.durationMinutes,
      message: 'Đang tìm tài xế gần bạn...',
    };
  }
}

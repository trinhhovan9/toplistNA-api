import { Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Listing } from '../../entities/listing.entity';
import { User } from '../../entities/user.entity';
import { OrderGateway } from '../order/order.gateway';
import { FcmService } from '../notification/fcm.service';
import { NotificationService } from '../notification/notification.service';
import { FoodFinancialSnapshot } from '../order/financial-contract.interface';
import { StoreWalletService } from '../store-wallet/store-wallet.service';

import { getOsrmRoadRoute } from '../ship/ship.service';

// Cache toạ độ GPS mới nhất của tài xế theo orderId / orderCode
export const latestDriverLocations = new Map<string, { lat: number; lng: number; heading: number; speed: number; timestamp: number }>();

// Cache chống duplicate webhook tin nhắn từ tài xế (Idempotency)
export const processedChatMessageIds = new Set<string>();

@Injectable()
export class FireGoService {
  private readonly logger = new Logger(FireGoService.name);

  private get firegoUrl(): string {
    const raw = process.env.FIREGO_API_URL || 'https://api.firego.vn/api';
    return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }

  private get internalSecret(): string {
    return process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';
  }

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly orderGateway: OrderGateway,
    private readonly fcmService: FcmService,
    private readonly notificationService: NotificationService,
    private readonly storeWalletService: StoreWalletService,
  ) {}

  /**
   * Gọi FireGo Pricing Engine để ước tính cước hoặc chốt cước tại checkout
   * POST /api/pricing/estimate
   * Cố định vehicleType: 'bike', serviceType: 'food_delivery' cho ToplistNA
   */
  async estimateDelivery(params: {
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
    pickupAddress?: string;
    deliveryAddress?: string;
  }): Promise<{
    distanceKm: number;
    durationMin: number;
    shippingFee: number;
    vehicleType: string;
    serviceType: string;
    pricingVersion: string;
    driverShareRate: number;
    breakdown: any;
  }> {
    const payload = {
      vehicleType: 'bike',
      serviceType: 'food_delivery',
      pickup: {
        lat: Number(params.pickupLat),
        lng: Number(params.pickupLng),
        address: params.pickupAddress,
      },
      dropoff: {
        lat: Number(params.deliveryLat),
        lng: Number(params.deliveryLng),
        address: params.deliveryAddress,
      },
    };

    const targetUrl = `${this.firegoUrl}/api/pricing/estimate`;
    this.logger.log(`[FireGo Pricing Engine] Requesting estimate: ${JSON.stringify(payload)}`);

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`[FireGo Pricing Engine] Error ${res.status}: ${errorText}`);
        throw new BadRequestException(
          `Không thể tính cước vận chuyển từ FireGo (${res.status}): ${res.statusText || 'Lỗi dịch vụ'}`,
        );
      }

      const data = await res.json();
      return {
        distanceKm: Number(data.distanceKm),
        durationMin: Number(data.durationMin),
        shippingFee: Number(data.shippingFee),
        vehicleType: data.vehicleType || 'bike',
        serviceType: data.serviceType || 'food_delivery',
        pricingVersion: data.pricingVersion || data.configUsed?.pricingVersion || 'v2026.09.18.01',
        driverShareRate: Number(data.driverShare || data.configUsed?.driverSharePercent || 80),
        breakdown: data.breakdown || {},
      };
    } catch (err: any) {
      this.logger.error(`[FireGo Pricing Engine] Connection error: ${err.message}`);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Không thể kết nối đến hệ thống tính cước FireGo: ${err.message}`,
      );
    }
  }

  /**
   * Gọi điều phối tài xế xe máy từ FireGo cho đơn giao đồ ăn ToplistNA
   * POST /api/deliveries/external trên FireGo
   */
  async dispatchToFireGo(orderId: number): Promise<any> {
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['items'] });
    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderId} không tồn tại`);
    }

    // Lấy thông tin quán ăn (Điểm đón / Pickup)
    let storeName = 'Nhà hàng Toplist Nghệ An';
    let storeAddress = 'TP Vinh, Nghệ An';
    let storeLat = 18.6732;
    let storeLng = 105.6881;
    let storePhone = '0988123456';

    if (order.listingId) {
      const listing = await this.listingRepo.findOne({ where: { id: order.listingId } });
      if (listing) {
        if (listing.name) storeName = listing.name;
        if (listing.address) storeAddress = listing.address;
        if (listing.latitude) storeLat = Number(listing.latitude);
        if (listing.longitude) storeLng = Number(listing.longitude);
        if (listing.phone) storePhone = listing.phone;
      }
    }

    // Lấy thông tin khách nhận (Điểm giao / Dropoff)
    let recipientName = 'Khách hàng Toplist';
    let recipientPhone = '0988000111';
    let cleanAddress = order.deliveryAddress || 'TP Vinh, Nghệ An';

    if (order.deliveryAddress) {
      const match = order.deliveryAddress.match(/Người nhận:\s*([^(]+)\s*\(([^)]+)\)/);
      if (match) {
        recipientName = match[1].trim();
        recipientPhone = match[2].trim();
        cleanAddress = order.deliveryAddress.replace(/\s*-\s*Người nhận:.*$/, '').trim();
      }
    }

    // Luôn ưu tiên lấy tên thật và SĐT thật từ cơ sở dữ liệu bảng users nếu chưa có tên thật
    if ((!recipientName || recipientName === 'Khách hàng' || recipientName === 'Khách hàng Toplist') && order.userId) {
      let user = await this.userRepo.findOne({ where: { id: order.userId } });
      if (!user) {
        const users = await this.userRepo.find({ order: { id: 'DESC' }, take: 1 });
        user = users[0] || null;
      }
      if (user) {
        if (user.name && user.name.trim() && user.name.trim() !== 'Khách hàng' && user.name.trim() !== 'Khách hàng Toplist') {
          recipientName = user.name.trim();
        } else if (user.username && user.username.trim()) {
          recipientName = user.username.trim();
        } else if (user.email) {
          recipientName = user.email.split('@')[0];
        }
        if (user.phone && user.phone.trim() && (!recipientPhone || recipientPhone.length < 9)) {
          recipientPhone = user.phone.trim();
        }
      }
    }

    const dropoffLat = order.deliveryLatitude ? Number(order.deliveryLatitude) : 18.6668;
    const dropoffLng = order.deliveryLongitude ? Number(order.deliveryLongitude) : 105.6834;

    // Tính toán cự ly đường xe chạy và thời gian thực tế bằng OSRM
    const { distanceKm, durationMinutes } = await getOsrmRoadRoute(
      storeLat,
      storeLng,
      dropoffLat,
      dropoffLng,
    );

    const formattedItems = (order.items && order.items.length > 0)
      ? order.items.map(it => ({
          name: it.name,
          price: Number(it.price || 0),
          quantity: Number(it.quantity || 1),
          note: it.note || '',
        }))
      : [];

    const isCod = order.paymentMethod === 'cash' || order.paymentMethod === 'cod';
    const subtotal = Number(order.subtotal || 0);
    const shippingFee = Number(order.shippingFee || 0);
    const discountAmount = Number(order.discountAmount || 0);
    const totalAmount = Number(order.totalAmount || 0);

    // Trích xuất snapshot tài chính bất biến từ order
    let financialSnapshot: FoodFinancialSnapshot | null = null;
    if (order.financialBreakdown) {
      try {
        const parsed = JSON.parse(order.financialBreakdown);
        if (parsed && parsed.version && parsed.customerCashExpected !== undefined) {
          financialSnapshot = parsed as FoodFinancialSnapshot;
        }
      } catch (_) {}
    }

    if (!financialSnapshot) {
      const originalSubtotal = Number(order.originalSubtotal || order.subtotal || 0);
      const storeDiscount = Number(order.storeSubsidy || 0);
      const platformDiscount = Number(order.platformSubsidy || 0);
      const commissionBase = Math.max(0, originalSubtotal - storeDiscount);
      const storeCommissionAmount = Math.round(commissionBase * 0.2);
      const restaurantNetSettlement = commissionBase - storeCommissionAmount;
      const driverShareRate = 80;
      const driverShippingReward = Math.round(shippingFee * (driverShareRate / 100));

      financialSnapshot = {
        version: '1.0',
        orderCode: order.orderCode || `OD${order.id}`,
        orderId: order.id,
        paymentMethod: order.paymentMethod || 'cash',
        isCod,
        foodGrossAmount: originalSubtotal,
        discounts: {
          storeFundedTotal: storeDiscount,
          platformFundedTotal: platformDiscount,
          flashSaleStore: 0,
          flashSalePlatform: 0,
          voucherStore: storeDiscount,
          voucherPlatform: platformDiscount,
          splitStore: 0,
          splitPlatform: 0,
        },
        serviceFee: 0,
        shipping: {
          customerShippingFee: shippingFee,
          driverShareRate,
          driverShareVersion: order.pricingVersion || 'v2026.09',
          driverShippingReward,
          firegoPlatformFee: shippingFee - driverShippingReward,
        },
        commissionBase,
        storeCommissionRate: 20,
        storeCommissionAmount,
        restaurantNetSettlement,
        customerCashExpected: isCod ? totalAmount : 0,
        restaurantPickupAmount: 0,
        driverShippingReward,
        totalCustomerPayable: totalAmount,
        createdAt: new Date().toISOString(),
      };
    }

    const itemsSummary = formattedItems.length > 0
      ? formattedItems.map(it => `${it.quantity}x ${it.name}${it.note ? ` (${it.note})` : ''}`).join(', ')
      : 'Món ăn đặt qua ToplistNA';

    const orderNotes = [
      itemsSummary ? `Món: ${itemsSummary}` : '',
      order.note ? `Ghi chú: ${order.note}` : '',
    ].filter(Boolean).join(' | ') || 'Giao đồ ăn Toplist Nghệ An';

    const payload = {
      externalSource: 'TOPLISTNA',
      externalOrderId: order.orderCode || `OD${order.id}`,
      goodsType: 'food',
      weight: '<20',
      vehicle: 'bike', // Đơn thức ăn luôn điều phối xe máy
      pickupAddress: storeAddress,
      pickupCoordinates: [storeLng, storeLat], // GeoJSON [lng, lat]
      dropoffAddress: cleanAddress,
      dropoffCoordinates: [dropoffLng, dropoffLat], // GeoJSON [lng, lat]
      senderName: storeName,
      senderPhone: storePhone,
      recipientName: recipientName,
      recipientPhone: recipientPhone,
      packageDetails: itemsSummary,
      paymentMethod: order.paymentMethod || 'cash',
      paymentStatus: order.paymentStatus || (isCod ? 'unpaid' : 'paid'),
      estimatedPrice: shippingFee || 15000,
      subtotal,
      shippingFee,
      discountAmount,
      totalAmount,
      // Dữ liệu tài chính gốc phục vụ điều phối và ví (Mô hình COD Không Ứng Tiền Quán)
      customerCashExpected: isCod ? totalAmount : 0,
      restaurantPickupAmount: 0,
      driverShippingReward: financialSnapshot.driverShippingReward,
      mustPayToStore: 0,
      mustCollectFromCustomer: isCod ? totalAmount : 0,
      foodCollectionAmount: isCod ? Math.max(0, totalAmount - shippingFee) : 0,
      requiredHold: isCod ? Math.max(0, totalAmount - shippingFee) : 0,
      financialSnapshot: {
        ...financialSnapshot,
        restaurantPickupAmount: 0,
        requiredHold: isCod ? Math.max(0, totalAmount - shippingFee) : 0,
      },
      items: formattedItems,
      distance: `${distanceKm} km`,
      duration: `${durationMinutes} phút`,
      distanceKm,
      durationMinutes,
      notes: orderNotes,
    };

    this.logger.log(`[FireGoService] 🚀 Dispatching order #${order.id} (${order.orderCode}) to FireGo: ${this.firegoUrl}/api/deliveries/external`);

    try {
      const res = await fetch(`${this.firegoUrl}/api/deliveries/external`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FireGo-Secret': this.internalSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`[FireGoService] ❌ FireGo dispatch failed (${res.status}): ${errorText}`);
        throw new BadRequestException(`Lỗi điều phối tài xế từ FireGo: ${errorText}`);
      }

      const data = await res.json();
      this.logger.log(`[FireGoService] ✅ Dispatched successfully to FireGo. Delivery ID: ${data.deliveryId}`);

      // Lưu liên kết deliveryId của FireGo vào đơn hàng
      if (data.deliveryId) {
        order.firegoDeliveryId = data.deliveryId;
        // Đảm bảo đơn hàng vẫn ở trạng thái preparing (đang nấu/chờ tài xế đến), KHÔNG phải shipping
        if (order.orderStatus === 'shipping') {
          order.orderStatus = 'preparing';
        }
        await this.orderRepo.save(order);
      }

      // Phát WebSocket thông báo trạng thái "searching_driver" (Đang tìm tài xế xe máy FireGo)
      const updatePayload = {
        order_id: order.id,
        order_code: order.orderCode,
        order_status: order.orderStatus,
        status: 'searching_driver',
        firego_delivery_status: 'searching_driver',
        searching_driver: true,
        message: 'Đã gửi yêu cầu điều phối, đang tìm tài xế xe máy FireGo gần nhất...',
        payment_status: order.paymentStatus,
        driver: null,
      };
      this.orderGateway.emitOrderUpdate(order.orderCode, updatePayload, order.id);

      return {
        success: true,
        orderId: order.id,
        orderCode: order.orderCode,
        firegoDeliveryId: data.deliveryId,
        status: data.status,
        message: 'Đã gửi yêu cầu điều phối tài xế xe máy sang FireGo thành công!',
      };
    } catch (err: any) {
      this.logger.error(`[FireGoService] ❌ Connection error to FireGo: ${err.message}`);
      throw new BadRequestException(`Không thể kết nối đến hệ thống tài xế FireGo: ${err.message}`);
    }
  }

  /**
   * Gọi FireGo để hủy đơn giao hàng khi Quán hủy đơn (Quy tắc 1)
   */
  async cancelFireGoDelivery(firegoDeliveryId: string, reason: string): Promise<any> {
    if (!firegoDeliveryId) return null;
    this.logger.log(`[FireGoService] 🛑 Requesting FireGo to cancel delivery ${firegoDeliveryId}. Reason: ${reason}`);

    try {
      const res = await fetch(`${this.firegoUrl}/api/deliveries/external/${firegoDeliveryId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FireGo-Secret': this.internalSecret,
        },
        body: JSON.stringify({ reason: reason || 'Quán hủy đơn' }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.warn(`[FireGoService] ⚠️ FireGo cancel response not ok (${res.status}): ${errorText}`);
        return { success: false, error: errorText };
      }

      const data = await res.json();
      this.logger.log(`[FireGoService] ✅ Successfully cancelled FireGo delivery ${firegoDeliveryId}`);
      return data;
    } catch (err: any) {
      this.logger.error(`[FireGoService] ❌ Failed to call FireGo cancel: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Xử lý webhook cập nhật trạng thái đơn hàng & gán tài xế từ FireGo
   */
  async handleDeliveryUpdate(secretHeader: string, payload: any): Promise<any> {
    if (!secretHeader || secretHeader !== this.internalSecret) {
      throw new UnauthorizedException('Sai hoặc thiếu X-FireGo-Secret');
    }

    const { event, deliveryId, externalOrderId, status, driver } = payload;
    this.logger.log(`[FireGoService] 📥 Received webhook delivery-update for order ${externalOrderId}, event: ${event}, status: ${status}`);

    const order = await this.orderRepo.findOne({
      where: [
        { orderCode: externalOrderId },
        { id: isNaN(Number(externalOrderId)) ? -1 : Number(externalOrderId) },
      ],
      relations: ['items'],
    });

    if (!order) {
      this.logger.warn(`[FireGoService] ⚠️ Order not found for externalOrderId: ${externalOrderId}`);
      return { success: false, message: 'Order not found' };
    }

    if (deliveryId && !order.firegoDeliveryId) {
      order.firegoDeliveryId = deliveryId;
    }

    // ⭐ QUY TẮC 2: TÀI XẾ HỦY NHẬN CHUYẾN (ĐƠN TOPLISTNA VẪN SỐNG XUYÊN SUỐT)
    if (event === 'driver_cancelled' || status === 'searching_driver') {
      this.logger.log(`[FireGoService] 🔄 Driver cancelled assignment for order ${order.orderCode}. Keeping order alive in PREPARING status.`);
      order.firegoDriverId = null as any;
      order.driverName = null as any;
      order.driverPhone = null as any;
      order.driverPlate = null as any;
      order.driverVehicle = null as any;
      order.driverAvatar = null as any;
      order.driverRating = null as any;
      order.orderStatus = 'preparing';
      await this.orderRepo.save(order);

      const updatePayload = {
        order_id: order.id,
        order_code: order.orderCode,
        order_status: 'preparing',
        status: 'cooking',
        firego_delivery_status: 'searching_driver',
        message: payload.message || 'Tài xế trước đã hủy nhận cuốc, hệ thống đang điều phối tài xế xe máy khác...',
        payment_status: order.paymentStatus,
        driver: null,
      };

      this.orderGateway.emitOrderUpdate(order.id, updatePayload);
      this.logger.log(`[FireGoService] ⚡ Broadcasted driver_cancelled update to WebSocket room order_${order.id}`);
      return { success: true, order_id: order.id, status: order.orderStatus, searching_driver: true };
    }

    // 1. Nếu tài xế nhận đơn (driver_assigned): Lưu snapshot tài xế vào MySQL
    if (driver) {
      if (driver.id) order.firegoDriverId = driver.id.toString();
      if (driver.name) order.driverName = driver.name;
      if (driver.phone) order.driverPhone = driver.phone;
      if (driver.plate) order.driverPlate = driver.plate;
      if (driver.vehicle) order.driverVehicle = driver.vehicle;
      if (driver.avatar) order.driverAvatar = driver.avatar;
      if (driver.rating) order.driverRating = Number(driver.rating);
    }

    // 2. Chuyển đổi trạng thái từ FireGo sang ToplistNA
    let uiStatus = 'cooking';
    if (status === 'driver_assigned' || status === 'picking_up') {
      // Tài xế đang trên đường đến quán lấy hàng (Step 3: Lấy món / Driver arriving)
      uiStatus = 'picking_up';
    } else if (status === 'delivering') {
      // Tài xế đã nhận món từ quán và đang đi giao cho khách (Step 4: Đang giao)
      order.orderStatus = 'shipping';
      uiStatus = 'shipping';
    } else if (status === 'delivered') {
      // Giao thành công
      order.orderStatus = 'completed';
      if (order.paymentMethod === 'cash') {
        order.paymentStatus = 'paid';
      }
      uiStatus = 'completed';

      // ⭐ TỰ ĐỘNG QUYẾT TOÁN DOANH THU ĐƠN HÀNG VÀO VÍ QUÁN (IDEMPOTENT)
      try {
        await this.storeWalletService.settleOrderRevenue(order);
      } catch (err: any) {
        this.logger.error(`[FireGoService] ❌ Failed to settle store wallet for order ${order.orderCode}: ${err.message}`);
      }
    } else if (status === 'cancelled') {
      order.orderStatus = 'cancelled';
      uiStatus = 'cancelled';
    }

    await this.orderRepo.save(order);

    const driverPayload = {
      id: order.firegoDriverId,
      name: order.driverName || 'Tài xế FireGo',
      phone: order.driverPhone || '',
      plate: order.driverPlate || '',
      vehicle: order.driverVehicle || 'Xe máy',
      avatar: order.driverAvatar || '',
      rating: order.driverRating ? Number(order.driverRating) : 4.9,
      currentLocation: driver?.currentLocation,
    };

    const updatePayload = {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: order.orderStatus,
      status: uiStatus,
      firego_delivery_status: status,
      payment_status: order.paymentStatus,
      driver: driverPayload,
    };

    // Phát WebSocket đến toàn bộ client đang theo dõi đơn (Khách hàng + Chủ quán)
    this.orderGateway.emitOrderUpdate(order.orderCode, updatePayload, order.id);
    this.logger.log(`[FireGoService] ⚡ Broadcasted order update to WebSocket room order_${order.orderCode} & order_${order.id} (Status: ${uiStatus})`);

    // Gửi FCM Push Notification bất đồng bộ tới Khách hàng và Chủ quán
    (async () => {
      try {
        const driverName = order.driverName || 'Tài xế';
        const driverPlate = order.driverPlate ? ` (${order.driverPlate})` : '';

        // 1. Push tới KHÁCH HÀNG
        if (order.userId) {
          let customerTitle = '';
          let customerBody = '';

          if (status === 'driver_assigned') {
            customerTitle = `Đã tìm thấy tài xế! #${order.orderCode}`;
            customerBody = `Tài xế ${driverName}${driverPlate} đã nhận đơn và đang di chuyển đến quán lấy món.`;
          } else if (status === 'picking_up') {
            customerTitle = `Tài xế đang đến quán! #${order.orderCode}`;
            customerBody = `Tài xế ${driverName}${driverPlate} đang di chuyển đến quán lấy món ăn của bạn.`;
          } else if (status === 'delivering') {
            customerTitle = `Đơn hàng #${order.orderCode} đang được giao!`;
            customerBody = `Tài xế ${driverName} đã nhận món từ quán và đang trên đường giao tới bạn. Vui lòng để ý điện thoại nhé!`;
          } else if (status === 'delivered') {
            customerTitle = `Đơn hàng #${order.orderCode} giao thành công!`;
            customerBody = `Chúc bạn có một bữa ăn thật ngon miệng! Cảm ơn bạn đã tin tưởng Toplist Nghệ An.`;
          }

          if (customerTitle) {
            await this.fcmService.sendToUser(
              order.userId,
              customerTitle,
              customerBody,
              {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
                order_status: order.orderStatus,
              },
            );

            await this.notificationService.createNotification({
              userId: order.userId,
              title: customerTitle,
              message: customerBody,
              type: 'App\\Notifications\\OrderNotification',
              data: {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
                order_status: order.orderStatus,
              },
            });
          }
        }

        // 2. Push tới CHỦ QUÁN (khi tài xế nhận đơn)
        if (status === 'driver_assigned' && order.listingId) {
          const listing = await this.listingRepo.findOne({ where: { id: order.listingId } });
          if (listing?.ownerUserId) {
            const storeTitle = `Tài xế đã nhận đơn #${order.orderCode}`;
            const storeBody = `Tài xế ${driverName}${driverPlate} đang đến quán lấy món. Quán vui lòng chuẩn bị sẵn món nhé!`;
            await this.fcmService.sendToUser(
              listing.ownerUserId,
              storeTitle,
              storeBody,
              {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
              },
            );

            await this.notificationService.createNotification({
              userId: listing.ownerUserId,
              title: storeTitle,
              message: storeBody,
              type: 'App\\Notifications\\OrderNotification',
              data: {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
              },
            });
          }
        }
      } catch (pushErr: any) {
        this.logger.warn(`[FireGoService] Push notification error in handleDeliveryUpdate: ${pushErr.message}`);
      }
    })();

    return { success: true, order_id: order.id, status: order.orderStatus };
  }

  /**
   * Xử lý webhook stream toạ độ GPS thời gian thực từ FireGo
   * Không lưu vào MySQL để đảm bảo hiệu năng tối đa (chỉ phát WebSocket)
   */
  async handleDriverLocation(secretHeader: string, payload: any): Promise<any> {
    if (!secretHeader || secretHeader !== this.internalSecret) {
      throw new UnauthorizedException('Sai hoặc thiếu X-FireGo-Secret');
    }

    const { externalOrderId, lat, lng, heading, speed } = payload;
    if (!externalOrderId || lat == null || lng == null) {
      return { success: false, message: 'Invalid GPS payload' };
    }

    // Tìm order nhanh để có cả orderCode và ID
    const order = await this.orderRepo.findOne({
      select: ['id', 'orderCode'],
      where: [
        { orderCode: externalOrderId },
        ...(isNaN(Number(externalOrderId)) ? [] : [{ id: Number(externalOrderId) }]),
      ],
    });

    const numLat = Number(lat);
    const numLng = Number(lng);
    const numHeading = Number(heading || 0);
    const numSpeed = Number(speed || 0);

    // Lưu vào cache toạ độ mới nhất
    latestDriverLocations.set(externalOrderId, { lat: numLat, lng: numLng, heading: numHeading, speed: numSpeed, timestamp: Date.now() });
    if (order?.id) {
      latestDriverLocations.set(String(order.id), { lat: numLat, lng: numLng, heading: numHeading, speed: numSpeed, timestamp: Date.now() });
    }
    if (order?.orderCode) {
      latestDriverLocations.set(order.orderCode, { lat: numLat, lng: numLng, heading: numHeading, speed: numSpeed, timestamp: Date.now() });
    }

    // Phát trực tiếp toạ độ GPS tới màn hình Flutter Map qua WebSocket
    this.orderGateway.emitDriverLocation(
      externalOrderId,
      numLat,
      numLng,
      numHeading,
      numSpeed,
      order?.id,
    );

    return { success: true };
  }

  /**
   * Chủ động truy vấn trạng thái đơn hàng & tài xế từ FireGo và đồng bộ tức thì vào MySQL
   * GET /api/firego/status/:orderId
   */
  async getFireGoDeliveryStatus(orderIdentifier: string | number): Promise<any> {
    const cleanStr = String(orderIdentifier).trim();
    const isNumeric = !isNaN(Number(cleanStr));

    const order = await this.orderRepo.findOne({
      where: [
        { orderCode: cleanStr },
        { orderCode: cleanStr.toUpperCase() },
        { orderCode: cleanStr.startsWith('OD') ? cleanStr : `OD${cleanStr}` },
        ...(isNumeric ? [{ id: Number(cleanStr) }] : []),
      ],
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException(`Đơn hàng ${orderIdentifier} không tồn tại`);
    }

    const queryKey = order.firegoDeliveryId || order.orderCode;
    let firegoData: any = null;

    if (queryKey) {
      try {
        const res = await fetch(`${this.firegoUrl}/api/deliveries/external/status/${queryKey}`, {
          headers: {
            'X-FireGo-Secret': this.internalSecret,
          },
        });
        if (res.ok) {
          firegoData = await res.json();
        }
      } catch (err: any) {
        this.logger.warn(`[FireGoService] Failed to query status from FireGo: ${err.message}`);
      }
    }

    // Nếu bên FireGo đã có tài xế nhận đơn mà MySQL chưa cập nhật:
    if (firegoData && firegoData.driver) {
      const d = firegoData.driver;
      let hasChange = false;

      if (!order.firegoDriverId && d.id) { order.firegoDriverId = d.id; hasChange = true; }
      if (!order.driverName && d.name) { order.driverName = d.name; hasChange = true; }
      if (!order.driverPhone && d.phone) { order.driverPhone = d.phone; hasChange = true; }
      if (!order.driverPlate && d.plate) { order.driverPlate = d.plate; hasChange = true; }
      if (!order.driverVehicle && d.vehicle) { order.driverVehicle = d.vehicle; hasChange = true; }
      if (!order.driverAvatar && d.avatar) { order.driverAvatar = d.avatar; hasChange = true; }
      if (d.rating) { order.driverRating = Number(d.rating); }

      if (firegoData.status === 'delivering' && order.orderStatus !== 'shipping') {
        order.orderStatus = 'shipping';
        hasChange = true;
      } else if (firegoData.status === 'delivered' && order.orderStatus !== 'completed') {
        order.orderStatus = 'completed';
        hasChange = true;
      }

      if (hasChange) {
        await this.orderRepo.save(order);
        this.logger.log(`[FireGoService] 🔄 Auto-synced driver info for order ${order.orderCode} from FireGo`);

        const updatePayload = {
          order_id: order.id,
          order_code: order.orderCode,
          order_status: order.orderStatus,
          status: order.orderStatus === 'shipping' ? 'shipping' : order.orderStatus === 'completed' ? 'completed' : 'picking_up',
          firego_delivery_status: firegoData.status,
          payment_status: order.paymentStatus,
          driver: {
            id: order.firegoDriverId,
            name: order.driverName,
            phone: order.driverPhone,
            plate: order.driverPlate,
            vehicle: order.driverVehicle,
            avatar: order.driverAvatar,
            rating: order.driverRating ? Number(order.driverRating) : 4.9,
            currentLocation: d.currentLocation,
          },
        };
        this.orderGateway.emitOrderUpdate(order.orderCode, updatePayload, order.id);
      }
    }

    const driver = (order.firegoDriverId || order.driverName) ? {
      id: order.firegoDriverId,
      name: order.driverName,
      phone: order.driverPhone,
      plate: order.driverPlate,
      vehicle: order.driverVehicle,
      avatar: order.driverAvatar,
      rating: order.driverRating ? Number(order.driverRating) : 4.9,
    } : null;

    return {
      success: true,
      order_id: order.id,
      order_code: order.orderCode,
      order_status: order.orderStatus,
      firego_delivery_id: order.firegoDeliveryId,
      has_driver: !!driver,
      driver,
      firego_status: firegoData?.status || (driver ? 'driver_assigned' : 'searching_driver'),
    };
  }

  /**
   * Webhook xử lý tin nhắn từ tài xế FireGo gửi về cho khách hàng ToplistNA
   */
  async handleDriverChatMessage(secretHeader: string, payload: any): Promise<any> {
    if (!secretHeader || secretHeader !== this.internalSecret) {
      throw new UnauthorizedException('Sai hoặc thiếu X-FireGo-Secret');
    }

    const { deliveryId, externalOrderId, message } = payload;
    if (!message || !message.text) {
      return { success: false, message: 'Missing message content' };
    }

    // 1. Chống duplicate webhook (Idempotency)
    const msgId = message.id || message.clientMessageId;
    if (msgId) {
      if (processedChatMessageIds.has(msgId)) {
        this.logger.log(`[FireGoService] 🔄 Ignored duplicate webhook message: ${msgId}`);
        return { success: true, duplicate: true };
      }
      processedChatMessageIds.add(msgId);
      if (processedChatMessageIds.size > 2000) {
        const firstKey = processedChatMessageIds.values().next().value;
        if (firstKey) processedChatMessageIds.delete(firstKey);
      }
    }

    this.logger.log(`[FireGoService] 💬 Received driver message for order ${externalOrderId}: "${message.text}"`);

    // 2. Tìm đơn hàng
    const order = await this.orderRepo.findOne({
      where: [
        { firegoDeliveryId: deliveryId },
        { orderCode: externalOrderId },
        { id: isNaN(Number(externalOrderId)) ? -1 : Number(externalOrderId) },
      ],
    });

    if (!order) {
      this.logger.warn(`[FireGoService] ⚠️ Order not found for delivery: ${deliveryId}, external: ${externalOrderId}`);
      return { success: false, message: 'Order not found' };
    }

    const messagePayload = {
      id: message.id,
      clientMessageId: message.clientMessageId,
      order_id: order.id,
      order_code: order.orderCode,
      deliveryId: deliveryId,
      text: message.text,
      senderType: 'driver',
      createdAt: message.createdAt || new Date().toISOString(),
    };

    // 3. Phát Socket.IO tới room của khách hàng
    this.orderGateway.emitOrderMessage(order.id, messagePayload, order.orderCode);
    this.logger.log(`[FireGoService] ⚡ Emitted chat:new_message to room order_${order.id}`);

    return { success: true, messageId: msgId };
  }
}

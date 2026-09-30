import { Injectable, BadRequestException, NotFoundException, Logger, Inject, forwardRef, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Like } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Cart } from '../../entities/cart.entity';
import { CartItem } from '../../entities/cart-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Voucher } from '../../entities/voucher.entity';
import { Listing } from '../../entities/listing.entity';
import { User } from '../../entities/user.entity';
import { OrderGateway } from './order.gateway';
import { FireGoService, latestDriverLocations } from '../firego/firego.service';
import { FcmService } from '../notification/fcm.service';
import { PromotionService } from '../promotion/promotion.service';
import { NotificationService } from '../notification/notification.service';
import { FoodFinancialSnapshot } from './financial-contract.interface';

function generateOrderCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `OD${num}`;
}

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private cancelInterval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly orderGateway: OrderGateway,
    @Inject(forwardRef(() => FireGoService))
    private readonly firegoService: FireGoService,
    private readonly fcmService: FcmService,
    private readonly promotionService: PromotionService,
    private readonly notificationService: NotificationService,
  ) {}

  private getFiregoUrl(): string {
    const raw = process.env.FIREGO_API_URL || 'https://api.firego.vn/api';
    return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }

  onModuleInit() {
    // Chạy kiểm tra định kỳ mỗi 60 giây để tự động hủy các đơn online quá hạn thanh toán (> 15 phút)
    this.cancelInterval = setInterval(() => {
      this.autoCancelExpiredUnpaidOrders().catch((err) => {
        this.logger.warn(`[OrderService] autoCancelExpiredUnpaidOrders interval error: ${err.message}`);
      });
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cancelInterval) {
      clearInterval(this.cancelInterval);
    }
  }

  /**
   * Tự động quét và hủy các đơn hàng online quá hạn thanh toán (> 15 phút)
   */
  async autoCancelExpiredUnpaidOrders() {
    try {
      const expirationThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 phút trước
      const expiredOrders = await this.orderRepo.find({
        where: {
          orderStatus: 'pending_payment',
          paymentStatus: 'unpaid',
          createdAt: LessThan(expirationThreshold),
        },
      });

      if (!expiredOrders || expiredOrders.length === 0) return;

      this.logger.log(`⏰ [OrderService] Tìm thấy ${expiredOrders.length} đơn online quá hạn 15 phút chưa thanh toán. Tiến hành tự động hủy...`);

      for (const order of expiredOrders) {
        order.orderStatus = 'cancelled';
        const reason = 'Tự động hủy do quá hạn thanh toán online (15 phút)';
        order.note = order.note ? `${order.note} | ${reason}` : reason;
        await this.orderRepo.save(order);

        const updatePayload = {
          order_id: order.id,
          order_code: order.orderCode,
          order_status: 'cancelled',
          status: 'cancelled',
          payment_status: 'unpaid',
          cancel_reason: reason,
        };

        // Broadcast WebSocket tới phòng theo dõi đơn
        this.orderGateway.emitOrderUpdate(order.id, updatePayload);
        this.orderGateway.emitOrderUpdate(order.orderCode, updatePayload);

        // Push FCM thông báo cho khách hàng
        if (order.userId) {
          const pushTitle = `Đơn hàng #${order.orderCode} đã bị hủy`;
          const pushBody = `Đơn hàng đã tự động hủy do không hoàn tất thanh toán online trong vòng 15 phút.`;
          await this.fcmService.sendToUser(
            order.userId,
            pushTitle,
            pushBody,
            {
              type: 'order:status_update',
              order_id: order.id,
              order_code: order.orderCode,
              status: 'cancelled',
              order_status: 'cancelled',
            },
          ).catch((e) => this.logger.warn(`Failed to push timeout cancel to user #${order.userId}: ${e.message}`));

          await this.notificationService.createNotification({
            userId: order.userId,
            title: pushTitle,
            message: pushBody,
            type: 'App\\Notifications\\OrderNotification',
            data: {
              type: 'order:status_update',
              order_id: order.id,
              order_code: order.orderCode,
              status: 'cancelled',
              order_status: 'cancelled',
            },
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      this.logger.warn(`[OrderService] autoCancelExpiredUnpaidOrders error: ${err.message}`);
    }
  }


  async getFallbackUser(): Promise<User | null> {
    const users = await this.userRepo.find({ order: { id: 'DESC' }, take: 1 });
    return users[0] || null;
  }

  async checkout(
    userId: number | null,
    deliveryAddress: string,
    paymentMethod: string,
    listingId?: number,
    deliveryLat?: number,
    deliveryLng?: number,
    distanceKm?: number,
    voucherCode?: string,
    note?: string,
    itemsInput?: Array<{ menu_item_id?: number; name?: string; price?: number; quantity: number; note?: string }>,
    recipientNameInput?: string,
    recipientPhoneInput?: string,
    serviceFeeInput?: number,
  ) {
    let originalSubtotal = 0;
    let promotionDiscount = 0;
    let promoStoreDiscount = 0;
    let promoPlatformSubsidy = 0;
    let promoPlatformDiscount = 0;
    const promoReservations: Array<{ promotionItemId: number; qty: number }> = [];
    let finalListingId = listingId && Number(listingId) > 0 ? Number(listingId) : 1;

    // 1. Thu thập danh sách món sơ bộ từ client gửi lên hoặc giỏ hàng DB
    const preliminaryItems: Array<{ menuItemId: number; name?: string; clientPrice?: number; quantity: number; note?: string }> = [];

    if (itemsInput && itemsInput.length > 0) {
      for (const item of itemsInput) {
        preliminaryItems.push({
          menuItemId: item.menu_item_id && item.menu_item_id > 0 ? item.menu_item_id : 1,
          name: item.name,
          clientPrice: item.price,
          quantity: item.quantity > 0 ? item.quantity : 1,
          note: item.note,
        });
      }
    } else {
      if (!userId) throw new BadRequestException('Vui lòng đăng nhập để thanh toán giỏ hàng');
      const cart = await this.cartRepo.findOne({ where: { userId } });
      if (!cart) throw new BadRequestException('Giỏ hàng trống');

      const cartItems = await this.cartItemRepo.find({ where: { cartId: cart.id } });
      if (!cartItems.length) throw new BadRequestException('Giỏ hàng trống');
      if (cart.listingId) finalListingId = cart.listingId;

      for (const ci of cartItems) {
        preliminaryItems.push({
          menuItemId: ci.menuItemId,
          quantity: ci.quantity > 0 ? ci.quantity : 1,
          note: ci.note ?? undefined,
        });
      }

      await this.cartItemRepo.delete({ cartId: cart.id });
      await this.cartRepo.delete({ id: cart.id });
    }

    // 2. Tra cứu Promotion Engine cho các món (Flash Sale / Giảm giá món)
    const dishIds = preliminaryItems.map((pi) => pi.menuItemId).filter((id) => id > 0);
    const promoMap = await this.promotionService.getPromotionsForDishes(dishIds);

    const itemsData: Array<{
      menuItemId: number;
      name: string;
      originalPrice: number;
      price: number;
      discountAmount: number;
      quantity: number;
      note?: string;
      promotionId: number | null;
      promotionType: string | null;
    }> = [];

    for (const item of preliminaryItems) {
      const mi = item.menuItemId > 0 ? await this.menuItemRepo.findOne({ where: { id: item.menuItemId } }) : null;
      if (mi && !mi.isAvailable) throw new BadRequestException(`Món "${mi.name}" hiện không có sẵn`);
      if ((!listingId || Number(listingId) <= 0) && mi?.listingId) {
        finalListingId = mi.listingId;
      }

      const name = mi?.name ?? (item.name && item.name.trim().length > 0 ? item.name.trim() : 'Món ăn Nghệ An');
      const qty = item.quantity;

      // Giá niêm yết gốc (Original Price) - không bao giờ ghi đè
      let originalPrice = mi?.originalPrice && mi.originalPrice > 0 ? mi.originalPrice : (mi?.price ?? (item.clientPrice || 35000));
      if (originalPrice < (mi?.price ?? 0)) {
        originalPrice = mi?.price ?? 35000;
      }

      let salePrice = mi?.price ?? (item.clientPrice || 35000);
      let lineDiscount = 0;
      let appliedPromoId: number | null = null;
      let appliedPromoType: string | null = null;

      // Kiểm tra Promotion Engine
      const promo = promoMap.get(item.menuItemId);
      if (promo) {
        originalPrice = promo.originalPrice > 0 ? promo.originalPrice : originalPrice;
        salePrice = promo.salePrice;
        lineDiscount = Math.max(0, originalPrice - salePrice) * qty;
        appliedPromoId = promo.promotionId;
        appliedPromoType = promo.promoType;

        // Phân bổ nguồn tài trợ khuyến mãi
        if (promo.fundingSource === 'STORE') {
          promoStoreDiscount += lineDiscount;
        } else if (promo.fundingSource === 'PLATFORM') {
          promoPlatformSubsidy += lineDiscount;
          promoPlatformDiscount += lineDiscount;
        } else if (promo.fundingSource === 'SPLIT') {
          const sShare = Math.round((lineDiscount * promo.storeSharePct) / 100);
          const pShare = lineDiscount - sShare;
          promoStoreDiscount += sShare;
          promoPlatformSubsidy += pShare;
          promoPlatformDiscount += pShare;
        }

        promoReservations.push({ promotionItemId: promo.promotionItemId, qty });
      }

      originalSubtotal += originalPrice * qty;
      promotionDiscount += lineDiscount;

      itemsData.push({
        menuItemId: item.menuItemId,
        name,
        originalPrice,
        price: salePrice,
        discountAmount: lineDiscount,
        quantity: qty,
        note: item.note,
        promotionId: appliedPromoId,
        promotionType: appliedPromoType,
      });
    }

    const subtotalAfterPromo = Math.max(0, originalSubtotal - promotionDiscount);

    // 3. FIREGO DELIVERY PRICING: Tính độc lập 100%, không bị ảnh hưởng bởi voucher/promotion
    let pickupLat = 18.6732;
    let pickupLng = 105.6881;
    let pickupAddress = 'TP Vinh, Nghệ An';
    if (finalListingId) {
      const listing = await this.listingRepo.findOne({ where: { id: finalListingId } });
      if (listing) {
        if (listing.latitude) pickupLat = Number(listing.latitude);
        if (listing.longitude) pickupLng = Number(listing.longitude);
        if (listing.address) pickupAddress = listing.address;
      }
    }

    const dLat = deliveryLat !== undefined && deliveryLat !== null ? Number(deliveryLat) : 18.6668;
    const dLng = deliveryLng !== undefined && deliveryLng !== null ? Number(deliveryLng) : 105.6834;

    const pricingRes = await this.firegoService.estimateDelivery({
      pickupLat,
      pickupLng,
      deliveryLat: dLat,
      deliveryLng: dLng,
      pickupAddress,
      deliveryAddress,
    });

    const shippingFee = pricingRes.shippingFee;
    const dist = pricingRes.distanceKm;
    const durationMinutes = pricingRes.durationMin;
    const pricingVersion = pricingRes.pricingVersion;
    const vehicleType = pricingRes.vehicleType;
    const serviceType = pricingRes.serviceType;
    const pricingBreakdown = JSON.stringify(pricingRes.breakdown);

    // 4. VOUCHER ENGINE: Tính giảm giá & phân bổ nguồn tài trợ (STORE, PLATFORM, SPLIT)
    let voucherDiscount = 0;
    let voucherStoreDiscount = 0;
    let voucherPlatformSubsidy = 0;
    let voucherPlatformDiscount = 0;
    let appliedVoucherCode: string | null = null;

    if (voucherCode) {
      const voucher = await this.voucherRepo.findOne({ where: { code: voucherCode.toUpperCase(), status: 'active' } });
      if (voucher && new Date() <= new Date(voucher.expiresAt) && subtotalAfterPromo >= voucher.minOrderValue) {
        appliedVoucherCode = voucher.code;
        if (voucher.discountType === 'percentage') {
          voucherDiscount = Math.round((subtotalAfterPromo * voucher.discountValue) / 100);
          if (voucher.maxDiscount) voucherDiscount = Math.min(voucherDiscount, voucher.maxDiscount);
        } else {
          voucherDiscount = voucher.discountValue;
        }
        voucherDiscount = Math.min(voucherDiscount, subtotalAfterPromo);

        // Phân bổ nguồn tài trợ voucher
        const vFundedBy = (voucher.fundedBy || (voucher.listingId ? 'STORE' : 'PLATFORM')).toUpperCase();
        if (vFundedBy === 'STORE') {
          voucherStoreDiscount = voucherDiscount;
        } else if (vFundedBy === 'PLATFORM') {
          voucherPlatformSubsidy = voucherDiscount;
          voucherPlatformDiscount = voucherDiscount;
        } else if (vFundedBy === 'SPLIT') {
          const sPct = voucher.storeSharePct ?? 50;
          const sAmt = Math.round((voucherDiscount * sPct) / 100);
          const pAmt = voucherDiscount - sAmt;
          voucherStoreDiscount = sAmt;
          voucherPlatformSubsidy = pAmt;
          voucherPlatformDiscount = pAmt;
        }
      }
    }

    // 5. TÍNH TOÁN CÁC BẬC THÁC GIÁ & ĐỐI SOÁT KẾ TOÁN CHUẨN XÁC
    const storeDiscount = promoStoreDiscount + voucherStoreDiscount;
    const platformDiscount = promoPlatformDiscount + voucherPlatformDiscount;
    const platformSubsidy = promoPlatformSubsidy + voucherPlatformSubsidy;
    const storeSubsidy = storeDiscount;
    const discountAmount = promotionDiscount + voucherDiscount;

    // Tiền món khách trả:
    const foodTotal = Math.max(0, originalSubtotal - promotionDiscount - voucherDiscount);

    // Phí dịch vụ tiện ích (Tự động fallback tính từ system config nếu client không gửi)
    let serviceFee = Math.max(0, Number(serviceFeeInput || 0));
    if (serviceFee === 0) {
      try {
        let feeConfig: any = {
          enabled: true,
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
        const optRows = await this.orderRepo.manager.query(
          "SELECT option_value FROM options WHERE option_name = 'system_operational_config' LIMIT 1"
        );
        if (optRows && optRows.length > 0 && optRows[0]?.option_value) {
          const parsed = JSON.parse(optRows[0].option_value);
          if (parsed && parsed.service_fee_config) {
            feeConfig = { ...feeConfig, ...parsed.service_fee_config };
          }
        }
        if (feeConfig.enabled !== false) {
          const now = new Date();
          const currentMinVal = now.getHours() * 60 + now.getMinutes();

          let isPeak = false;
          if (feeConfig.peak_hour_enabled && Array.isArray(feeConfig.peak_ranges)) {
            for (const range of feeConfig.peak_ranges) {
              if (!range.start || !range.end) continue;
              const [sH, sM] = range.start.split(':').map(Number);
              const [eH, eM] = range.end.split(':').map(Number);
              const startVal = sH * 60 + (sM || 0);
              const endVal = eH * 60 + (eM || 0);
              if (currentMinVal >= startVal && currentMinVal <= endVal) {
                isPeak = true;
                break;
              }
            }
          }

          let nightSurcharge = 0;
          if (feeConfig.night_fee_enabled) {
            const [nsH, nsM] = (feeConfig.night_start || '22:00').split(':').map(Number);
            const [neH, neM] = (feeConfig.night_end || '06:00').split(':').map(Number);
            const nStartVal = nsH * 60 + (nsM || 0);
            const nEndVal = neH * 60 + (neM || 0);
            if (currentMinVal >= nStartVal || currentMinVal < nEndVal) {
              nightSurcharge = Number(feeConfig.night_surcharge_amount ?? 3000);
            }
          }

          const effectiveRate = isPeak ? Number(feeConfig.peak_rate_percent || 3) : Number(feeConfig.normal_rate_percent || 2);
          let baseFee = Math.round((originalSubtotal * effectiveRate) / 100);
          baseFee = Math.max(Number(feeConfig.min_fee || 1000), Math.min(Number(feeConfig.max_fee || 50000), baseFee));
          baseFee = Math.ceil(baseFee / 500) * 500;

          let weatherSurcharge = 0;
          const wMode = feeConfig.weather_mode || 'NORMAL';
          if (wMode === 'RAIN') weatherSurcharge = Number(feeConfig.weather_surcharge_rain || 2000);
          else if (wMode === 'STORM') weatherSurcharge = Number(feeConfig.weather_surcharge_storm || 5000);

          serviceFee = baseFee + nightSurcharge + weatherSurcharge;
        }
      } catch (_) {}
    }

    // Tổng tiền khách thanh toán = Tiền món khách trả + Phí giao FireGo + Phí dịch vụ tiện ích:
    const totalAmount = foodTotal + shippingFee + serviceFee;

    // Doanh thu Quán thực nhận = foodTotal + platformSubsidy = originalSubtotal - storeDiscount
    const merchantPayable = foodTotal + platformSubsidy;

    // Trừ số lượng suất bán Flash Sale (nếu có)
    if (promoReservations.length > 0) {
      await this.promotionService.reservePromotionSlots(promoReservations);
    }

    // Tra cứu tỷ lệ hoa hồng sàn cấu hình cho quán (mặc định 20% hoặc từ system config)
    let storeCommissionRate = 20;
    try {
      const opt = await this.orderRepo.manager.query(
        "SELECT option_value FROM options WHERE option_name = 'system_operational_config' LIMIT 1"
      );
      if (opt && opt[0]?.option_value) {
        const parsed = JSON.parse(opt[0].option_value);
        if (parsed.platform_commission_rate !== undefined) {
          storeCommissionRate = Number(parsed.platform_commission_rate);
        }
      }
    } catch (_) {}

    const driverShareRate = pricingRes.driverShareRate || 80;
    const driverShippingReward = Math.round(shippingFee * (driverShareRate / 100));
    const firegoPlatformFee = shippingFee - driverShippingReward;

    // commissionBase = Giá gốc - Giảm giá do quán chịu
    const commissionBase = Math.max(0, originalSubtotal - storeDiscount);
    const storeCommissionAmount = Math.round((commissionBase * storeCommissionRate) / 100);
    const restaurantNetSettlement = commissionBase - storeCommissionAmount;

    const isCod = !paymentMethod || paymentMethod === 'cash' || paymentMethod === 'cod';
    const totalCustomerPayable = totalAmount;
    const customerCashExpected = isCod ? totalCustomerPayable : 0;
    // COD Quán không thu tiền mặt tài xế (restaurantPickupAmount = 0). ToplistNA đối soát trực tiếp vào Ví Quán
    const restaurantPickupAmount = 0;

    const orderCode = generateOrderCode();

    // Financial Snapshot bất biến đóng băng toàn bộ số liệu tài chính của đơn hàng
    const financialSnapshot: FoodFinancialSnapshot = {
      version: '1.0',
      orderCode,
      paymentMethod: paymentMethod || 'cash',
      isCod,
      foodGrossAmount: originalSubtotal,
      discounts: {
        storeFundedTotal: storeDiscount,
        platformFundedTotal: platformDiscount,
        flashSaleStore: promoStoreDiscount,
        flashSalePlatform: promoPlatformDiscount,
        voucherStore: voucherStoreDiscount,
        voucherPlatform: voucherPlatformDiscount,
        splitStore: 0,
        splitPlatform: 0,
        itemBreakdowns: itemsData.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          originalPrice: i.originalPrice,
          salePrice: i.price,
          quantity: i.quantity,
          itemDiscountAmount: i.discountAmount,
          flashSaleStoreDiscount: i.promotionType ? i.discountAmount : 0,
          flashSalePlatformDiscount: 0,
          itemStoreDiscount: 0,
          itemPlatformDiscount: 0,
          promotionId: i.promotionId,
          promotionType: i.promotionType,
        })),
      },
      serviceFee,
      shipping: {
        customerShippingFee: shippingFee,
        driverShareRate,
        driverShareVersion: pricingVersion,
        driverShippingReward,
        firegoPlatformFee,
      },
      commissionBase,
      storeCommissionRate,
      storeCommissionAmount,
      restaurantNetSettlement,
      customerCashExpected,
      restaurantPickupAmount,
      driverShippingReward,
      totalCustomerPayable,
      createdAt: new Date().toISOString(),
    };

    const financialBreakdown = JSON.stringify(financialSnapshot);

    // Trích xuất thông tin người nhận từ chuỗi deliveryAddress nếu có
    let extractedName = '';
    let extractedPhone = '';
    let cleanAddress = deliveryAddress || 'TP Vinh, Nghệ An';

    const match = cleanAddress.match(/Người nhận:\s*([^(]+)\s*\(([^)]+)\)/);
    if (match) {
      extractedName = match[1].trim();
      extractedPhone = match[2].trim();
      cleanAddress = cleanAddress.replace(/\s*-\s*Người nhận:.*$/, '').trim();
    }

    const effectivePhoneDigits = (recipientPhoneInput?.trim() || extractedPhone || '').replace(/[^0-9]/g, '');
    const rawCustomerName = recipientNameInput?.trim() || extractedName || '';

    // Tìm user thật trong database theo thứ tự ưu tiên:
    // 1. userId (nếu client gửi lên hoặc trích xuất được từ token/header)
    // 2. Số điện thoại đặt hàng (khách đã đăng ký tài khoản trong CSDL)
    // 3. Tên người nhận (nếu trùng họ tên hoặc username)
    // 4. Tự động liên kết/tạo hồ sơ thành viên cho số điện thoại nếu hợp lệ
    // 5. Fallback user hệ thống an toàn để không bao giờ làm gián đoạn đặt món
    let realUser: User | null = null;
    let resolvedUserId = userId && Number(userId) > 0 ? Number(userId) : null;

    if (resolvedUserId) {
      realUser = await this.userRepo.findOne({ where: { id: resolvedUserId } });
    }

    if (!realUser && effectivePhoneDigits.length >= 9) {
      realUser = await this.userRepo.findOne({
        where: [
          { phone: effectivePhoneDigits },
          { phone: '0' + effectivePhoneDigits.replace(/^84/, '') },
          { phone: effectivePhoneDigits.replace(/^0/, '84') },
        ],
        order: { id: 'DESC' },
      });
      if (realUser) resolvedUserId = Number(realUser.id);
    }

    if (!realUser && rawCustomerName && rawCustomerName !== 'Khách hàng' && rawCustomerName !== 'Khách hàng Toplist') {
      realUser = await this.userRepo.findOne({
        where: [
          { name: rawCustomerName },
          { username: rawCustomerName },
        ],
        order: { id: 'DESC' },
      });
      if (realUser) resolvedUserId = Number(realUser.id);
    }

    if (!realUser && effectivePhoneDigits.length >= 9) {
      try {
        const newCustomer = this.userRepo.create({
          name: rawCustomerName || 'Khách hàng',
          username: `cust_${effectivePhoneDigits}`,
          phone: effectivePhoneDigits,
          role: 'Thành viên',
        });
        realUser = await this.userRepo.save(newCustomer);
        resolvedUserId = Number(realUser.id);
      } catch (err) {
        realUser = await this.userRepo.findOne({
          where: [{ username: `cust_${effectivePhoneDigits}` }, { phone: effectivePhoneDigits }],
        });
        if (realUser) resolvedUserId = Number(realUser.id);
      }
    }

    if (!realUser) {
      const users = await this.userRepo.find({ order: { id: 'DESC' }, take: 1 });
      realUser = users[0] || null;
    }

    const finalUserId = realUser ? Number(realUser.id) : (resolvedUserId || 1);

    let effectiveCustomerName = recipientNameInput?.trim() || '';
    if (!effectiveCustomerName || effectiveCustomerName === 'Khách hàng' || effectiveCustomerName === 'Khách hàng Toplist') {
      if (extractedName && extractedName !== 'Khách hàng' && extractedName !== 'Khách hàng Toplist') {
        effectiveCustomerName = extractedName;
      } else if (realUser) {
        if (realUser.name && realUser.name.trim() && realUser.name.trim() !== 'Khách hàng' && realUser.name.trim() !== 'Khách hàng Toplist') {
          effectiveCustomerName = realUser.name.trim();
        } else if (realUser.username && realUser.username.trim()) {
          effectiveCustomerName = realUser.username.trim();
        } else if (realUser.email) {
          effectiveCustomerName = realUser.email.split('@')[0];
        }
      }
    }
    if (!effectiveCustomerName) {
      effectiveCustomerName = 'Khách hàng';
    }

    let effectiveCustomerPhone = recipientPhoneInput?.trim() || extractedPhone || '';
    if ((!effectiveCustomerPhone || effectiveCustomerPhone.length < 9) && realUser?.phone) {
      effectiveCustomerPhone = realUser.phone.trim();
    }
    if (!effectiveCustomerPhone || effectiveCustomerPhone.length < 9) {
      effectiveCustomerPhone = '0988 123 456';
    }

    const finalDeliveryAddress = `${cleanAddress} - Người nhận: ${effectiveCustomerName} (${effectiveCustomerPhone})`;

    const now = new Date();
    const order = this.orderRepo.create({
      orderCode,
      userId: finalUserId,
      listingId: finalListingId,
      deliveryAddress: finalDeliveryAddress,
      deliveryLatitude: dLat,
      deliveryLongitude: dLng,
      distanceKm: dist,
      durationMinutes,
      pricingVersion,
      vehicleType,
      serviceType,
      pricingBreakdown,
      originalSubtotal,
      promotionDiscount,
      storeDiscount,
      platformDiscount,
      foodTotal,
      subtotal: foodTotal,
      shippingFee,
      discountAmount,
      totalAmount,
      storeSubsidy,
      platformSubsidy,
      merchantPayable,
      financialBreakdown,
      note: note || undefined,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: 'unpaid',
      orderStatus: (paymentMethod && paymentMethod !== 'cash' && paymentMethod !== 'cod') ? 'pending_payment' : 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const savedOrder = await this.orderRepo.save(order) as Order;

    const savedItems = await Promise.all(
      itemsData.map((d) =>
        this.orderItemRepo.save(
          this.orderItemRepo.create({
            orderId: savedOrder.id,
            menuItemId: d.menuItemId,
            name: d.name,
            originalPrice: d.originalPrice,
            price: d.price,
            discountAmount: d.discountAmount,
            promotionId: d.promotionId,
            promotionType: d.promotionType,
            quantity: d.quantity,
            note: d.note,
          }),
        ),
      ),
    );

    const isOnlinePayment = paymentMethod && paymentMethod !== 'cash' && paymentMethod !== 'cod';

    const orderIsoDate = (savedOrder.createdAt ? new Date(savedOrder.createdAt) : now).toISOString();

    // Build the full response payload
    const responsePayload = {
      id: savedOrder.id,
      order_id: savedOrder.id,
      order_code: savedOrder.orderCode,
      listing_id: finalListingId,
      original_subtotal: originalSubtotal,
      promotion_discount: promotionDiscount,
      store_discount: storeDiscount,
      platform_discount: platformDiscount,
      food_total: foodTotal,
      subtotal: foodTotal,
      shipping_fee: shippingFee,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      total_price: totalAmount,
      store_subsidy: storeSubsidy,
      platform_subsidy: platformSubsidy,
      merchant_payable: merchantPayable,
      payment_method: paymentMethod || 'cash',
      payment_status: 'unpaid',
      order_status: isOnlinePayment ? 'pending_payment' : 'pending',
      customer_name: effectiveCustomerName,
      customer_phone: effectiveCustomerPhone,
      delivery_address: finalDeliveryAddress,
      note: note || '',
      items: savedItems.map((i) => ({
        id: i.id,
        menu_item_id: i.menuItemId,
        name: i.name,
        original_price: i.originalPrice,
        price: i.price,
        discount_amount: i.discountAmount,
        promotion_id: i.promotionId,
        quantity: i.quantity,
        note: i.note,
      })),
      items_count: savedItems.length,
      created_at: orderIsoDate,
      created_at_iso: orderIsoDate,
      order_time: orderIsoDate,
      timestamp: orderIsoDate,
    };

    // Chỉ phát thông báo đơn mới tới Quán nếu là đơn COD (đơn Online chỉ phát khi thanh toán xong PAID)
    if (!isOnlinePayment) {
      this.orderGateway.emitNewOrder(responsePayload);
    }

    // Gửi FCM Push Notifications bất đồng bộ (không chặn response)
    (async () => {
      try {
        const listing = await this.listingRepo.findOne({ where: { id: finalListingId } });
        const storeName = listing?.name || 'Quán ăn';
        const formattedTotal = totalAmount.toLocaleString('vi-VN') + 'đ';

        // 1. Push notification tới CHỦ QUÁN (Chỉ gửi ngay nếu là đơn COD, đơn online đợi Webhook xác nhận)
        if (!isOnlinePayment) {
          const targetStoreOwnerId = listing?.ownerUserId || 817;
          this.logger.log(`📢 [Checkout] Bắn Push thông báo đơn mới (COD) tới Quán #${finalListingId} (Chủ quán #${targetStoreOwnerId})`);
          await this.fcmService.sendToUser(
            targetStoreOwnerId,
            `[ĐƠN HÀNG MỚI (COD)] #${savedOrder.orderCode}`,
            `Khách ${effectiveCustomerName} vừa đặt đơn COD (${savedItems.length} món - ${formattedTotal}) tại "${storeName}". Chạm để xem và xác nhận!`,
            {
              type: 'order:new',
              order_id: savedOrder.id,
              order_code: savedOrder.orderCode,
              listing_id: finalListingId,
              store_name: storeName,
              total_amount: totalAmount,
              customer_name: effectiveCustomerName,
              items_count: savedItems.length,
              isOrderAlert: 'true',
            },
            'alarm',
          );

          // Lưu thông báo vào CSDL cho chủ quán
          await this.notificationService.createNotification({
            userId: targetStoreOwnerId,
            title: `Đơn hàng mới #${savedOrder.orderCode}`,
            message: `Khách ${effectiveCustomerName} vừa đặt đơn COD (${savedItems.length} món - ${formattedTotal}) tại "${storeName}".`,
            type: 'App\\Notifications\\OrderNotification',
            data: {
              type: 'order:new',
              order_id: savedOrder.id,
              order_code: savedOrder.orderCode,
              listing_id: finalListingId,
              store_name: storeName,
              total_amount: totalAmount,
            },
          });
        }

        // 2. Push notification tới KHÁCH HÀNG
        if (savedOrder.userId) {
          const clientTitle = isOnlinePayment ? `Đang chờ thanh toán #${savedOrder.orderCode}` : `Đặt món thành công! #${savedOrder.orderCode}`;
          const clientMsg = isOnlinePayment
            ? `Đơn hàng #${savedOrder.orderCode} (${formattedTotal}) đang chờ thanh toán online.`
            : `Đơn hàng (${savedItems.length} món - ${formattedTotal}) tại "${storeName}" đã gửi tới quán.`;
          await this.fcmService.sendToUser(
            savedOrder.userId,
            clientTitle,
            clientMsg,
            {
              type: 'order:status_update',
              order_id: savedOrder.id,
              order_code: savedOrder.orderCode,
              status: isOnlinePayment ? 'pending_payment' : 'pending',
              store_name: storeName,
            },
            'default',
          );

          // Lưu thông báo vào CSDL cho khách hàng
          await this.notificationService.createNotification({
            userId: savedOrder.userId,
            title: clientTitle,
            message: clientMsg,
            type: 'App\\Notifications\\OrderNotification',
            data: {
              type: 'order:status_update',
              order_id: savedOrder.id,
              order_code: savedOrder.orderCode,
              status: isOnlinePayment ? 'pending_payment' : 'pending',
              total_amount: totalAmount,
              store_name: storeName,
            },
          });
        }
      } catch (notifErr: any) {
        this.logger.warn(`[OrderService] Checkout FCM push notification error: ${notifErr.message}`);
      }
    })();

    return responsePayload;
  }


  async getTracking(orderIdentifier: string | number, _userId?: number) {
    await this.autoCancelExpiredUnpaidOrders();

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

    if (!order) throw new NotFoundException(`Đơn hàng ${orderIdentifier} không tồn tại`);

    const steps = [
      { key: 'pending', label: 'Nhà hàng nhận đơn', done: true },
      { key: 'preparing', label: 'Đang chuẩn bị món', done: ['preparing', 'cooking', 'shipping', 'delivering', 'completed'].includes(order.orderStatus) },
      { key: 'shipping', label: 'Đang giao hàng', done: ['shipping', 'delivering', 'completed'].includes(order.orderStatus) },
      { key: 'completed', label: 'Hoàn thành', done: order.orderStatus === 'completed' },
    ];

    let storeName = 'Nhà hàng Nghệ An';
    let storeAddress = 'TP Vinh, Nghệ An';
    let storeLat = 18.6732;
    let storeLng = 105.6881;
    let storePhone = '0988 123 456';

    if (order.listingId) {
      const l = await this.listingRepo.findOne({ where: { id: Number(order.listingId) } });
      if (l) {
        storeName = l.name || storeName;
        storeAddress = l.address || storeAddress;
        if (l.latitude) storeLat = Number(l.latitude);
        if (l.longitude) storeLng = Number(l.longitude);
        if (l.phone) storePhone = l.phone;
      }
    }

    let driver: any = (order.firegoDriverId || order.driverName) ? {
      id: order.firegoDriverId,
      name: order.driverName,
      phone: order.driverPhone,
      plate: order.driverPlate,
      vehicle: order.driverVehicle,
      avatar: order.driverAvatar,
      rating: order.driverRating ? Number(order.driverRating) : 4.9,
    } : null;

    let driverLocation = latestDriverLocations.get(String(order.id)) || (order.orderCode ? latestDriverLocations.get(order.orderCode) : null);

    // Luôn truy vấn trạng thái & toạ độ mới nhất từ FireGo nếu đơn có liên kết FireGo
    if (order.firegoDeliveryId && (!driver || !driverLocation)) {
      try {
        const firegoUrl = this.getFiregoUrl();
        const secret = process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';
        const res = await fetch(`${firegoUrl}/api/deliveries/external/status/${order.orderCode || order.firegoDeliveryId}`, {
          headers: { 'X-FireGo-Secret': secret },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const fg = await res.json();
          if (fg && fg.driver) {
            if (!driver) {
              driver = {
                id: fg.driver.id,
                name: fg.driver.name,
                phone: fg.driver.phone,
                plate: fg.driver.plate,
                vehicle: fg.driver.vehicle,
                avatar: fg.driver.avatar,
                rating: fg.driver.rating || 4.9,
              };
              order.firegoDriverId = fg.driver.id;
              order.driverName = fg.driver.name;
              order.driverPhone = fg.driver.phone;
              order.driverPlate = fg.driver.plate;
              order.driverVehicle = fg.driver.vehicle;
              order.driverAvatar = fg.driver.avatar;
              order.driverRating = fg.driver.rating;
              if (fg.status === 'delivering') order.orderStatus = 'shipping';
              if (fg.status === 'delivered') order.orderStatus = 'completed';
              await this.orderRepo.save(order);
            }
            // Parse toạ độ GPS của tài xế từ FireGo
            if (fg.driver.currentLocation) {
              const cur = fg.driver.currentLocation;
              const curLat = cur.lat ?? (Array.isArray(cur.coordinates) ? cur.coordinates[1] : undefined);
              const curLng = cur.lng ?? (Array.isArray(cur.coordinates) ? cur.coordinates[0] : undefined);
              if (curLat != null && curLng != null && !isNaN(Number(curLat)) && !isNaN(Number(curLng))) {
                driverLocation = { lat: Number(curLat), lng: Number(curLng), heading: 0, speed: 0, timestamp: Date.now() };
                latestDriverLocations.set(String(order.id), driverLocation);
                if (order.orderCode) latestDriverLocations.set(order.orderCode, driverLocation);
              }
            }
          }
        }
      } catch (err: any) {
        // Fallback silently if FireGo is not reachable
      }
    }

    // Đính kèm toạ độ GPS thời gian thực vào driver object trả về cho client
    if (driver && driverLocation) {
      driver.lat = driverLocation.lat;
      driver.lng = driverLocation.lng;
      driver.heading = driverLocation.heading;
      driver.speed = driverLocation.speed;
      driver.currentLocation = { lat: driverLocation.lat, lng: driverLocation.lng };
    }

    // Trích xuất thông tin người nhận chuẩn xác
    let customerName = 'Khách hàng';
    let customerPhone = '';
    if (order.deliveryAddress) {
      const match = order.deliveryAddress.match(/Người nhận:\s*([^(]+)\s*\(([^)]+)\)/);
      if (match) {
        customerName = match[1].trim();
        customerPhone = match[2].trim();
      }
    }
    if ((!customerName || customerName === 'Khách hàng' || customerName === 'Khách hàng Toplist') && order.userId) {
      const u = await this.userRepo.findOne({ where: { id: order.userId } });
      if (u) {
        if (u.name && u.name.trim() && u.name.trim() !== 'Khách hàng' && u.name.trim() !== 'Khách hàng Toplist') {
          customerName = u.name.trim();
        } else if (u.username && u.username.trim()) {
          customerName = u.username.trim();
        } else if (u.email) {
          customerName = u.email.split('@')[0];
        }
        if (u.phone && !customerPhone) customerPhone = u.phone.trim();
      }
    }

    return {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: order.orderStatus,
      payment_status: order.paymentStatus,
      payment_method: order.paymentMethod || 'cash',
      customer_name: customerName,
      customer_phone: customerPhone,
      recipient_name: customerName,
      recipient_phone: customerPhone,
      driver_id: order.driverId,
      firego_delivery_id: order.firegoDeliveryId,
      driver,
      restaurant_name: storeName,
      restaurant_address: storeAddress,
      restaurant_latitude: storeLat,
      restaurant_longitude: storeLng,
      restaurant_phone: storePhone,
      delivery_address: order.deliveryAddress,
      delivery_latitude: order.deliveryLatitude ? Number(order.deliveryLatitude) : 18.6668,
      delivery_longitude: order.deliveryLongitude ? Number(order.deliveryLongitude) : 105.6834,
      steps,
      items: (order.items || []).map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        note: i.note,
      })),
      subtotal: order.subtotal,
      shipping_fee: order.shippingFee,
      discount_amount: order.discountAmount,
      total_amount: order.totalAmount,
      created_at: (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString(),
      order_time: (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString(),
    };
  }

  async getUserOrders(userId?: number | null, phone?: string | null) {
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : null;

    // BẮT BUỘC phải có tài khoản (userId hợp lệ > 0) hoặc số điện thoại người dùng.
    // Nếu cả 2 đều không có => Khách vãng lai chưa đăng nhập, trả về [] để bảo mật đơn hàng
    if ((!userId || isNaN(Number(userId)) || Number(userId) <= 0) && (!cleanPhone || cleanPhone.length < 9)) {
      return [];
    }

    // Tự động kiểm tra dọn dẹp các đơn online quá hạn thanh toán (> 15 phút)
    await this.autoCancelExpiredUnpaidOrders();

    let whereCondition: any;
    if (userId && Number(userId) > 0 && cleanPhone && cleanPhone.length >= 9) {
      whereCondition = [
        { userId: Number(userId) },
        { deliveryAddress: Like(`%${cleanPhone}%`) },
      ];
    } else if (userId && Number(userId) > 0) {
      whereCondition = { userId: Number(userId) };
    } else {
      whereCondition = { deliveryAddress: Like(`%${cleanPhone}%`) };
    }

    const orders = await this.orderRepo.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      take: 50,
      relations: ['items'],
    });

    const enriched = await Promise.all(
      orders.map(async (o) => {
        let storeName = 'Nhà hàng Nghệ An';
        let storeAddress = 'TP Vinh, Nghệ An';
        let storeLat = 18.6732;
        let storeLng = 105.6881;
        let storePhone = '0988 123 456';
        let storeImage = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=60';

        if (o.listingId) {
          const l = await this.listingRepo.findOne({ where: { id: Number(o.listingId) } });
          if (l) {
            storeName = l.name || storeName;
            storeAddress = l.address || storeAddress;
            if (l.latitude) storeLat = Number(l.latitude);
            if (l.longitude) storeLng = Number(l.longitude);
            if (l.phone) storePhone = l.phone;
            if (l.thumb) {
              const mediaRows = await this.listingRepo.query('SELECT path FROM media WHERE id = ?', [l.thumb]);
              if (mediaRows && mediaRows.length > 0 && mediaRows[0].path) {
                storeImage = `https://toplistnghean.vn/storage/${mediaRows[0].path}`;
              }
            }
          }
        }

        return {
          id: o.id,
          order_id: o.id,
          order_code: o.orderCode,
          listing_id: o.listingId,
          store_name: storeName,
          restaurant_name: storeName,
          store_address: storeAddress,
          restaurant_address: storeAddress,
          restaurant_latitude: storeLat,
          restaurant_longitude: storeLng,
          restaurant_phone: storePhone,
          store_image: storeImage,
          restaurant_image: storeImage,
          delivery_address: o.deliveryAddress,
          delivery_latitude: o.deliveryLatitude ? Number(o.deliveryLatitude) : 18.6668,
          delivery_longitude: o.deliveryLongitude ? Number(o.deliveryLongitude) : 105.6834,
          subtotal: o.subtotal,
          shipping_fee: o.shippingFee,
          discount_amount: o.discountAmount,
          total_amount: o.totalAmount,
          total_price: o.totalAmount,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          order_status: o.orderStatus,
          status: o.orderStatus,
          note: o.note,
          created_at: (o.createdAt ? new Date(o.createdAt) : (o.updatedAt ? new Date(o.updatedAt) : new Date())).toISOString(),
          order_time: (o.createdAt ? new Date(o.createdAt) : (o.updatedAt ? new Date(o.updatedAt) : new Date())).toISOString(),
          items: (o.items || []).map((i) => ({
            id: i.id,
            menu_item_id: i.menuItemId,
            name: i.name,
            item_name: i.name,
            price: i.price,
            unit_price: i.price,
            quantity: i.quantity,
            qty: i.quantity,
            note: i.note,
          })),
        };
      }),
    );

    return enriched;
  }

  /**
   * Lấy danh sách đơn hàng thực tế của một quán (Listing/Store)
   */
  async getStoreOrders(storeId: number, statusFilter?: string) {
    const whereClause: any = { listingId: Number(storeId) };
    if (statusFilter && statusFilter !== 'all') {
      let dbStatus = statusFilter.toLowerCase().trim();
      if (dbStatus === 'new') dbStatus = 'pending';
      else if (dbStatus === 'cooking') dbStatus = 'preparing';
      whereClause.orderStatus = dbStatus;
    }

    const orders = await this.orderRepo.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });

    return Promise.all(
      orders.map(async (o) => {
        let customerName = 'Khách hàng';
        let customerPhone = '0988 123 456';
        let cleanAddress = o.deliveryAddress || 'TP Vinh, Nghệ An';

        if (o.deliveryAddress) {
          const match = o.deliveryAddress.match(/Người nhận:\s*([^(]+)\s*\(([^)]+)\)/);
          if (match) {
            customerName = match[1].trim();
            customerPhone = match[2].trim();
            cleanAddress = o.deliveryAddress.replace(/\s*-\s*Người nhận:.*$/, '').trim();
          }
        }

        if (customerName === 'Khách hàng' && o.userId) {
          const u = await this.userRepo.findOne({ where: { id: o.userId } });
          if (u) {
            if (u.name) customerName = u.name;
            if (u.phone) customerPhone = u.phone;
          }
        }

        let uiStatus = 'new';
        if (o.orderStatus === 'preparing') uiStatus = 'cooking';
        else if (o.orderStatus === 'shipping') uiStatus = 'shipping';
        else if (o.orderStatus === 'completed') uiStatus = 'completed';
        else if (o.orderStatus === 'cancelled') uiStatus = 'cancelled';

        let validDate: Date | null = null;
        if (o.createdAt) {
          const d = new Date(o.createdAt);
          if (!isNaN(d.getTime())) validDate = d;
        } else if (o.updatedAt) {
          const d = new Date(o.updatedAt);
          if (!isNaN(d.getTime())) validDate = d;
        }

        const fallbackDate = new Date();
        const effectiveDate = validDate || fallbackDate;
        const hours = effectiveDate.getHours().toString().padStart(2, '0');
        const minutes = effectiveDate.getMinutes().toString().padStart(2, '0');
        const day = effectiveDate.getDate().toString().padStart(2, '0');
        const month = (effectiveDate.getMonth() + 1).toString().padStart(2, '0');
        const year = effectiveDate.getFullYear();
        const isToday = new Date().toDateString() === effectiveDate.toDateString();
        const createdAtFormatted = isToday
          ? `${hours}:${minutes} - Hôm nay (${day}/${month})`
          : `${hours}:${minutes} - ${day}/${month}/${year}`;
        const createdAtIso = effectiveDate.toISOString();

        const isPaid = o.paymentStatus === 'paid' || o.paymentMethod === 'vietqr' || o.paymentMethod === 'online';

        let driver: any = null;
        if (o.firegoDriverId || o.driverName) {
          driver = {
            id: o.firegoDriverId,
            name: o.driverName,
            phone: o.driverPhone,
            plate: o.driverPlate,
            vehicle: o.driverVehicle,
            avatar: o.driverAvatar,
            rating: o.driverRating ? Number(o.driverRating) : 4.9,
          };
        }

        return {
          id: o.id,
          order_id: o.id,
          order_code: o.orderCode,
          listing_id: o.listingId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: cleanAddress,
          delivery_address: o.deliveryAddress,
          distance_km: o.distanceKm ? Number(o.distanceKm) : 1.8,
          created_at: createdAtFormatted,
          created_at_iso: createdAtIso,
          order_time: createdAtIso,
          prep_minutes: 15,
          remaining_seconds: uiStatus === 'cooking' ? 600 : 0,
          status: uiStatus,
          order_status: o.orderStatus,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          is_paid: isPaid,
          total_amount: o.totalAmount,
          subtotal: o.subtotal,
          shipping_fee: o.shippingFee,
          discount_amount: o.discountAmount,
          must_collect_from_driver: isPaid ? 0 : Number(o.subtotal || o.totalAmount || 0),
          driver_collects_from_customer: isPaid ? 0 : Number(o.totalAmount || 0),
          note: o.note || '',
          driver,
          firego_delivery_id: o.firegoDeliveryId,
          firego_driver_id: o.firegoDriverId,
          driver_name: o.driverName,
          driver_phone: o.driverPhone,
          driver_plate: o.driverPlate,
          driver_vehicle: o.driverVehicle,
          is_dispatching: !!o.firegoDeliveryId && !o.firegoDriverId,
          items: (o.items || []).map((i) => ({
            id: i.id,
            menu_item_id: i.menuItemId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            note: i.note,
            toppings: [],
          })),
        };
      }),
    );
  }

  /**
   * Cập nhật trạng thái đơn hàng (Merchant hoặc Hệ thống)
   */
  async updateOrderStatus(
    orderId: number,
    newStatus: string,
    options?: { driverInfo?: any; note?: string; cancelReason?: string },
  ) {
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['items'] });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    let dbStatus = newStatus.toLowerCase().trim();
    if (dbStatus === 'new') dbStatus = 'pending';
    else if (dbStatus === 'cooking') dbStatus = 'preparing';

    const validStatuses = ['pending', 'preparing', 'shipping', 'completed', 'cancelled'];
    if (!validStatuses.includes(dbStatus)) {
      throw new BadRequestException(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    // ⭐ QUY TẮC 3: SAU KHI ĐÃ BÀN GIAO CHO SHIPPER (SHIPPING/DELIVERING), QUÁN KHÔNG ĐƯỢC PHÉP HỦY
    if (dbStatus === 'cancelled') {
      if (order.orderStatus === 'shipping') {
        throw new BadRequestException('Không thể hủy đơn hàng khi món ăn đã được bàn giao cho shipper đang đi giao');
      }
      if (order.orderStatus === 'completed') {
        throw new BadRequestException('Không thể hủy đơn hàng đã hoàn thành');
      }
    }

    // ⭐ QUY TẮC 1: QUÁN HỦY ĐƠN TRƯỚC KHI BÀN GIAO CHO SHIPPER
    // Nếu đơn đã gọi FireGo, gọi API FireGo để hủy toàn bộ delivery và giải phóng tài xế
    if (dbStatus === 'cancelled' && order.firegoDeliveryId) {
      try {
        const firegoUrl = this.getFiregoUrl();
        const secret = process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';
        this.logger.log(`[OrderService] 🛑 Order #${order.id} cancelled by store. Notifying FireGo delivery ${order.firegoDeliveryId} to cancel...`);
        await fetch(`${firegoUrl}/api/deliveries/external/${order.firegoDeliveryId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-FireGo-Secret': secret,
          },
          body: JSON.stringify({ reason: options?.cancelReason || 'Quán hủy đơn' }),
        });
      } catch (err: any) {
        this.logger.warn(`[OrderService] ⚠️ Failed to notify FireGo cancel: ${err.message}`);
      }
    }

    order.orderStatus = dbStatus;
    if (dbStatus === 'completed' && order.paymentMethod === 'cash') {
      order.paymentStatus = 'paid';
    }
    if (options?.note) {
      order.note = order.note ? `${order.note} | ${options.note}` : options.note;
    }
    if (options?.cancelReason) {
      order.note = order.note ? `${order.note} | Lý do hủy: ${options.cancelReason}` : `Lý do hủy: ${options.cancelReason}`;
    }

    await this.orderRepo.save(order);

    let uiStatus = 'new';
    if (dbStatus === 'preparing') uiStatus = 'cooking';
    else if (dbStatus === 'shipping') uiStatus = 'shipping';
    else if (dbStatus === 'completed') uiStatus = 'completed';
    else if (dbStatus === 'cancelled') uiStatus = 'cancelled';

    const updatePayload = {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: dbStatus,
      status: uiStatus,
      payment_status: order.paymentStatus,
      driver: options?.driverInfo || ((order.firegoDriverId || order.driverName) ? {
        id: order.firegoDriverId,
        name: order.driverName,
        phone: order.driverPhone,
        plate: order.driverPlate,
        vehicle: order.driverVehicle,
        avatar: order.driverAvatar,
        rating: order.driverRating ? Number(order.driverRating) : 4.9,
      } : null),
    };

    // Broadcast WebSocket event to tracking and merchant rooms
    this.orderGateway.emitOrderUpdate(order.id, updatePayload);

    // Gửi FCM Push Notification tới KHÁCH HÀNG (Người đặt món) theo trạng thái mới
    if (order.userId) {
      (async () => {
        try {
          let pushTitle = '';
          let pushBody = '';

          if (dbStatus === 'preparing') {
            pushTitle = `Quán đang làm món! #${order.orderCode}`;
            pushBody = 'Món ăn của bạn đang được quán chuẩn bị nóng hổi.';
          } else if (dbStatus === 'shipping') {
            const driverName = updatePayload.driver?.name || 'Shipper';
            pushTitle = `Đơn hàng #${order.orderCode} đang được giao!`;
            pushBody = `Tài xế ${driverName} đang trên đường mang món tới bạn. Vui lòng để ý điện thoại nhé!`;
          } else if (dbStatus === 'completed') {
            pushTitle = `Đơn hàng #${order.orderCode} giao thành công!`;
            pushBody = 'Chúc bạn có một bữa ăn thật ngon miệng! Cảm ơn bạn đã tin tưởng ToplistNA.';
          } else if (dbStatus === 'cancelled') {
            pushTitle = `Đơn hàng #${order.orderCode} đã bị hủy`;
            pushBody = options?.cancelReason ? `Lý do: ${options.cancelReason}` : 'Đơn hàng của bạn đã bị hủy.';
          }

          if (pushTitle) {
            await this.fcmService.sendToUser(
              order.userId,
              pushTitle,
              pushBody,
              {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
                order_status: dbStatus,
              },
              'default',
            );

            // Lưu thông báo vào CSDL cho khách hàng
            await this.notificationService.createNotification({
              userId: order.userId,
              title: pushTitle,
              message: pushBody,
              type: 'App\\Notifications\\OrderNotification',
              data: {
                type: 'order:status_update',
                order_id: order.id,
                order_code: order.orderCode,
                status: uiStatus,
                order_status: dbStatus,
              },
            });
          }
        } catch (pushErr: any) {
          this.logger.warn(`[OrderService] updateStatus push notification error: ${pushErr.message}`);
        }
      })();
    }

    return updatePayload;
  }

  /**
   * Khách hàng hủy đơn hàng (Chỉ cho phép khi quán chưa xác nhận / status pending)
   */
  async cancelOrderByCustomer(
    orderIdentifier: string | number,
    userId?: number,
    reason?: string,
  ) {
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

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    this.logger.log(`[OrderService] cancelOrderByCustomer: orderIdentifier=${orderIdentifier}, reqUserId=${userId}, orderId=${order.id}, orderCode=${order.orderCode}, currentStatus=${order.orderStatus}, orderUserId=${order.userId}`);

    // Kiểm tra quyền: nếu truyền userId thì phải trùng với order.userId
    if (userId && order.userId && Number(order.userId) !== Number(userId)) {
      this.logger.warn(`[OrderService] Unauthorized cancel: reqUserId=${userId} !== orderUserId=${order.userId}`);
      throw new BadRequestException('Bạn không có quyền hủy đơn hàng này');
    }

    // ⭐ QUY TẮC: Chỉ cho phép khách hủy khi quán CHƯA xác nhận (status là 'pending' hoặc 'new')
    const currentStatus = (order.orderStatus || '').toLowerCase().trim();
    if (currentStatus !== 'pending' && currentStatus !== 'new') {
      if (currentStatus === 'cancelled') {
        throw new BadRequestException('Đơn hàng này đã được hủy trước đó.');
      }
      if (currentStatus === 'preparing' || currentStatus === 'cooking') {
        throw new BadRequestException('Quán đã nhận đơn và đang chuẩn bị món ăn, không thể hủy đơn lúc này.');
      }
      if (currentStatus === 'shipping') {
        throw new BadRequestException('Đơn hàng đã bàn giao cho shipper và đang trên đường giao, không thể hủy.');
      }
      if (currentStatus === 'completed') {
        throw new BadRequestException('Đơn hàng đã hoàn thành, không thể hủy.');
      }
      throw new BadRequestException('Không thể hủy đơn hàng ở trạng thái hiện tại.');
    }

    // Nếu đơn đã dispatch sang FireGo, hủy cuốc delivery trên FireGo
    if (order.firegoDeliveryId) {
      try {
        const firegoUrl = this.getFiregoUrl();
        const secret = process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';
        this.logger.log(`[OrderService] 🛑 Order #${order.id} cancelled by customer. Notifying FireGo delivery ${order.firegoDeliveryId}...`);
        await fetch(`${firegoUrl}/api/deliveries/external/${order.firegoDeliveryId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-FireGo-Secret': secret,
          },
          body: JSON.stringify({ reason: reason || 'Khách hàng hủy đơn trước khi quán nhận' }),
        });
      } catch (err: any) {
        this.logger.warn(`[OrderService] ⚠️ Failed to notify FireGo cancel: ${err.message}`);
      }
    }

    order.orderStatus = 'cancelled';
    const cancelNote = reason || 'Khách hàng hủy đơn khi quán chưa xác nhận';
    order.note = order.note ? `${order.note} | Lý do hủy: ${cancelNote}` : `Lý do hủy: ${cancelNote}`;

    await this.orderRepo.save(order);

    const updatePayload = {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: 'cancelled',
      status: 'cancelled',
      payment_status: order.paymentStatus,
      cancel_reason: cancelNote,
    };

    // Broadcast WebSocket event tới tracking rooms và merchant
    this.orderGateway.emitOrderUpdate(order.id, updatePayload);

    // Gửi FCM Push Notification thông báo tới CHỦ QUÁN (Merchant)
    (async () => {
      try {
        const listing = await this.listingRepo.findOne({ where: { id: order.listingId } });
        if (listing?.ownerUserId) {
          const cancelMsg = `Khách hàng vừa hủy đơn #${order.orderCode} (${cancelNote}). Quán không cần chuẩn bị đơn này.`;
          await this.fcmService.sendToUser(
            listing.ownerUserId,
            `Khách hủy đơn #${order.orderCode}`,
            cancelMsg,
            {
              type: 'order:status_update',
              order_id: order.id,
              order_code: order.orderCode,
              status: 'cancelled',
              order_status: 'cancelled',
            },
            'default',
          );

          // Lưu thông báo vào CSDL cho chủ quán
          await this.notificationService.createNotification({
            userId: listing.ownerUserId,
            title: `Khách hủy đơn #${order.orderCode}`,
            message: cancelMsg,
            type: 'App\\Notifications\\OrderNotification',
            data: {
              type: 'order:status_update',
              order_id: order.id,
              order_code: order.orderCode,
              status: 'cancelled',
              order_status: 'cancelled',
            },
          });
        }
      } catch (fcmErr: any) {
        this.logger.warn(`[OrderService] Failed to push cancel notif to merchant: ${fcmErr.message}`);
      }
    })();

    return updatePayload;
  }

  /**
   * Lấy lịch sử tin nhắn của đơn hàng từ FireGo backend
   */
  async getOrderMessages(orderIdentifier: string | number): Promise<any[]> {
    const order = await this.orderRepo.findOne({
      where: [
        { id: isNaN(Number(orderIdentifier)) ? -1 : Number(orderIdentifier) },
        { orderCode: String(orderIdentifier) },
      ],
    });

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderIdentifier} không tồn tại`);
    }

    if (!order.firegoDeliveryId) {
      return [];
    }

    const firegoUrl = this.getFiregoUrl();
    const secret = process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';

    try {
      const res = await fetch(`${firegoUrl}/api/deliveries/external/${order.firegoDeliveryId}/messages`, {
        headers: {
          'X-FireGo-Secret': secret,
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        this.logger.warn(`[OrderService] ⚠️ FireGo get messages failed (${res.status})`);
        return [];
      }

      const body = await res.json();
      return body.data?.messages || [];
    } catch (err: any) {
      this.logger.warn(`[OrderService] ⚠️ Failed to fetch messages from FireGo: ${err.message}`);
      return [];
    }
  }

  /**
   * Khách hàng gửi tin nhắn cho tài xế giao món
   */
  async sendOrderMessage(
    orderIdentifier: string | number,
    text: string,
    clientMessageId?: string,
  ): Promise<any> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống');
    }

    const order = await this.orderRepo.findOne({
      where: [
        { id: isNaN(Number(orderIdentifier)) ? -1 : Number(orderIdentifier) },
        { orderCode: String(orderIdentifier) },
      ],
    });

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderIdentifier} không tồn tại`);
    }

    if (!order.firegoDeliveryId) {
      throw new BadRequestException('Đơn hàng chưa được điều phối tài xế FireGo, chưa thể chat');
    }

    if (order.orderStatus === 'cancelled') {
      throw new BadRequestException('Đơn hàng đã bị hủy, không thể gửi tin nhắn');
    }

    const firegoUrl = this.getFiregoUrl();
    const secret = process.env.FIREGO_INTERNAL_SECRET || 'firego_toplistna_secret_2026';

    try {
      const res = await fetch(`${firegoUrl}/api/deliveries/external/${order.firegoDeliveryId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FireGo-Secret': secret,
        },
        body: JSON.stringify({
          text: text.trim(),
          clientMessageId,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new BadRequestException(`Không thể gửi tin nhắn tới tài xế: ${errorText}`);
      }

      const body = await res.json();
      const messageData = body.data;

      // Phát realtime qua Socket.IO tới room của đơn hàng
      this.orderGateway.emitOrderMessage(order.id, messageData, order.orderCode);

      return messageData;
    } catch (err: any) {
      this.logger.error(`[OrderService] ❌ Failed to send message to FireGo: ${err.message}`);
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      throw new BadRequestException(`Không thể kết nối đến hệ thống tài xế: ${err.message}`);
    }
  }

  /**
   * Trích xuất hoặc tái tạo Financial Snapshot bất biến từ Order entity
   */
  generateFinancialSnapshotFromOrder(order: Order): FoodFinancialSnapshot {
    if (order.financialBreakdown) {
      try {
        const parsed = JSON.parse(order.financialBreakdown);
        if (parsed && parsed.version && parsed.commissionBase !== undefined && parsed.customerCashExpected !== undefined) {
          return parsed as FoodFinancialSnapshot;
        }
      } catch (_) {}
    }

    const isCod = !order.paymentMethod || order.paymentMethod === 'cash' || order.paymentMethod === 'cod';
    const originalSubtotal = Number(order.originalSubtotal || order.subtotal || 0);
    const storeDiscount = Number(order.storeSubsidy || 0);
    const platformDiscount = Number(order.platformSubsidy || 0);
    const shippingFee = Number(order.shippingFee || 0);
    const totalAmount = Number(order.totalAmount || 0);

    const commissionBase = Math.max(0, originalSubtotal - storeDiscount);
    const storeCommissionRate = 20;
    const storeCommissionAmount = Math.round((commissionBase * storeCommissionRate) / 100);
    const restaurantNetSettlement = commissionBase - storeCommissionAmount;

    const driverShareRate = 80;
    const driverShippingReward = Math.round(shippingFee * (driverShareRate / 100));
    const firegoPlatformFee = shippingFee - driverShippingReward;

    const customerCashExpected = isCod ? totalAmount : 0;
    const restaurantPickupAmount = 0;

    return {
      version: '1.0',
      orderCode: order.orderCode,
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
      serviceFee: Math.max(0, totalAmount - (originalSubtotal - storeDiscount - platformDiscount) - shippingFee),
      shipping: {
        customerShippingFee: shippingFee,
        driverShareRate,
        driverShareVersion: order.pricingVersion || 'legacy',
        driverShippingReward,
        firegoPlatformFee,
      },
      commissionBase,
      storeCommissionRate,
      storeCommissionAmount,
      restaurantNetSettlement,
      customerCashExpected,
      restaurantPickupAmount,
      driverShippingReward,
      totalCustomerPayable: totalAmount,
      createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
    };
  }
}



import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { Voucher } from '../../entities/voucher.entity';

@Injectable()
export class VoucherService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  /**
   * Lấy danh sách mã giảm giá áp dụng cho khách hàng tại quán (bao gồm mã của quán + mã toàn sàn)
   */
  async getStoreVouchers(storeId: number, includePlatform = true) {
    const numStoreId = Number(storeId);
    const now = new Date();

    if (includePlatform) {
      return await this.voucherRepo.find({
        where: [
          { listingId: numStoreId, status: 'active', expiresAt: MoreThan(now) },
          { listingId: IsNull(), status: 'active', expiresAt: MoreThan(now) },
        ],
        order: { discountValue: 'DESC', createdAt: 'DESC' },
      });
    }

    return await this.voucherRepo.find({
      where: { listingId: numStoreId, status: 'active', expiresAt: MoreThan(now) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lấy tất cả mã do chính quán tạo để đối tác quản lý (kể cả inactive)
   */
  async getMerchantStoreVouchers(storeId: number) {
    const numStoreId = Number(storeId);
    return await this.voucherRepo.find({
      where: { listingId: numStoreId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lấy tất cả mã giảm giá toàn sàn đang hoạt động
   */
  async getActivePlatformVouchers() {
    const now = new Date();
    return await this.voucherRepo.find({
      where: { listingId: IsNull(), status: 'active', expiresAt: MoreThan(now) },
      order: { discountValue: 'DESC' },
    });
  }

  /**
   * Quán tạo mã giảm giá mới (chỉ áp dụng cho quán này)
   */
  async createStoreVoucher(
    storeId: number,
    data: {
      code: string;
      discount_type: 'percentage' | 'fixed';
      discount_value: number;
      min_order_value?: number;
      max_discount?: number;
      usage_limit?: number;
      description?: string;
      expires_at: string;
      applicable_type?: 'all' | 'specific_dishes';
      applicable_dish_ids?: string;
      applicable_dish_names?: string;
    },
  ) {
    const numStoreId = Number(storeId);
    const cleanCode = data.code.trim().toUpperCase();

    // Check duplicate
    const existing = await this.voucherRepo.findOne({
      where: { code: cleanCode },
    });
    if (existing) {
      throw new BadRequestException(`Mã giảm giá "${cleanCode}" đã tồn tại trên hệ thống. Vui lòng chọn mã khác.`);
    }

    const voucher = this.voucherRepo.create({
      code: cleanCode,
      listingId: numStoreId,
      discountType: data.discount_type || 'fixed',
      discountValue: Number(data.discount_value || 0),
      minOrderValue: Number(data.min_order_value || 0),
      maxDiscount: data.max_discount ? Number(data.max_discount) : undefined,
      usageLimit: data.usage_limit ? Number(data.usage_limit) : undefined,
      description: data.description || '',
      expiresAt: new Date(data.expires_at || Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
      applicableType: data.applicable_type || 'all',
      applicableDishIds: data.applicable_dish_ids || undefined,
      applicableDishNames: data.applicable_dish_names || undefined,
      usedCount: 0,
    });

    return await this.voucherRepo.save(voucher);
  }

  /**
   * Bật / Tắt trạng thái mã giảm giá của quán
   */
  async toggleVoucherStatus(voucherId: number, status?: string) {
    const voucher = await this.voucherRepo.findOne({ where: { id: voucherId } });
    if (!voucher) throw new NotFoundException('Không tìm thấy mã giảm giá');

    if (status) {
      voucher.status = status;
    } else {
      voucher.status = voucher.status === 'active' ? 'inactive' : 'active';
    }

    return await this.voucherRepo.save(voucher);
  }

  /**
   * Xóa mã giảm giá của quán
   */
  async deleteVoucher(voucherId: number) {
    const voucher = await this.voucherRepo.findOne({ where: { id: voucherId } });
    if (!voucher) throw new NotFoundException('Không tìm thấy mã giảm giá');
    await this.voucherRepo.remove(voucher);
    return { success: true, message: 'Đã xóa mã giảm giá thành công' };
  }

  /**
   * Khách hàng áp dụng mã giảm giá
   */
  async apply(code: string, orderValue: number, storeId?: number, dishIds?: number[]) {
    const voucher = await this.voucherRepo.findOne({
      where: { code: code.toUpperCase(), status: 'active' },
    });

    if (!voucher) throw new NotFoundException('Mã giảm giá không tồn tại hoặc đã hết hiệu lực');

    if (new Date() > new Date(voucher.expiresAt)) {
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    }

    // Kiểm tra quán độc quyền: Nếu voucher thuộc quán cụ thể, bắt buộc phải đúng quán đó
    if (voucher.listingId) {
      if (!storeId || Number(voucher.listingId) !== Number(storeId)) {
        throw new BadRequestException('Mã giảm giá này chỉ áp dụng cho riêng quán đã phát hành, không thể dùng cho quán khác!');
      }
    }

    // Kiểm tra món ăn áp dụng nếu voucher chỉ dành cho món cụ thể
    if (voucher.applicableType === 'specific_dishes' && voucher.applicableDishIds) {
      const allowedIds = voucher.applicableDishIds.split(',').map((id) => Number(id.trim())).filter(Boolean);
      if (dishIds && dishIds.length > 0) {
        const hasApplicableDish = dishIds.some((dId) => allowedIds.includes(Number(dId)));
        if (!hasApplicableDish) {
          throw new BadRequestException(
            `Mã giảm giá chỉ áp dụng cho các món: ${voucher.applicableDishNames || 'món được chỉ định'}`,
          );
        }
      }
    }

    if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    if (orderValue < voucher.minOrderValue) {
      throw new BadRequestException(
        `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
      );
    }

    let discountAmount = 0;
    if (voucher.discountType === 'percentage') {
      discountAmount = Math.round((orderValue * voucher.discountValue) / 100);
      if (voucher.maxDiscount) {
        discountAmount = Math.min(discountAmount, voucher.maxDiscount);
      }
    } else {
      discountAmount = voucher.discountValue;
    }

    discountAmount = Math.min(discountAmount, orderValue); // Không giảm quá tổng đơn

    const fundedBy = (voucher.fundedBy || (voucher.listingId ? 'STORE' : 'PLATFORM')).toUpperCase();
    const storeSharePct = voucher.storeSharePct !== undefined ? voucher.storeSharePct : (voucher.listingId ? 100 : 0);
    const platformSharePct = voucher.platformSharePct !== undefined ? voucher.platformSharePct : (voucher.listingId ? 0 : 100);

    let storeDiscount = 0;
    if (fundedBy === 'STORE') {
      storeDiscount = discountAmount;
    } else if (fundedBy === 'PLATFORM') {
      storeDiscount = 0;
    } else if (fundedBy === 'SPLIT') {
      storeDiscount = Math.round((discountAmount * storeSharePct) / 100);
    }
    const platformDiscount = Math.max(0, discountAmount - storeDiscount);

    return {
      voucher_id: voucher.id,
      code: voucher.code,
      discount_type: voucher.discountType,
      discount_value: voucher.discountValue,
      discount_amount: discountAmount,
      store_discount: storeDiscount,
      platform_discount: platformDiscount,
      platform_subsidy: platformDiscount,
      funded_by: fundedBy,
      store_share_pct: storeSharePct,
      platform_share_pct: platformSharePct,
      final_amount: orderValue - discountAmount,
      description: voucher.description,
      applicable_type: voucher.applicableType,
      applicable_dish_names: voucher.applicableDishNames,
    };
  }
}

import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { VoucherService } from './voucher.service';

class ApplyVoucherDto {
  @IsNotEmpty() @IsString() code: string;
  @IsInt() @Min(1) order_value: number;
  @IsOptional() store_id?: number;
  @IsOptional() dish_ids?: number[];
}

class CreateStoreVoucherDto {
  @IsNotEmpty() @IsString() code: string;
  @IsNotEmpty() @IsString() discount_type: 'percentage' | 'fixed';
  @IsNotEmpty() @IsInt() @Min(1) discount_value: number;
  @IsOptional() min_order_value?: number;
  @IsOptional() max_discount?: number;
  @IsOptional() usage_limit?: number;
  @IsOptional() description?: string;
  @IsNotEmpty() @IsString() expires_at: string;
  @IsOptional() @IsString() applicable_type?: 'all' | 'specific_dishes';
  @IsOptional() @IsString() applicable_dish_ids?: string;
  @IsOptional() @IsString() applicable_dish_names?: string;
}

@ApiTags('Voucher')
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  /** POST /api/v1/vouchers/apply */
  @Post('apply')
  @ApiOperation({ summary: 'Khách áp dụng mã giảm giá' })
  async apply(@Body() dto: ApplyVoucherDto) {
    const data = await this.voucherService.apply(dto.code, dto.order_value, dto.store_id, dto.dish_ids);
    return { success: true, data };
  }

  /** GET /api/v1/vouchers/store/:storeId */
  @Get('store/:storeId')
  @ApiOperation({ summary: 'Lấy danh sách mã giảm giá áp dụng cho quán' })
  async getStoreVouchers(
    @Param('storeId') storeId: string,
    @Query('include_platform') includePlatform?: string,
  ) {
    const shouldInclude = includePlatform !== 'false';
    const data = await this.voucherService.getStoreVouchers(parseInt(storeId, 10), shouldInclude);
    return { success: true, data };
  }

  /** GET /api/v1/vouchers/merchant/:storeId */
  @Get('merchant/:storeId')
  @ApiOperation({ summary: 'Lấy danh sách mã giảm giá do chính quán quản lý' })
  async getMerchantVouchers(@Param('storeId') storeId: string) {
    const data = await this.voucherService.getMerchantStoreVouchers(parseInt(storeId, 10));
    return { success: true, data };
  }

  /** GET /api/v1/vouchers/active */
  @Get('active')
  @ApiOperation({ summary: 'Lấy danh sách mã giảm giá toàn sàn đang hoạt động' })
  async getActivePlatformVouchers() {
    const data = await this.voucherService.getActivePlatformVouchers();
    return { success: true, data };
  }

  /** POST /api/v1/vouchers/store/:storeId */
  @Post('store/:storeId')
  @ApiOperation({ summary: 'Quán tạo mã giảm giá mới' })
  async createStoreVoucher(
    @Param('storeId') storeId: string,
    @Body() dto: CreateStoreVoucherDto,
  ) {
    const data = await this.voucherService.createStoreVoucher(parseInt(storeId, 10), dto);
    return { success: true, data, message: 'Tạo mã giảm giá thành công!' };
  }

  /** PATCH /api/v1/vouchers/:id/toggle */
  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Bật/tắt trạng thái mã giảm giá' })
  async toggleStatus(
    @Param('id') id: string,
    @Body('status') status?: string,
  ) {
    const data = await this.voucherService.toggleVoucherStatus(parseInt(id, 10), status);
    return { success: true, data, message: 'Cập nhật trạng thái thành công!' };
  }

  /** DELETE /api/v1/vouchers/:id */
  @Delete(':id')
  @ApiOperation({ summary: 'Xóa mã giảm giá' })
  async deleteVoucher(@Param('id') id: string) {
    const data = await this.voucherService.deleteVoucher(parseInt(id, 10));
    return data;
  }
}

import { Controller, Post, Get, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderService } from './order.service';

export class OrderItemDto {
  @IsOptional() menu_item_id?: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() @Min(1) quantity?: number;
  @IsOptional() @IsString() note?: string;
}

function extractUserIdFromRequest(req: any): number | null {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      const id = payload.sub ?? payload.id ?? payload.userId;
      if (id && !isNaN(Number(id))) return Number(id);
    }
  } catch (_) {}
  return null;
}

export class CheckoutDto {
  @IsOptional() listing_id?: number;
  @IsOptional() @IsString() delivery_address?: string;
  @IsOptional() @IsString() recipient_name?: string;
  @IsOptional() @IsString() recipient_phone?: string;
  @IsOptional() @IsNumber() delivery_latitude?: number;
  @IsOptional() @IsNumber() delivery_longitude?: number;
  @IsOptional() @IsNumber() distance_km?: number;
  @IsOptional() @IsString() payment_method?: string;
  @IsOptional() @IsString() voucher_code?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() service_fee?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
@ApiTags('Order')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /** POST /api/v1/orders/checkout */
  @Post('checkout')
  @ApiOperation({ summary: 'Tạo đơn hàng đồ ăn và lưu vào CSDL' })
  async checkout(@Request() req, @Body() dto: CheckoutDto) {
    const userId = req.user?.id ?? extractUserIdFromRequest(req) ?? null;
    const data = await this.orderService.checkout(
      userId,
      dto.delivery_address || 'TP Vinh, Nghệ An',
      dto.payment_method || 'cash',
      dto.listing_id,
      dto.delivery_latitude,
      dto.delivery_longitude,
      dto.distance_km,
      dto.voucher_code,
      dto.note,
      dto.items?.map(i => ({ ...i, quantity: i.quantity ?? 1 })),
      dto.recipient_name,
      dto.recipient_phone,
      dto.service_fee,
    );
    return { success: true, data, message: 'Đặt đơn hàng thành công' };
  }

  /** GET /api/v1/orders/my-orders */
  @Get('my-orders')
  @ApiOperation({ summary: 'Danh sách đơn hàng của người dùng' })
  async getMyOrders(@Request() req) {
    const userId = req.user?.id ?? extractUserIdFromRequest(req) ?? null;
    const data = await this.orderService.getUserOrders(userId);
    return { success: true, data };
  }

  /** GET /api/v1/orders/:id/tracking */
  @Get(':id/tracking')
  @ApiOperation({ summary: 'Theo dõi trạng thái đơn hàng' })
  @ApiParam({ name: 'id', type: String })
  async tracking(@Request() req, @Param('id') id: string) {
    const userId = req.user?.id ?? extractUserIdFromRequest(req) ?? undefined;
    const data = await this.orderService.getTracking(id, userId);
    return { success: true, data };
  }

  /** GET /api/v1/orders/:id/messages */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn của đơn hàng' })
  @ApiParam({ name: 'id', type: String })
  async getMessages(@Param('id') id: string) {
    const data = await this.orderService.getOrderMessages(id);
    return { success: true, data };
  }

  /** POST /api/v1/orders/:id/messages */
  @Post(':id/messages')
  @ApiOperation({ summary: 'Khách hàng gửi tin nhắn cho tài xế giao món' })
  @ApiParam({ name: 'id', type: String })
  async sendMessage(
    @Param('id') id: string,
    @Body() body: { text: string; clientMessageId?: string },
  ) {
    const data = await this.orderService.sendOrderMessage(id, body.text, body.clientMessageId);
    return { success: true, data };
  }

  /** GET /api/v1/orders/store/:storeId */
  @Get('store/:storeId')
  @ApiOperation({ summary: 'Lấy danh sách đơn hàng thực tế của quán (Merchant)' })
  @ApiParam({ name: 'storeId', type: Number })
  async getStoreOrders(@Param('storeId') storeId: string, @Query('status') status?: string) {
    const data = await this.orderService.getStoreOrders(parseInt(storeId), status);
    return { success: true, data };
  }

  /** PUT /api/v1/orders/:id/status */
  @Put(':id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn hàng (Merchant)' })
  @ApiParam({ name: 'id', type: Number })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: string; driver?: any; note?: string; cancel_reason?: string },
  ) {
    const data = await this.orderService.updateOrderStatus(parseInt(id), body.status, {
      driverInfo: body.driver,
      note: body.note,
      cancelReason: body.cancel_reason,
    });
    return { success: true, data, message: 'Đã cập nhật trạng thái đơn hàng' };
  }

  /** POST /api/v1/orders/:id/cancel */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Khách hàng hủy đơn hàng (chỉ khi quán chưa xác nhận)' })
  @ApiParam({ name: 'id', type: String })
  async cancelOrder(
    @Request() req,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    const userId = req.user?.id ?? extractUserIdFromRequest(req) ?? undefined;
    const data = await this.orderService.cancelOrderByCustomer(id, userId, body?.reason);
    return { success: true, data, message: 'Đã hủy đơn hàng thành công' };
  }
}


import { Controller, Post, Param, Body, Headers, Get, UseGuards, Request } from '@nestjs/common';
import { FireGoService } from './firego.service';

@Controller('firego')
export class FireGoController {
  constructor(private readonly fireGoService: FireGoService) {}

  /**
   * Quán ăn hoặc Hệ thống bấm yêu cầu điều phối tài xế xe máy FireGo
   * POST /api/firego/dispatch/:orderId
   */
  @Post('dispatch/:orderId')
  async dispatchDriver(@Param('orderId') orderId: string) {
    return this.fireGoService.dispatchToFireGo(Number(orderId));
  }

  /**
   * Webhook nhận thông báo cập nhật tài xế & trạng thái từ FireGo
   * POST /api/firego/webhook/delivery-update
   */
  @Post('webhook/delivery-update')
  async handleDeliveryUpdate(
    @Headers('x-firego-secret') secretHeader: string,
    @Body() payload: any,
  ) {
    return this.fireGoService.handleDeliveryUpdate(secretHeader, payload);
  }

  /**
   * Webhook nhận stream toạ độ GPS thời gian thực của tài xế FireGo
   * POST /api/firego/webhook/driver-location
   */
  @Post('webhook/driver-location')
  async handleDriverLocation(
    @Headers('x-firego-secret') secretHeader: string,
    @Body() payload: any,
  ) {
    return this.fireGoService.handleDriverLocation(secretHeader, payload);
  }

  /**
   * Webhook nhận tin nhắn từ tài xế FireGo gửi về cho khách hàng ToplistNA
   * POST /api/v1/firego/delivery-message
   */
  @Post('delivery-message')
  async handleDeliveryMessage(
    @Headers('x-firego-secret') secretHeader: string,
    @Body() payload: { deliveryId: string; externalOrderId: string; message: any },
  ) {
    return this.fireGoService.handleDriverChatMessage(secretHeader, payload);
  }

  /**
   * API truy vấn trạng thái điều phối tài xế FireGo theo mã đơn hàng
   * GET /api/firego/status/:orderId
   */
  @Get('status/:orderId')
  async getStatus(@Param('orderId') orderId: string) {
    return this.fireGoService.getFireGoDeliveryStatus(orderId);
  }
}

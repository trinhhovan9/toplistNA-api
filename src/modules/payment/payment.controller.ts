import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Req,
  Res,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * 1. KHỞI TẠO THANH TOÁN (Khách KHÔNG gửi amount - Lấy từ DB)
   */
  @Post('create')
  @ApiOperation({ summary: 'Khởi tạo phiên thanh toán mới (VNPAY / MoMo / ZaloPay / VietQR)' })
  async createPayment(
    @Body() body: { orderCode: string; paymentMethod: string; returnUrl?: string },
    @Req() req: Request,
  ) {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    return this.paymentService.createPayment(body, clientIp);
  }

  /**
   * 2. TRA CỨU TRẠNG THÁI THANH TOÁN (Polling từ App)
   */
  @Get('status/:transactionId')
  @ApiOperation({ summary: 'Tra cứu trạng thái thanh toán theo transactionId' })
  async getPaymentStatus(@Param('transactionId') transactionId: string) {
    return this.paymentService.getPaymentStatus(transactionId);
  }

  /**
   * 3. VNPAY IPN WEBHOOK (Server-to-Server)
   */
  @Get('vnpay/ipn')
  @ApiOperation({ summary: 'VNPAY IPN Webhook xác nhận thanh toán' })
  async vnpayIpn(@Query() query: Record<string, any>, @Res() res: Response) {
    try {
      this.logger.log(`📥 [VNPAY IPN] Nhận callback: ${JSON.stringify(query)}`);

      const secureHash = query['vnp_SecureHash'];
      const isValidSignature = this.paymentService.verifyVnpaySignature(query, secureHash);

      if (!isValidSignature) {
        this.logger.warn('❌ [VNPAY IPN] Chữ ký không hợp lệ (Invalid Signature)');
        return res.status(HttpStatus.OK).json({ RspCode: '97', Message: 'Invalid Checksum' });
      }

      const transactionId = query['vnp_TxnRef'];
      const vnpAmount = Number(query['vnp_Amount']) / 100;
      const vnpResponseCode = query['vnp_ResponseCode'];
      const providerTxnId = String(query['vnp_TransactionNo'] || query['vnp_TxnRef']);

      if (vnpResponseCode === '00') {
        const result = await this.paymentService.processPaymentSuccess(
          transactionId,
          providerTxnId,
          vnpAmount,
          query,
        );

        if (result.success) {
          return res.status(HttpStatus.OK).json({ RspCode: '00', Message: 'Confirm Success' });
        } else if (result.message === 'Amount mismatch') {
          return res.status(HttpStatus.OK).json({ RspCode: '04', Message: 'Amount Mismatch' });
        } else {
          return res.status(HttpStatus.OK).json({ RspCode: '01', Message: 'Order Not Found' });
        }
      } else {
        this.logger.warn(`⚠️ [VNPAY IPN] Giao dịch không thành công. ResponseCode: ${vnpResponseCode}`);
        return res.status(HttpStatus.OK).json({ RspCode: '00', Message: 'Confirm Received' });
      }
    } catch (err: any) {
      this.logger.error(`Error in VNPAY IPN: ${err.message}`);
      return res.status(HttpStatus.OK).json({ RspCode: '99', Message: 'Unknown Error' });
    }
  }

  /**
   * 4. VNPAY RETURN URL (Redirect khi khách thanh toán xong)
   */
  @Get('vnpay/return')
  @ApiOperation({ summary: 'VNPAY Return URL chuyển hướng người dùng về App' })
  async vnpayReturn(@Query() query: Record<string, any>, @Res() res: Response) {
    const isSuccess = query['vnp_ResponseCode'] === '00';
    const txnRef = query['vnp_TxnRef'];

    const redirectHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Kết quả thanh toán ToplistNA</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px 20px; background: #f8fafc; }
            .card { max-width: 400px; margin: 0 auto; background: white; border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            .icon { font-size: 54px; margin-bottom: 16px; }
            h2 { margin: 0 0 8px; color: ${isSuccess ? '#16a34a' : '#dc2626'}; }
            p { color: #64748b; font-size: 14px; }
            .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #EE4D2D; color: white; border-radius: 10px; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">${isSuccess ? '✅' : '❌'}</div>
            <h2>${isSuccess ? 'Thanh Toán Thành Công!' : 'Thanh Toán Thất Bại'}</h2>
            <p>${isSuccess ? 'Đơn hàng của bạn đã được xác nhận và chuyển tới nhà hàng.' : 'Giao dịch chưa hoàn tất hoặc đã bị hủy.'}</p>
            <p>Mã giao dịch: <strong>${txnRef || ''}</strong></p>
            <a href="toplistna://payment/result?success=${isSuccess}&txn=${txnRef}" class="btn">Quay lại ứng dụng</a>
          </div>
        </body>
      </html>
    `;

    return res.type('html').send(redirectHtml);
  }

  /**
   * 5. MOMO IPN WEBHOOK
   */
  @Post('momo/ipn')
  @ApiOperation({ summary: 'MoMo IPN Webhook xác nhận thanh toán' })
  async momoIpn(@Body() body: Record<string, any>) {
    this.logger.log(`📥 [MoMo IPN] Nhận webhook: ${JSON.stringify(body)}`);

    const isValid = this.paymentService.verifyMomoSignature(body);
    if (!isValid) {
      this.logger.warn('❌ [MoMo IPN] Chữ ký không hợp lệ');
      return { message: 'Invalid signature', resultCode: 97 };
    }

    if (body.resultCode === 0) {
      const transactionId = body.orderId;
      const amount = Number(body.amount);
      const providerTxnId = String(body.transId || body.orderId);

      await this.paymentService.processPaymentSuccess(transactionId, providerTxnId, amount, body);
    }

    return { message: 'Success', resultCode: 0 };
  }

  /**
   * 6. ZALOPAY CALLBACK WEBHOOK
   */
  @Post('zalopay/callback')
  @ApiOperation({ summary: 'ZaloPay Callback Webhook xác nhận thanh toán' })
  async zalopayCallback(@Body() body: Record<string, any>) {
    this.logger.log(`📥 [ZaloPay Callback] Nhận callback: ${JSON.stringify(body)}`);

    const dataStr = body.data || '';
    const reqMac = body.mac || '';

    const isValid = this.paymentService.verifyZaloPayCallback(dataStr, reqMac);
    if (!isValid) {
      this.logger.warn('❌ [ZaloPay Callback] Chữ ký MAC không hợp lệ');
      return { return_code: -1, return_message: 'mac not equal' };
    }

    try {
      const dataJson = JSON.parse(dataStr);
      const appTransId = dataJson.app_trans_id; // YYMMDD_TLNA8F92K
      const parts = appTransId.split('_');
      let transactionId = parts[1] || '';
      if (!transactionId.includes('-') && transactionId.startsWith('TLN')) {
        transactionId = `TLN-${transactionId.substring(3)}`;
      }

      const amount = Number(dataJson.amount);
      const providerTxnId = String(dataJson.zp_trans_id || appTransId);

      await this.paymentService.processPaymentSuccess(transactionId, providerTxnId, amount, dataJson);
      return { return_code: 1, return_message: 'success' };
    } catch (err: any) {
      this.logger.error(`Error parsing ZaloPay data: ${err.message}`);
      return { return_code: 0, return_message: 'exception' };
    }
  }

  /**
   * 7. SEPAY (VIETQR) WEBHOOK
   * Đồng bộ với tài khoản Sepay của hệ thống
   */
  @Post('sepay/webhook')
  @ApiOperation({ summary: 'Sepay VietQR Webhook thông báo biến động số dư ngân hàng' })
  async sepayWebhook(@Body() payload: Record<string, any>) {
    this.logger.log(`📥 [Sepay Webhook] Nhận biến động số dư: ${JSON.stringify(payload)}`);
    return this.paymentService.handleSepayWebhook(payload);
  }
}

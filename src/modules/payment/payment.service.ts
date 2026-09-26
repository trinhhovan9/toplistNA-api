import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { Listing } from '../../entities/listing.entity';
import { OrderGateway } from '../order/order.gateway';
import { FcmService } from '../notification/fcm.service';

interface CreatePaymentDto {
  orderCode: string;
  paymentMethod: string; // 'vnpay' | 'momo' | 'zalopay' | 'vietqr' | 'sepay_vietqr'
  returnUrl?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  // VNPay Config
  private readonly vnpayConfig = {
    tmnCode: process.env.VNPAY_TMN_CODE || '2QNVQ7K1',
    hashSecret: process.env.VNPAY_HASH_SECRET || 'SCPUASVNZJUUKSMHZ4LQTEKBXAOTAZC',
    apiUrl: process.env.VNPAY_API_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3001/api/v1/payment/vnpay/return',
  };

  // MoMo Config
  private readonly momoConfig = {
    partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMO',
    accessKey: process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85',
    secretKey: process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX0huIC1phA30e5',
    endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create',
    returnUrl: process.env.MOMO_RETURN_URL || 'http://localhost:3001/api/v1/payment/momo/return',
    notifyUrl: process.env.MOMO_NOTIFY_URL || 'http://localhost:3001/api/v1/payment/momo/ipn',
  };

  // ZaloPay Config
  private readonly zalopayConfig = {
    appId: process.env.ZALOPAY_APP_ID || '2554',
    key1: process.env.ZALOPAY_KEY1 || 'sdngKKJmqEMzvh5QQwuqugDyTgRiNu27',
    key2: process.env.ZALOPAY_KEY2 || 'trMrHtvjo6myautxDUiAcYsVtaeQ8nhf',
    endpoint: process.env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create',
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL || 'http://localhost:3001/api/v1/payment/zalopay/callback',
  };

  // Sepay (VietQR) Config (Synchronized with FireGo Sepay bank account)
  private readonly sepayConfig = {
    accountNo: process.env.SEPAY_ACCOUNT_NO || 'VQRQAHGIQ8468',
    accountName: process.env.SEPAY_ACCOUNT_NAME || 'HO VAN TRINH',
    bankName: process.env.SEPAY_BANK_NAME || 'MB',
    bankId: process.env.SEPAY_BANK_ID || '970422',
    apiKey: process.env.SEPAY_API_KEY || '',
  };

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    private readonly orderGateway: OrderGateway,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Sinh mã thanh toán ngẫu nhiên duy nhất cho mỗi lượt thử: TLN-XXXXXX (6 ký tự chữ hoa/số)
   */
  private generateTransactionId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bỏ các ký tự dễ nhầm lẫn như 0, O, 1, I
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TLN-${suffix}`;
  }

  /**
   * Tạo phiên thanh toán mới cho đơn hàng (Khách KHÔNG gửi số tiền - Lấy từ DB)
   */
  async createPayment(dto: CreatePaymentDto, clientIp = '127.0.0.1') {
    const cleanCode = (dto.orderCode || '').trim();
    if (!cleanCode) {
      throw new BadRequestException('Mã đơn hàng không hợp lệ');
    }

    // 1. Tìm đơn hàng trong DB
    const order = await this.orderRepo.findOne({
      where: [{ orderCode: cleanCode }],
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng "${cleanCode}"`);
    }

    // 2. Kiểm tra nếu đơn đã thanh toán trước đó
    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('Đơn hàng này đã được thanh toán thành công rồi!');
    }

    const lockedAmount = order.totalAmount;
    if (lockedAmount <= 0) {
      throw new BadRequestException('Số tiền thanh toán đơn hàng không hợp lệ (<= 0đ)');
    }

    // 3. Chuẩn hóa provider
    let provider = (dto.paymentMethod || 'vietqr').toLowerCase();
    if (provider === 'cash') {
      throw new BadRequestException('Phương thức tiền mặt không cần tạo cổng thanh toán');
    }
    if (provider === 'vietqr') provider = 'sepay_vietqr';

    // 4. Sinh mã tham chiếu thanh toán duy nhất cho lần thử này
    let transactionId = this.generateTransactionId();
    // Đảm bảo không trùng lặp
    let exists = await this.paymentRepo.findOne({ where: { transactionId } });
    while (exists) {
      transactionId = this.generateTransactionId();
      exists = await this.paymentRepo.findOne({ where: { transactionId } });
    }

    let paymentUrl: string | null = null;
    let qrCodeUrl: string | null = null;
    let extraBankInfo: Record<string, any> | null = null;

    // 5. Khởi tạo theo từng cổng
    switch (provider) {
      case 'vnpay': {
        paymentUrl = this.buildVnpayUrl(order, transactionId, lockedAmount, clientIp, dto.returnUrl);
        break;
      }
      case 'momo': {
        const momoRes = await this.buildMomoPayment(order, transactionId, lockedAmount);
        paymentUrl = momoRes.payUrl;
        qrCodeUrl = momoRes.qrCodeUrl;
        break;
      }
      case 'zalopay': {
        const zaloRes = await this.buildZaloPayPayment(order, transactionId, lockedAmount);
        paymentUrl = zaloRes.orderUrl;
        qrCodeUrl = zaloRes.qrCodeUrl;
        break;
      }
      case 'sepay_vietqr':
      default: {
        provider = 'sepay_vietqr';
        const sepRes = this.buildSepayVietQr(lockedAmount, transactionId);
        qrCodeUrl = sepRes.qrCodeUrl;
        extraBankInfo = {
          bankName: sepRes.bankName,
          accountNo: sepRes.accountNo,
          accountName: sepRes.accountName,
          amount: lockedAmount,
          transferContent: transactionId,
        };
        break;
      }
    }

    // 6. Lưu bản ghi Payment mới với trạng thái pending
    const payment = this.paymentRepo.create({
      orderId: order.id,
      orderCode: order.orderCode,
      transactionId,
      provider,
      amount: lockedAmount,
      status: 'pending',
      paymentUrl: paymentUrl || undefined,
      qrCodeUrl: qrCodeUrl || undefined,
      metadata: JSON.stringify({
        clientIp,
        createdVia: 'PaymentService.createPayment',
        orderListingId: order.listingId,
      }),
    });

    await this.paymentRepo.save(payment);

    this.logger.log(
      `💳 [Payment Created] Đơn #${order.orderCode} | TxnId: ${transactionId} | Cổng: ${provider} | Số tiền: ${lockedAmount}đ`,
    );

    return {
      success: true,
      transactionId,
      orderCode: order.orderCode,
      amount: lockedAmount,
      provider,
      paymentUrl,
      qrCodeUrl,
      bankInfo: extraBankInfo,
      expiresInSeconds: 900, // 15 phút
    };
  }

  /**
   * HÀM IDEMPOTENT CỐT LÕI: Xác nhận thanh toán thành công
   * Tuyệt đối không xử lý 2 lần khi webhook gửi lại.
   */
  async processPaymentSuccess(
    transactionId: string,
    providerTxnId: string,
    receivedAmount: number,
    rawMetadata: any,
  ) {
    this.logger.log(`📥 [Idempotent Process] Bắt đầu xác nhận thanh toán TxnId: ${transactionId}`);

    const payment = await this.paymentRepo.findOne({
      where: { transactionId },
    });

    if (!payment) {
      this.logger.error(`❌ [Payment NotFound] Không tìm thấy Payment với TxnId: ${transactionId}`);
      return { success: false, message: 'Payment transaction not found' };
    }

    // 1. KIỂM TRA IDEMPOTENT: Nếu đã PAID rồi thì trả về thành công ngay, không làm gì thêm
    if (payment.status === 'paid') {
      this.logger.log(`⚠️ [Payment Idempotent] TxnId ${transactionId} đã PAID trước đó. Trả success không xử lý lại.`);
      return { success: true, message: 'Already processed (idempotent)' };
    }

    // 2. Tìm đơn hàng
    const order = await this.orderRepo.findOne({
      where: { orderCode: payment.orderCode },
    });

    if (!order) {
      this.logger.error(`❌ [Order NotFound] Không tìm thấy Order #${payment.orderCode}`);
      return { success: false, message: 'Order not found' };
    }

    // 3. VERIFY SỐ TIỀN 3 BÊN: receivedAmount == payment.amount == order.totalAmount
    if (receivedAmount < payment.amount || payment.amount !== order.totalAmount) {
      this.logger.error(
        `❌ [Amount Mismatch] Số tiền không khớp! Nhận: ${receivedAmount}, Cần: ${payment.amount}, Đơn: ${order.totalAmount}`,
      );
      payment.metadata = JSON.stringify({
        ...JSON.parse(payment.metadata || '{}'),
        amountMismatchError: { receivedAmount, requiredAmount: payment.amount },
        rawMetadata,
      });
      await this.paymentRepo.save(payment);
      return { success: false, message: 'Amount mismatch' };
    }

    // 4. CẬP NHẬT TRẠNG THÁI NGUYÊN TỬ
    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.providerTransactionId = providerTxnId;
    payment.metadata = JSON.stringify({
      ...JSON.parse(payment.metadata || '{}'),
      webhookSuccess: true,
      rawMetadata,
    });
    await this.paymentRepo.save(payment);

    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed'; // Đơn chuyển sang confirmed sẵn sàng cho quán nấu
    order.paymentMethod = payment.provider;
    await this.orderRepo.save(order);

    this.logger.log(`✅ [Payment PAID] Đơn #${order.orderCode} đã thanh toán thành công ${order.totalAmount}đ!`);

    // 5. BẮN SOCKET & PUSH THÔNG BÁO CHO CÁC BÊN
    const updatePayload = {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: 'confirmed',
      payment_status: 'paid',
      payment_method: payment.provider,
      paid_online: true,
      cod_amount: 0,
      total_amount: order.totalAmount,
    };

    // Socket realtime
    this.orderGateway.emitOrderUpdate(order.orderCode, updatePayload, order.id);

    // Gửi FCM Push tới Chủ Quán & Khách hàng bất đồng bộ
    (async () => {
      try {
        const listing = await this.listingRepo.findOne({ where: { id: order.listingId } });
        const storeName = listing?.name || 'Quán ăn';
        const formattedTotal = order.totalAmount.toLocaleString('vi-VN') + 'đ';
        const ownerId = listing?.ownerUserId || 817;

        // Push Chủ quán
        await this.fcmService.sendToUser(
          ownerId,
          `[ĐƠN HÀNG MỚI - ĐÃ THANH TOÁN] #${order.orderCode}`,
          `Khách vừa thanh toán online đơn hàng (${formattedTotal}) tại "${storeName}". Quán hãy xác nhận và chuẩn bị món!`,
          {
            type: 'order:new',
            order_id: order.id,
            order_code: order.orderCode,
            paid_online: 'true',
            total_amount: order.totalAmount,
          },
          'alarm',
        );

        // Push Khách hàng
        if (order.userId) {
          await this.fcmService.sendToUser(
            order.userId,
            `Thanh toán thành công! #${order.orderCode}`,
            `Hệ thống đã nhận ${formattedTotal}. "${storeName}" đang chuẩn bị món cho bạn!`,
            {
              type: 'order:status_update',
              order_id: order.id,
              order_code: order.orderCode,
              payment_status: 'paid',
            },
          );
        }
      } catch (pushErr) {
        this.logger.warn(`Push notification failed: ${pushErr}`);
      }
    })();

    return { success: true, orderCode: order.orderCode, status: 'paid' };
  }

  /**
   * Tra cứu trạng thái thanh toán theo transactionId (dành cho client Polling)
   */
  async getPaymentStatus(transactionId: string) {
    const payment = await this.paymentRepo.findOne({ where: { transactionId } });
    if (!payment) {
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán');
    }

    return {
      transactionId: payment.transactionId,
      orderCode: payment.orderCode,
      provider: payment.provider,
      amount: payment.amount,
      status: payment.status,
      isPaid: payment.status === 'paid',
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  }

  // ==========================================
  // --- 1. VNPAY HELPER FUNCTIONS ---
  // ==========================================

  private buildVnpayUrl(
    order: Order,
    transactionId: string,
    amount: number,
    ipAddr: string,
    clientReturnUrl?: string,
  ): string {
    const createDate = this.formatVnpayDate(new Date());
    const expireDate = this.formatVnpayDate(new Date(Date.now() + 15 * 60 * 1000));

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.vnpayConfig.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: transactionId,
      vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
      vnp_OrderType: 'other',
      vnp_Amount: (amount * 100).toString(),
      vnp_ReturnUrl: clientReturnUrl || this.vnpayConfig.returnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    const sortedParams = this.sortObject(params);
    const signData = Object.entries(sortedParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', this.vnpayConfig.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return `${this.vnpayConfig.apiUrl}?${signData}&vnp_SecureHash=${signed}`;
  }

  verifyVnpaySignature(params: Record<string, any>, secureHash: string): boolean {
    if (!secureHash) return false;
    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') {
        cleanParams[k] = String(v);
      }
    }

    const sorted = this.sortObject(cleanParams);
    const signData = Object.entries(sorted)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', this.vnpayConfig.hashSecret);
    const expected = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return expected.toLowerCase() === secureHash.toLowerCase();
  }

  // ==========================================
  // --- 2. SEPAY VIETQR HELPER FUNCTIONS ---
  // ==========================================

  private buildSepayVietQr(amount: number, transactionId: string) {
    // URL chuẩn Sepay VietQR: nội dung chuyển khoản chính là transactionId (VD: TLN-A8F92K)
    // Ngân hàng không cho ký tự đặc biệt, transactionId đã được thiết kế TLN-XXXXXX
    const qrCodeUrl = `https://qr.sepay.vn/img?acc=${this.sepayConfig.accountNo}&bank=${this.sepayConfig.bankName}&amount=${amount}&des=${transactionId}`;

    return {
      qrCodeUrl,
      accountNo: this.sepayConfig.accountNo,
      accountName: this.sepayConfig.accountName,
      bankName: this.sepayConfig.bankName,
      bankId: this.sepayConfig.bankId,
    };
  }

  /**
   * Xử lý webhook từ Sepay khi có tiền vào tài khoản ngân hàng
   */
  async handleSepayWebhook(payload: any) {
    this.logger.log(`📥 [Sepay Webhook] Nhận dữ liệu: ${JSON.stringify(payload)}`);

    // Sepay payload thường có: content / des, transferAmount / amountIn, referenceCode, id
    const content = String(payload.content || payload.des || '').toUpperCase();
    const receivedAmount = Number(payload.transferAmount || payload.amountIn || 0);
    const providerTxnId = String(payload.id || payload.referenceCode || Date.now());

    // Bóc tách mã TLN-XXXXXX từ nội dung chuyển khoản
    const match = content.match(/TLN-[A-Z0-9]{6}/i) || content.match(/TLN[A-Z0-9]{6}/i);
    let txnId = '';
    if (match) {
      txnId = match[0].toUpperCase();
      if (!txnId.includes('-') && txnId.startsWith('TLN')) {
        txnId = `TLN-${txnId.substring(3)}`;
      }
    }

    if (!txnId) {
      this.logger.warn(`⚠️ [Sepay Webhook] Không tìm thấy mã TLN- trong nội dung: "${content}"`);
      return { success: false, message: 'Transaction reference not found in content' };
    }

    return this.processPaymentSuccess(txnId, providerTxnId, receivedAmount, payload);
  }

  // ==========================================
  // --- 3. MOMO HELPER FUNCTIONS ---
  // ==========================================

  private async buildMomoPayment(order: Order, transactionId: string, amount: number) {
    const rawSignature =
      `accessKey=${this.momoConfig.accessKey}&amount=${amount}&extraData=&ipnUrl=${this.momoConfig.notifyUrl}&orderId=${transactionId}&orderInfo=Thanh toan don hang ${order.orderCode}&partnerCode=${this.momoConfig.partnerCode}&redirectUrl=${this.momoConfig.returnUrl}&requestId=${transactionId}&requestType=captureWallet`;

    const signature = crypto
      .createHmac('sha256', this.momoConfig.secretKey)
      .update(rawSignature)
      .digest('hex');

    // Tạo link fallback deeplink và qr
    const payUrl = `https://test-payment.momo.vn/v2/gateway/pay?orderId=${transactionId}&amount=${amount}&signature=${signature}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

    return { payUrl, qrCodeUrl };
  }

  verifyMomoSignature(payload: any): boolean {
    try {
      const {
        partnerCode,
        orderId,
        requestId,
        amount,
        orderInfo,
        orderType,
        transId,
        resultCode,
        message,
        payType,
        responseTime,
        extraData,
        signature,
      } = payload;

      const raw = `accessKey=${this.momoConfig.accessKey}&amount=${amount}&extraData=${extraData || ''}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;

      const expected = crypto
        .createHmac('sha256', this.momoConfig.secretKey)
        .update(raw)
        .digest('hex');

      return expected.toLowerCase() === (signature || '').toLowerCase();
    } catch {
      return false;
    }
  }

  // ==========================================
  // --- 4. ZALOPAY HELPER FUNCTIONS ---
  // ==========================================

  private async buildZaloPayPayment(order: Order, transactionId: string, amount: number) {
    const appTransId = `${this.getYYMMDD()}_${transactionId.replace('-', '')}`;
    const appTime = Date.now();
    const embedData = JSON.stringify({ redirecturl: 'toplistna://payment/result' });
    const items = JSON.stringify([]);

    const data =
      `${this.zalopayConfig.appId}|${appTransId}|guest|${amount}|${appTime}|${embedData}|${items}`;
    const mac = crypto.createHmac('sha256', this.zalopayConfig.key1).update(data).digest('hex');

    const orderUrl = `https://sb-openapi.zalopay.vn/v2/pay?app_id=${this.zalopayConfig.appId}&app_trans_id=${appTransId}&mac=${mac}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(orderUrl)}`;

    return { orderUrl, qrCodeUrl };
  }

  verifyZaloPayCallback(dataStr: string, mac: string): boolean {
    const expected = crypto.createHmac('sha256', this.zalopayConfig.key2).update(dataStr).digest('hex');
    return expected.toLowerCase() === (mac || '').toLowerCase();
  }

  // --- UTILS ---
  private sortObject(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = obj[key];
    }
    return sorted;
  }

  private formatVnpayDate(date: Date): string {
    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}${h}${min}${s}`;
  }

  private getYYMMDD(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().substring(2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }
}

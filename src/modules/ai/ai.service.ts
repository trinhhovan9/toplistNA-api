import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Listing } from '../../entities/listing.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Truy vấn AI thông thường
   */
  async query(question: string, lat?: number, lng?: number) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      return {
        answer: `Dạ em là Trợ lý AI Toplist Nghệ An. Hiện tại em sẵn sàng tư vấn cho bạn các địa điểm ăn uống, vui chơi đặc sắc tại Nghệ An. Bạn muốn tìm món ăn hay dịch vụ gì ạ?`,
        suggestions: [
          'Quán ăn sáng ngon ở TP Vinh',
          'Quán cafe view đẹp gần Đại học Vinh',
          'Đặc sản Nghệ An làm quà',
        ],
        action_buttons: [
          { label: 'Xem menu', action: 'view_menu', listing_id: null },
          { label: 'Đặt bàn', action: 'table_booking', listing_id: null },
        ],
      };
    }

    try {
      const prompt = `Bạn là tổng đài viên AI tận tâm của nền tảng Toplist Nghệ An (ẩm thực & dịch vụ).
Người dùng hỏi: "${question}"
${lat && lng ? `Vị trí người dùng: ${lat}, ${lng}` : ''}

Hãy trả lời ngắn gọn, tự nhiên, thân thiện và ấm áp bằng tiếng Việt (xưng "em", gọi "bạn" hoặc "anh/chị"). Đề xuất 1-2 địa điểm cụ thể tại Nghệ An.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
          }),
        },
      );

      const data = (await response.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Dạ em có thể giúp gì thêm cho bạn ạ?';

      return {
        answer: text,
        suggestions: ['Quán ăn nổi bật', 'Cafe đẹp', 'Giao đồ ăn nhanh'],
        action_buttons: [],
      };
    } catch (e: any) {
      this.logger.warn(`Gemini query error: ${e.message}`);
      return {
        answer: `Dạ em chào bạn! Em là Trợ lý AI Toplist Nghệ An. Rất vui được đồng hành và hỗ trợ bạn tìm kiếm các địa điểm ăn uống ngon nhất tại Nghệ An ạ!`,
        suggestions: [],
        action_buttons: [],
      };
    }
  }

  /**
   * Tổng đài viên AI hỗ trợ chuyên sâu về một đơn hàng cụ thể
   */
  async orderSupport(orderIdentifier: string | number, userMessage: string) {
    const cleanStr = String(orderIdentifier || '').trim();
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
      throw new NotFoundException(`Không tìm thấy đơn hàng "${orderIdentifier}"`);
    }

    let storeName = 'Nhà hàng Toplist Nghệ An';
    let storePhone = '0988 123 456';
    let storeAddress = 'TP Vinh, Nghệ An';

    if (order.listingId) {
      const listing = await this.listingRepo.findOne({ where: { id: order.listingId } });
      if (listing) {
        storeName = listing.name || storeName;
        storePhone = listing.phone || storePhone;
        storeAddress = listing.address || storeAddress;
      }
    }

    const itemsSummary = (order.items || [])
      .map((i) => `${i.quantity}x ${i.name} (${Number(i.price).toLocaleString('vi-VN')}đ)`)
      .join(', ') || 'Đồ ăn';

    const totalVnd = Number(order.totalAmount || 0).toLocaleString('vi-VN') + 'đ';
    const status = (order.orderStatus || 'pending').toLowerCase().trim();

    // Map trạng thái đơn hàng sang mô tả tiếng Việt
    let statusDesc = 'Chờ quán xác nhận';
    let canCancel = false;
    switch (status) {
      case 'pending':
      case 'new':
        statusDesc = 'Quán chưa xác nhận (Đơn mới đặt, khách CÓ THỂ bấm HỦY ĐƠN miễn phí ngay lúc này)';
        canCancel = true;
        break;
      case 'preparing':
      case 'cooking':
        statusDesc = 'Quán đang chuẩn bị món ăn (Quán đã nhận đơn và đang chế biến sốt dẻo, hệ thống khóa tính năng tự hủy của khách)';
        break;
      case 'shipping':
      case 'delivering':
        statusDesc = 'Tài xế đang trên đường giao hàng đến bạn';
        break;
      case 'completed':
      case 'delivered':
        statusDesc = 'Đơn hàng đã hoàn thành và giao thành công';
        break;
      case 'cancelled':
        statusDesc = 'Đơn hàng đã bị hủy';
        break;
    }

    const driverInfo = order.driverName
      ? `Tài xế: ${order.driverName} (SĐT: ${order.driverPhone || 'Đang cập nhật'}, Biển số: ${order.driverPlate || 'Đang cập nhật'})`
      : 'Chưa phân công tài xế / Quán đang chuẩn bị món';

    const apiKey = this.config.get<string>('GEMINI_API_KEY');

    let aiAnswer = '';
    const actionButtons: Array<{ label: string; action: string; data?: any }> = [];
    const suggestions: string[] = [];

    // Gợi ý actions mặc định dựa theo trạng thái
    if (canCancel) {
      actionButtons.push({ label: 'Hủy đơn hàng này', action: 'cancel_order', data: order.id });
      suggestions.push('Làm sao để hủy đơn?');
      suggestions.push('Bao giờ quán nhận đơn?');
    } else if (status === 'preparing' || status === 'cooking') {
      actionButtons.push({ label: `Gọi cho quán (${storePhone})`, action: 'call_store', data: storePhone });
      suggestions.push('Bao lâu nữa có món ăn?');
      suggestions.push('Tôi có thể hủy đơn lúc này không?');
      suggestions.push('Món ăn của tôi gồm những gì?');
    } else if (status === 'shipping' || status === 'delivering') {
      if (order.driverPhone) {
        actionButtons.push({ label: `Gọi tài xế (${order.driverPhone})`, action: 'call_driver', data: order.driverPhone });
      }
      actionButtons.push({ label: 'Xem vị trí tài xế trên bản đồ', action: 'track_driver' });
      suggestions.push('Tài xế đang ở đâu rồi?');
      suggestions.push('Cho tôi số điện thoại tài xế');
    }

    actionButtons.push({ label: 'Theo dõi tiến độ đơn', action: 'track_order' });

    if (apiKey) {
      try {
        const systemPrompt = `Bạn là Trợ lý AI Tổng đài viên CSKH 24/7 của Toplist Nghệ An 🎧.
Nhiệm vụ: Tư vấn, giải đáp thắc mắc và hỗ trợ khách hàng về đơn hàng #${order.orderCode} một cách ân cần, lịch sự, thân thiện (xưng "em", gọi khách là "anh/chị" hoặc "bạn").

THÔNG TIN ĐƠN HÀNG THỰC TẾ HIỆN TẠI:
- Mã đơn hàng: #${order.orderCode} (ID: ${order.id})
- Quán ăn: ${storeName} (SĐT quán: ${storePhone}, Địa chỉ quán: ${storeAddress})
- Trạng thái hiện tại: ${statusDesc}
- Món ăn đã đặt: ${itemsSummary}
- Tổng tiền: ${totalVnd} (${order.paymentMethod === 'vietqr' ? 'Đã thanh toán online' : 'Thanh toán tiền mặt khi nhận'})
- Địa chỉ nhận: ${order.deliveryAddress || 'TP Vinh, Nghệ An'}
- Thông tin giao hàng: ${driverInfo}

QUY TẮC NGHIỆP VỤ CẦN LƯU Ý:
1. Nếu khách muốn HỦY ĐƠN:
   - Nếu trạng thái là 'pending' (quán chưa nhận): Giải thích khách có thể bấm trực tiếp nút "Hủy đơn" trên app ngay lúc này hoàn toàn miễn phí.
   - Nếu trạng thái là 'preparing' / 'cooking': Giải thích rất lịch sự rằng quán đã nhận đơn và đầu bếp đang trực tiếp chế biến món rồi nên không thể tự hủy trên app. Nếu có trường hợp khẩn cấp, xin vui lòng gọi trực tiếp cho quán qua số ${storePhone}.
   - Nếu trạng thái là 'shipping': Báo tài xế đang giao trên đường rồi nên không thể hủy.
2. Nếu khách hỏi "Bao lâu nữa có món?":
   - Nếu quán đang chuẩn bị: Thường mất 10 - 15 phút chế biến tươi ngon.
   - Nếu đang giao: Tài xế đang di chuyển nhanh nhất có thể đến địa chỉ của bạn.
3. Nếu khách hỏi thông tin tài xế hoặc liên hệ quán: Cung cấp thông tin có sẵn ở trên.

Câu hỏi của khách: "${userMessage}"
Hãy trả lời ngắn gọn (2 - 4 câu), đầy đủ thông tin, thân thiện và ấm áp.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
              generationConfig: { maxOutputTokens: 400, temperature: 0.6 },
            }),
          },
        );

        const data = (await response.json()) as any;
        aiAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err: any) {
        this.logger.warn(`[AiService] Gemini API call failed: ${err.message}, fallback to smart rule engine`);
      }
    }

    // Fallback AI Engine thông minh nếu chưa có Gemini Key hoặc lỗi mạng
    if (!aiAnswer) {
      aiAnswer = this.generateFallbackAnswer(userMessage, {
        orderCode: order.orderCode,
        status,
        statusDesc,
        storeName,
        storePhone,
        itemsSummary,
        totalVnd,
        driverInfo,
        driverPhone: order.driverPhone,
        driverName: order.driverName,
        canCancel,
      });
    }

    return {
      order_id: order.id,
      order_code: order.orderCode,
      order_status: order.orderStatus,
      store_name: storeName,
      store_phone: storePhone,
      answer: aiAnswer,
      action_buttons: actionButtons,
      suggestions: suggestions.length > 0 ? suggestions : ['Bao lâu nữa có món?', 'Tôi muốn đổi địa chỉ', 'Liên hệ tổng đài'],
    };
  }

  private generateFallbackAnswer(userQuery: string, ctx: any): string {
    const q = (userQuery || '').toLowerCase();

    if (q.includes('hủy') || q.includes('huy') || q.includes('cancel')) {
      if (ctx.canCancel) {
        return `Dạ em chào anh/chị! Hiện tại quán "${ctx.storeName}" đang chờ xác nhận món, anh/chị hoàn toàn CÓ THỂ HỦY ĐƠN miễn phí ngay lúc này bằng nút "Hủy đơn" màu đỏ trên màn hình ạ!`;
      } else if (ctx.status === 'preparing' || ctx.status === 'cooking') {
        return `Dạ quán "${ctx.storeName}" đã nhận đơn và đầu bếp đang trực tiếp chuẩn bị món ăn rồi ạ, nên hệ thống không hỗ trợ tự hủy đơn lúc này. Nếu có việc gấp, anh/chị vui lòng gọi trực tiếp hotline quán qua số ${ctx.storePhone} để được hỗ trợ nhanh nhất nhé!`;
      } else if (ctx.status === 'shipping') {
        return `Dạ tài xế ${ctx.driverName || 'giao hàng'} đã lấy món và đang trên đường giao tới địa chỉ của bạn rồi ạ, đơn hàng đang giao nên không thể hủy lúc này ạ.`;
      } else {
        return `Dạ đơn hàng #${ctx.orderCode} hiện đang ở trạng thái "${ctx.statusDesc}".`;
      }
    }

    if (q.includes('bao lâu') || q.includes('mấy phút') || q.includes('khi nào') || q.includes('đến đâu') || q.includes('chưa') || q.includes('thời gian')) {
      if (ctx.status === 'pending') {
        return `Dạ đơn #${ctx.orderCode} vừa được gửi tới quán "${ctx.storeName}". Quán đang tiếp nhận và sẽ xác nhận trong khoảng 1-3 phút tới ạ.`;
      } else if (ctx.status === 'preparing' || ctx.status === 'cooking') {
        return `Dạ quán "${ctx.storeName}" đang tích cực chuẩn bị món ăn cho anh/chị, dự kiến khoảng 10-15 phút sẽ bàn giao cho tài xế giao ngay ạ! Anh/chị đợi em một chút nhé!`;
      } else if (ctx.status === 'shipping') {
        return `Dạ tài xế ${ctx.driverName || 'FireGo'} đang trên đường mang món nóng hổi đến cho bạn rồi ạ! Bạn có thể xem lộ trình trực tiếp trên bản đồ nhé.`;
      }
    }

    if (q.includes('tài xế') || q.includes('shipper') || q.includes('số điện thoại') || q.includes('sđt') || q.includes('gọi')) {
      if (ctx.driverPhone) {
        return `Dạ tài xế phụ trách giao đơn #${ctx.orderCode} là anh ${ctx.driverName}, số điện thoại liên hệ là: ${ctx.driverPhone} ạ.`;
      } else {
        return `Dạ đơn hàng đang được quán "${ctx.storeName}" chuẩn bị. Ngay khi món sắp xong, hệ thống FireGo sẽ điều phối tài xế gần nhất nhận đơn và hiển thị số điện thoại cho bạn ngay ạ!`;
      }
    }

    if (q.includes('món') || q.includes('đặt gì') || q.includes('tiền') || q.includes('giá')) {
      return `Dạ đơn hàng #${ctx.orderCode} của anh/chị gồm: ${ctx.itemsSummary}. Tổng thanh toán là ${ctx.totalVnd} ạ!`;
    }

    // Mặc định
    return `Dạ em chào anh/chị! Em là Trợ lý AI CSKH Toplist Nghệ An 🎧. Em thấy đơn hàng #${ctx.orderCode} tại "${ctx.storeName}" đang ở trạng thái "${ctx.statusDesc}". Em có thể hỗ trợ gì thêm cho anh/chị về đơn này ạ?`;
  }
}

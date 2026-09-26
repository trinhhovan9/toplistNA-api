/**
 * HỢP ĐỒNG DỮ LIỆU TÀI CHÍNH BẤT BIẾN (FINANCIAL CONTRACT)
 * Giữa ToplistNA Food Engine và FireGo Delivery Engine
 * 
 * NGUYÊN TẮC BẤT BIẾN:
 * 1. ToplistNA là cơ quan thẩm quyền duy nhất quyết định: "Tiền là bao nhiêu" (Ground Truth).
 * 2. FireGo là cơ quan điều phối và thực thi ví tài xế: "Ví thực thi thế nào" (Execution Engine).
 * 3. ToplistNA tính toán snapshot và bắn sang FireGo.
 * 4. FireGo tự tính toán lại cashDifference, walletSettlement, requiredHold từ 3 biến gốc:
 *    - customerCashExpected
 *    - restaurantPickupAmount
 *    - driverShippingReward
 */

export interface DiscountItemBreakdown {
  menuItemId?: number;
  name: string;
  originalPrice: number;
  salePrice: number;
  quantity: number;
  itemDiscountAmount: number;
  flashSaleStoreDiscount: number;
  flashSalePlatformDiscount: number;
  itemStoreDiscount: number;
  itemPlatformDiscount: number;
  promotionId?: number | null;
  promotionType?: string | null;
}

export interface DiscountFundingBreakdown {
  storeFundedTotal: number;       // Flash Sale quán + Voucher quán + Split quán
  platformFundedTotal: number;    // Flash Sale sàn + Voucher sàn + Split sàn
  flashSaleStore: number;
  flashSalePlatform: number;
  voucherStore: number;
  voucherPlatform: number;
  splitStore: number;
  splitPlatform: number;
  itemBreakdowns?: DiscountItemBreakdown[];
}

export interface ShippingShareBreakdown {
  customerShippingFee: number;    // Cước ship khách trả
  driverShareRate: number;        // Tỷ lệ chia tài xế (%) - đóng băng lúc checkout (vd: 80)
  driverShareVersion: string;     // Phiên bản cấu hình cước (vd: 'pricing_v2.1_2026')
  driverShippingReward: number;    // Thù lao ship của tài xế = customerShippingFee * (driverShareRate / 100)
  firegoPlatformFee: number;       // Phí sàn FireGo giữ lại = customerShippingFee - driverShippingReward
}

export interface FoodFinancialSnapshot {
  version: string;                // e.g. '1.0'
  orderCode: string;
  orderId?: number;
  paymentMethod: 'cash' | 'vietqr' | 'wallet' | 'card' | string;
  isCod: boolean;                 // true nếu khách trả tiền mặt (COD)

  // Layer A: Tiền món ban đầu
  foodGrossAmount: number;        // Tổng giá gốc các món ăn

  // Layer B: Giảm giá & Cơ cấu tài trợ
  discounts: DiscountFundingBreakdown;

  // Layer C: Phí tiện ích & Phí vận chuyển
  serviceFee: number;             // Phí dịch vụ tiện ích ToplistNA thu
  shipping: ShippingShareBreakdown;

  // Layer D: Hoa hồng & Quyết toán Quán
  commissionBase: number;         // foodGrossAmount - discounts.storeFundedTotal
  storeCommissionRate: number;    // Tỷ lệ hoa hồng quán (vd: 20%)
  storeCommissionAmount: number;  // commissionBase * (storeCommissionRate / 100)
  restaurantNetSettlement: number;// Số tiền ToplistNA quyết toán cho quán = commissionBase - storeCommissionAmount

  // Dữ liệu đối soát tiền mặt & ví tài xế (Ground Truth gốc)
  customerCashExpected: number;   // Tiền mặt khách phải trả tài xế lúc giao hàng (COD: totalAmount; Online: 0)
  restaurantPickupAmount: number; // Tiền mặt tài xế thực tế đưa quán tại thời điểm lấy hàng
  driverShippingReward: number;   // Thù lao ship tài xế được hưởng
  totalCustomerPayable: number;   // Tổng thanh toán của khách

  createdAt: string;              // ISO String
}

export interface DriverCashReconciliation {
  customerCashExpected: number;
  restaurantPickupAmount: number;
  driverShippingReward: number;
  cashDifference: number;         // customerCashExpected - restaurantPickupAmount
  walletSettlement: number;       // driverShippingReward - cashDifference
  requiredHold: number;           // Math.max(0, -walletSettlement)
}

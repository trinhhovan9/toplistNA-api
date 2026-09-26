import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StoreWallet } from '../../entities/store-wallet.entity';
import { StoreWalletTransaction, StoreWalletTransactionType } from '../../entities/store-wallet-transaction.entity';
import { StoreWithdrawal, StoreWithdrawalStatus } from '../../entities/store-withdrawal.entity';
import { Order } from '../../entities/order.entity';
import { HotelReservation } from '../../entities/hotel-reservation.entity';

@Injectable()
export class StoreWalletService {
  private readonly logger = new Logger(StoreWalletService.name);

  constructor(
    @InjectRepository(StoreWallet)
    private readonly walletRepo: Repository<StoreWallet>,
    @InjectRepository(StoreWalletTransaction)
    private readonly transactionRepo: Repository<StoreWalletTransaction>,
    @InjectRepository(StoreWithdrawal)
    private readonly withdrawalRepo: Repository<StoreWithdrawal>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy thông tin Ví Quán (Tự động khởi tạo nếu chưa có)
   */
  async getOrCreateWallet(storeId: number): Promise<StoreWallet> {
    let wallet = await this.walletRepo.findOne({ where: { storeId } });
    if (!wallet) {
      wallet = this.walletRepo.create({
        storeId,
        balance: 0,
        heldBalance: 0,
      });
      wallet = await this.walletRepo.save(wallet);
      this.logger.log(`[StoreWallet] 🆕 Created wallet for storeId: ${storeId}`);
    }
    return wallet;
  }

  /**
   * Lấy chi tiết ví kèm lịch sử biến động số dư và lệnh rút tiền
   */
  async getWalletDetails(storeId: number) {
    const wallet = await this.getOrCreateWallet(storeId);

    const recentTransactions = await this.transactionRepo.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const recentWithdrawals = await this.withdrawalRepo.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      success: true,
      wallet: {
        id: wallet.id,
        storeId: wallet.storeId,
        balance: wallet.balance,
        pendingBalance: wallet.pendingBalance || 0,
        heldBalance: wallet.heldBalance,
        debtBalance: wallet.debtBalance || 0,
        availableBalance: Math.max(0, wallet.balance),
        totalEarnings: (wallet.balance || 0) + (wallet.pendingBalance || 0),
        bankName: wallet.bankName,
        bankAccountNumber: wallet.bankAccountNumber,
        bankAccountHolder: wallet.bankAccountHolder,
        hasBankAccount: !!(wallet.bankAccountNumber && wallet.bankName),
      },
      transactions: recentTransactions,
      withdrawals: recentWithdrawals,
    };
  }

  /**
   * Cập nhật thông tin tài khoản ngân hàng nhận tiền rút
   */
  async updateBankAccount(storeId: number, dto: { bankName: string; bankAccountNumber: string; bankAccountHolder: string }) {
    if (!dto.bankName || !dto.bankAccountNumber || !dto.bankAccountHolder) {
      throw new BadRequestException('Vui lòng điền đầy đủ: Tên ngân hàng, Số tài khoản và Tên chủ tài khoản');
    }

    const wallet = await this.getOrCreateWallet(storeId);
    wallet.bankName = dto.bankName.trim();
    wallet.bankAccountNumber = dto.bankAccountNumber.trim();
    wallet.bankAccountHolder = dto.bankAccountHolder.trim().toUpperCase();

    const saved = await this.walletRepo.save(wallet);
    this.logger.log(`[StoreWallet] 🏦 Updated bank account for store ${storeId}: ${saved.bankName} - ${saved.bankAccountNumber}`);
    return {
      success: true,
      message: 'Cập nhật tài khoản ngân hàng thành công',
      wallet: saved,
    };
  }

  /**
   * ⭐ QUYẾT TOÁN DOANH THU ĐƠN HÀNG TRỰC TIẾP VÀO VÍ THỰC DỤNG (KHẢ DỤNG RÚT - STRICT IDEMPOTENCY)
   * Được gọi khi đơn hàng chuyển sang DELIVERED / COMPLETED
   * App tự động chuyển doanh thu vào ví thực dụng của Quán ngay lập tức
   */
  async settleOrderRevenue(order: Order): Promise<{ settled: boolean; amount: number; message: string }> {
    const orderCode = order.orderCode || `OD${order.id}`;
    const storeId = Number(order.listingId);
    if (!storeId || isNaN(storeId)) {
      this.logger.warn(`[StoreWallet] ⚠️ Order #${orderCode} missing listingId, skipping store settlement.`);
      return { settled: false, amount: 0, message: 'Missing listingId' };
    }

    // 1. Kiểm tra Idempotency Key - Chống cộng tiền 2 lần nếu webhook gửi lặp lại
    const idempotencyKey = `TOPLISTNA:${orderCode}:STORE_WALLET_SETTLEMENT`;
    const existingTx = await this.transactionRepo.findOne({ where: { idempotencyKey } });
    if (existingTx) {
      this.logger.warn(`[StoreWallet] ⚠️ Duplicate settlement prevented for order #${orderCode} [${idempotencyKey}]`);
      return { settled: false, amount: existingTx.amount, message: 'Already settled (Idempotent)' };
    }

    // 2. Tính số tiền quán thực nhận (restaurantNetSettlement)
    let netSettlement = 0;
    const breakdown = order.financialBreakdown as any;
    if (breakdown && breakdown.restaurantNetSettlement !== undefined) {
      netSettlement = Number(breakdown.restaurantNetSettlement);
    } else {
      // Fallback: subtotal - hoa hồng 20%
      const foodGross = Number(order.subtotal || order.totalAmount || 0);
      const discount = Number(order.discountAmount || 0);
      const commissionBase = Math.max(0, foodGross - discount);
      const commission = Math.round(commissionBase * 0.2);
      netSettlement = commissionBase - commission;
    }

    if (netSettlement <= 0) {
      this.logger.log(`[StoreWallet] ℹ️ Net settlement is 0 for order #${orderCode}. No wallet credit needed.`);
      return { settled: false, amount: 0, message: 'Zero net settlement' };
    }

    // 3. Thực hiện cộng tiền vào VÍ CHỜ ĐỐI SOÁT (pendingBalance) và ghi transaction nguyên tử
    return await this.dataSource.transaction(async (manager) => {
      let wallet = await manager.findOne(StoreWallet, { where: { storeId } });
      if (!wallet) {
        wallet = manager.create(StoreWallet, { storeId, balance: 0, pendingBalance: 0, heldBalance: 0 });
        wallet = await manager.save(StoreWallet, wallet);
      }

      const pendingBefore = wallet.pendingBalance || 0;
      const pendingAfter = pendingBefore + netSettlement;

      wallet.pendingBalance = pendingAfter;
      await manager.save(StoreWallet, wallet);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        orderId: order.id,
        orderCode,
        type: StoreWalletTransactionType.ORDER_REVENUE_PENDING,
        amount: netSettlement,
        balanceBefore: pendingBefore,
        balanceAfter: pendingAfter,
        idempotencyKey,
        description: `Doanh thu đơn hàng #${orderCode}: +${netSettlement.toLocaleString('vi-VN')}đ (Cộng vào Ví Chờ đối soát)`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] ⏳ Credited +${netSettlement.toLocaleString('vi-VN')}đ to Store #${storeId} PENDING WALLET for order #${orderCode} (Ví Chờ: ${pendingBefore} -> ${pendingAfter})`);

      return {
        settled: true,
        amount: netSettlement,
        message: 'Successfully credited to store pending wallet',
      };
    });
  }

  /**
   * ⭐ QUYẾT TOÁN DOANH THU & CÔNG NỢ ĐẶT PHÒNG KHÁCH SẠN (HOTEL SETTLEMENT & PROPERTY COLLECT)
   * Cơ chế thu hộ và cấn trừ hoa hồng tự động:
   * 1. Trường hợp Khách trả trực tiếp tại khách sạn (Thu tại chỗ - pay_at_hotel):
   *    - Khách sạn thu 100% tiền phòng từ khách khi check-in (VD: 500k)
   *    - Khách sạn phải chịu hoa hồng sàn 15% (VD: 75k)
   *    - Sàn tự động khấu trừ 75k từ Số Dư Khả Dụng nếu có sẵn (COMMISSION_AUTO_DEDUCTION)
   *    - Nếu ví khả dụng không đủ, phần còn lại được ghi vào Ví Công Nợ Hoa Hồng (debtBalance) (PROPERTY_COLLECT_COMMISSION_DEBT)
   *    - Số nợ này sẽ tự động khấu trừ vào các booking trả trước (online) tiếp theo, không cần chuyển khoản thủ công!
   *
   * 2. Trường hợp Khách thanh toán trước qua ToplistNA (Prepaid Booking - deposit_30, full_payment...):
   *    - ToplistNA thu tiền phòng, phần doanh thu thuần của khách sạn là hotelNetAmount
   *    - Nếu khách sạn đang có nợ hoa hồng (debtBalance > 0):
   *      Sàn tự động cấn trừ: offset = min(debtBalance, hotelNetAmount)
   *      debtBalance -= offset
   *      Tiền thực cộng vào Ví Chờ đối soát = hotelNetAmount - offset
   *      Ghi nhận log cấn trừ COMMISSION_AUTO_DEDUCTION và ghi nhận doanh thu ORDER_REVENUE_PENDING
   *    - Nếu không nợ: Toàn bộ hotelNetAmount được cộng vào Ví Chờ đối soát.
   */
  async settleHotelBookingRevenue(reservation: HotelReservation): Promise<{ settled: boolean; amount: number; message: string }> {
    const bookingCode = reservation.bookingCode || `HT${reservation.id}`;
    const hotelId = Number(reservation.listingId);
    if (!hotelId || isNaN(hotelId)) {
      this.logger.warn(`[StoreWallet] ⚠️ Reservation #${bookingCode} missing listingId, skipping hotel settlement.`);
      return { settled: false, amount: 0, message: 'Missing listingId' };
    }

    const idempotencyKey = `TOPLISTNA:${bookingCode}:HOTEL_WALLET_SETTLEMENT`;
    const existingTx = await this.transactionRepo.findOne({ where: { idempotencyKey } });
    if (existingTx) {
      this.logger.warn(`[StoreWallet] ⚠️ Duplicate hotel settlement prevented for reservation #${bookingCode} [${idempotencyKey}]`);
      return { settled: false, amount: existingTx.amount, message: 'Already settled (Idempotent)' };
    }

    const isPropertyCollect = reservation.depositMethod === 'pay_at_hotel';

    return await this.dataSource.transaction(async (manager) => {
      let wallet = await manager.findOne(StoreWallet, { where: { storeId: hotelId } });
      if (!wallet) {
        wallet = manager.create(StoreWallet, { storeId: hotelId, balance: 0, pendingBalance: 0, heldBalance: 0, debtBalance: 0 });
        wallet = await manager.save(StoreWallet, wallet);
      }

      // ----------------------------------------------------
      // CASE 1: THU TIỀN TẠI KHÁCH SẠN (Khách trả tại KS)
      // ----------------------------------------------------
      if (isPropertyCollect) {
        const gross = Number(reservation.grossAmount || reservation.customerPayable || reservation.totalPrice || 500000);
        let commRate = Number(reservation.commissionRate || 0);
        let commission = Number(reservation.commissionAmount || 0);
        if (commission <= 0) {
          let effectiveRate = 15;
          try {
            const opt = await manager.query(
              "SELECT option_value FROM options WHERE option_name = 'system_operational_config' LIMIT 1"
            );
            if (opt && opt[0]?.option_value) {
              const parsed = JSON.parse(opt[0].option_value);
              if (parsed.hotel_commission_rate !== undefined) {
                effectiveRate = Number(parsed.hotel_commission_rate);
              }
            }
          } catch (_) {}
          commRate = effectiveRate;
          commission = Math.round((gross * effectiveRate) / 100);
        } else if (commRate <= 0 && gross > 0) {
          commRate = Math.round((commission / gross) * 100) || 15;
        }

        const balBefore = wallet.balance || 0;
        const debtBefore = wallet.debtBalance || 0;

        // A. Khách sạn có đủ số dư khả dụng để khấu trừ ngay
        if (balBefore >= commission) {
          wallet.balance = balBefore - commission;
          await manager.save(StoreWallet, wallet);

          const tx = manager.create(StoreWalletTransaction, {
            walletId: wallet.id,
            storeId: hotelId,
            orderId: reservation.id,
            orderCode: bookingCode,
            type: StoreWalletTransactionType.COMMISSION_AUTO_DEDUCTION,
            amount: -commission,
            balanceBefore: balBefore,
            balanceAfter: wallet.balance,
            idempotencyKey,
            description: `Khấu trừ tự động hoa hồng ${commRate}% (-${commission.toLocaleString('vi-VN')}đ) từ Số dư khả dụng cho đơn #${bookingCode} (Khách trả tại KS)`,
          });
          await manager.save(StoreWalletTransaction, tx);

          this.logger.log(`[StoreWallet] 🏨 Property Collect #${bookingCode}: Auto-deducted ${commission.toLocaleString('vi-VN')}đ from available balance for hotel #${hotelId}. Balance: ${balBefore} -> ${wallet.balance}`);
          return {
            settled: true,
            amount: commission,
            message: `Tự động khấu trừ ${commission.toLocaleString('vi-VN')}đ hoa hồng từ số dư khả dụng`,
          };
        }

        // B. Số dư khả dụng có một phần (> 0 nhưng < commission)
        if (balBefore > 0 && balBefore < commission) {
          const deductedFromBal = balBefore;
          const remainingDebt = commission - deductedFromBal;
          wallet.balance = 0;
          wallet.debtBalance = debtBefore + remainingDebt;
          await manager.save(StoreWallet, wallet);

          const txDeduct = manager.create(StoreWalletTransaction, {
            walletId: wallet.id,
            storeId: hotelId,
            orderId: reservation.id,
            orderCode: bookingCode,
            type: StoreWalletTransactionType.COMMISSION_AUTO_DEDUCTION,
            amount: -deductedFromBal,
            balanceBefore: balBefore,
            balanceAfter: 0,
            idempotencyKey: `${idempotencyKey}:DEDUCT_BAL`,
            description: `Khấu trừ tự động hoa hồng (-${deductedFromBal.toLocaleString('vi-VN')}đ) từ Số dư khả dụng cho đơn #${bookingCode}`,
          });
          await manager.save(StoreWalletTransaction, txDeduct);

          const txDebt = manager.create(StoreWalletTransaction, {
            walletId: wallet.id,
            storeId: hotelId,
            orderId: reservation.id,
            orderCode: bookingCode,
            type: StoreWalletTransactionType.PROPERTY_COLLECT_COMMISSION_DEBT,
            amount: remainingDebt,
            balanceBefore: debtBefore,
            balanceAfter: wallet.debtBalance,
            idempotencyKey,
            description: `Ghi nhận công nợ hoa hồng ${commRate}% còn lại (+${remainingDebt.toLocaleString('vi-VN')}đ) vào Ví Công Nợ cho đơn #${bookingCode} (Khách trả tại KS)`,
          });
          await manager.save(StoreWalletTransaction, txDebt);

          this.logger.log(`[StoreWallet] 🏨 Property Collect #${bookingCode}: Deducted ${deductedFromBal.toLocaleString('vi-VN')}đ, added ${remainingDebt.toLocaleString('vi-VN')}đ to debt wallet for hotel #${hotelId}`);
          return {
            settled: true,
            amount: commission,
            message: `Khấu trừ ${deductedFromBal.toLocaleString('vi-VN')}đ, ghi nhận công nợ ${remainingDebt.toLocaleString('vi-VN')}đ`,
          };
        }

        // C. Không có số dư khả dụng (balance <= 0): Ghi toàn bộ vào Ví Công Nợ Hoa Hồng
        wallet.debtBalance = debtBefore + commission;
        await manager.save(StoreWallet, wallet);

        const txDebt = manager.create(StoreWalletTransaction, {
          walletId: wallet.id,
          storeId: hotelId,
          orderId: reservation.id,
          orderCode: bookingCode,
          type: StoreWalletTransactionType.PROPERTY_COLLECT_COMMISSION_DEBT,
          amount: commission,
          balanceBefore: debtBefore,
          balanceAfter: wallet.debtBalance,
          idempotencyKey,
          description: `Ghi nhận công nợ hoa hồng ${commRate}% (+${commission.toLocaleString('vi-VN')}đ) vào Ví Công Nợ (Khách trả tại KS #${bookingCode})`,
        });
        await manager.save(StoreWalletTransaction, txDebt);

        this.logger.log(`[StoreWallet] 🏨 Property Collect #${bookingCode}: Recorded +${commission.toLocaleString('vi-VN')}đ to DEBT WALLET for hotel #${hotelId} (Ví Nợ: ${debtBefore} -> ${wallet.debtBalance})`);
        return {
          settled: true,
          amount: commission,
          message: `Ghi nhận ${commission.toLocaleString('vi-VN')}đ vào Ví Công Nợ Hoa Hồng (sẽ tự động khấu trừ từ booking tiếp theo)`,
        };
      }

      // ----------------------------------------------------
      // CASE 2: PREPAID BOOKING (Khách thanh toán trước online)
      // ----------------------------------------------------
      const netSettlement = Number(reservation.hotelNetAmount || 0);
      if (netSettlement <= 0) {
        this.logger.log(`[StoreWallet] ℹ️ Hotel net settlement is 0 for reservation #${bookingCode}. No credit needed.`);
        return { settled: false, amount: 0, message: 'Zero net settlement' };
      }

      const debtBefore = wallet.debtBalance || 0;
      const pendingBefore = wallet.pendingBalance || 0;

      // Nếu khách sạn đang có nợ hoa hồng từ các đơn Property Collect: Cấn trừ tự động
      if (debtBefore > 0) {
        const offsetAmount = Math.min(debtBefore, netSettlement);
        const creditAmount = netSettlement - offsetAmount;

        wallet.debtBalance = debtBefore - offsetAmount;
        wallet.pendingBalance = pendingBefore + creditAmount;
        await manager.save(StoreWallet, wallet);

        // Ghi transaction cấn trừ công nợ
        const txOffset = manager.create(StoreWalletTransaction, {
          walletId: wallet.id,
          storeId: hotelId,
          orderId: reservation.id,
          orderCode: bookingCode,
          type: StoreWalletTransactionType.COMMISSION_AUTO_DEDUCTION,
          amount: -offsetAmount,
          balanceBefore: debtBefore,
          balanceAfter: wallet.debtBalance,
          idempotencyKey: `${idempotencyKey}:DEBT_OFFSET`,
          description: `Tự động khấu trừ công nợ hoa hồng Property Collect (-${offsetAmount.toLocaleString('vi-VN')}đ) từ doanh thu booking #${bookingCode}. Nợ hoa hồng còn: ${wallet.debtBalance.toLocaleString('vi-VN')}đ`,
        });
        await manager.save(StoreWalletTransaction, txOffset);

        // Ghi transaction cộng phần doanh thu thuần còn lại vào Ví Chờ
        const txCredit = manager.create(StoreWalletTransaction, {
          walletId: wallet.id,
          storeId: hotelId,
          orderId: reservation.id,
          orderCode: bookingCode,
          type: StoreWalletTransactionType.ORDER_REVENUE_PENDING,
          amount: creditAmount,
          balanceBefore: pendingBefore,
          balanceAfter: wallet.pendingBalance,
          idempotencyKey,
          description: `Doanh thu đặt phòng online #${bookingCode}: +${creditAmount.toLocaleString('vi-VN')}đ (Đã tự động cấn trừ ${offsetAmount.toLocaleString('vi-VN')}đ nợ hoa hồng, cộng vào Ví Chờ đối soát)`,
        });
        await manager.save(StoreWalletTransaction, txCredit);

        this.logger.log(`[StoreWallet] 🏨 Prepaid Booking #${bookingCode}: Auto-offset ${offsetAmount.toLocaleString('vi-VN')}đ debt, credited +${creditAmount.toLocaleString('vi-VN')}đ to PENDING WALLET for hotel #${hotelId}`);
        return {
          settled: true,
          amount: creditAmount,
          message: `Đã cấn trừ ${offsetAmount.toLocaleString('vi-VN')}đ công nợ, cộng +${creditAmount.toLocaleString('vi-VN')}đ vào Ví Chờ đối soát`,
        };
      }

      // Không có nợ: Toàn bộ netSettlement cộng vào Ví Chờ đối soát
      const pendingAfter = pendingBefore + netSettlement;
      wallet.pendingBalance = pendingAfter;
      await manager.save(StoreWallet, wallet);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId: hotelId,
        orderId: reservation.id,
        orderCode: bookingCode,
        type: StoreWalletTransactionType.ORDER_REVENUE_PENDING,
        amount: netSettlement,
        balanceBefore: pendingBefore,
        balanceAfter: pendingAfter,
        idempotencyKey,
        description: `Doanh thu đặt phòng online #${bookingCode}: +${netSettlement.toLocaleString('vi-VN')}đ (Cộng vào Ví Chờ đối soát)`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] 🏨 Credited +${netSettlement.toLocaleString('vi-VN')}đ to Hotel #${hotelId} PENDING WALLET for booking #${bookingCode} (Ví Chờ: ${pendingBefore} -> ${pendingAfter})`);

      return {
        settled: true,
        amount: netSettlement,
        message: 'Successfully credited to hotel pending wallet',
      };
    });
  }

  /**
   * ⭐ THANH TOÁN / GẠCH NỢ CÔNG NỢ HOA HỒNG THỦ CÔNG
   * Dùng khi khách sạn muốn thanh toán nợ sớm từ Số dư khả dụng hoặc chuyển khoản VietQR
   */
  async repayHotelCommissionDebt(
    storeId: number,
    amount: number,
    method: 'balance' | 'manual' = 'balance',
    note?: string,
  ) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền thanh toán nợ phải lớn hơn 0');
    }
    const wallet = await this.getOrCreateWallet(storeId);
    const currentDebt = wallet.debtBalance || 0;
    if (currentDebt <= 0) {
      throw new BadRequestException('Khách sạn hiện không có nợ hoa hồng cần thanh toán');
    }
    const repayAmount = Math.min(amount, currentDebt);

    return await this.dataSource.transaction(async (manager) => {
      const debtBefore = wallet.debtBalance || 0;
      const debtAfter = debtBefore - repayAmount;
      wallet.debtBalance = debtAfter;

      let balBefore = wallet.balance || 0;
      let balAfter = balBefore;

      if (method === 'balance') {
        if (balBefore < repayAmount) {
          throw new BadRequestException(`Số dư khả dụng (${balBefore.toLocaleString('vi-VN')}đ) không đủ để thanh toán ${repayAmount.toLocaleString('vi-VN')}đ nợ hoa hồng`);
        }
        balAfter = balBefore - repayAmount;
        wallet.balance = balAfter;
      }

      await manager.save(StoreWallet, wallet);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.DEBT_REPAYMENT,
        amount: repayAmount,
        balanceBefore: debtBefore,
        balanceAfter: debtAfter,
        idempotencyKey: `TOPLISTNA:REPAY_DEBT:${storeId}:${Date.now()}`,
        description: method === 'balance'
          ? `Thanh toán nợ hoa hồng ${repayAmount.toLocaleString('vi-VN')}đ từ Số Dư Khả Dụng. Nợ còn lại: ${debtAfter.toLocaleString('vi-VN')}đ. ${note || ''}`
          : `Gạch nợ hoa hồng ${repayAmount.toLocaleString('vi-VN')}đ (Chuyển khoản VietQR/Admin xác nhận). Nợ còn lại: ${debtAfter.toLocaleString('vi-VN')}đ. ${note || ''}`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] ✅ Store #${storeId} repaid ${repayAmount.toLocaleString('vi-VN')}đ commission debt via ${method}. Debt: ${debtBefore} -> ${debtAfter}`);

      return {
        success: true,
        message: `Đã thanh toán ${repayAmount.toLocaleString('vi-VN')}đ nợ hoa hồng thành công!`,
        wallet: {
          balance: wallet.balance,
          debtBalance: debtAfter,
          pendingBalance: wallet.pendingBalance,
        },
      };
    });
  }

  /**
   * ⭐ GIẢI TỎA ĐỐI SOÁT: Chuyển tiền từ Ví Chờ sang Số Dư Khả Dụng (Available Balance)
   * Có thể gọi tự động (Cron/T+1) hoặc Quán/Admin bấm xác nhận đối soát
   */
  async releasePendingBalance(storeId: number, amount?: number) {
    const wallet = await this.getOrCreateWallet(storeId);
    const pending = wallet.pendingBalance || 0;

    if (pending <= 0) {
      throw new BadRequestException('Hiện không có số dư trong Ví Chờ để đối soát');
    }

    const releaseAmount = (amount && amount > 0 && amount <= pending) ? amount : pending;
    const idempotencyKey = `TOPLISTNA:RELEASE_PENDING:${storeId}:${Date.now()}`;

    return await this.dataSource.transaction(async (manager) => {
      const pendingBefore = wallet.pendingBalance;
      const pendingAfter = pendingBefore - releaseAmount;
      const balBefore = wallet.balance;
      const balAfter = balBefore + releaseAmount;

      wallet.pendingBalance = pendingAfter;
      wallet.balance = balAfter;
      await manager.save(StoreWallet, wallet);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.PENDING_SETTLED,
        amount: releaseAmount,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        idempotencyKey,
        description: `Đối soát hoàn tất: Giải tỏa ${releaseAmount.toLocaleString('vi-VN')}đ từ Ví Chờ sang Số Dư Khả Dụng`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] ✅ Released ${releaseAmount.toLocaleString('vi-VN')}đ from Pending to Available for store #${storeId} (Available: ${balBefore} -> ${balAfter})`);

      return {
        success: true,
        message: `Đã đối soát giải tỏa ${releaseAmount.toLocaleString('vi-VN')}đ sang Số dư khả dụng thành công.`,
        wallet: {
          balance: balAfter,
          pendingBalance: pendingAfter,
          heldBalance: wallet.heldBalance,
        },
      };
    });
  }

  /**
   * Tạo yêu cầu rút tiền từ Ví Quán về tài khoản ngân hàng
   */
  async requestWithdrawal(storeId: number, amount: number) {
    if (!amount || amount < 50000) {
      throw new BadRequestException('Số tiền rút tối thiểu là 50.000đ');
    }

    const wallet = await this.getOrCreateWallet(storeId);
    if (!wallet.bankAccountNumber || !wallet.bankName || !wallet.bankAccountHolder) {
      throw new BadRequestException('Vui lòng thiết lập thông tin tài khoản ngân hàng trước khi rút tiền');
    }

    if (wallet.balance < amount) {
      throw new BadRequestException(`Số dư khả dụng không đủ. Hiện có: ${wallet.balance.toLocaleString('vi-VN')}đ, yêu cầu rút: ${amount.toLocaleString('vi-VN')}đ`);
    }

    const idempotencyKey = `TOPLISTNA:WITHDRAWAL:${storeId}:${Date.now()}`;

    return await this.dataSource.transaction(async (manager) => {
      const balBefore = wallet.balance;
      const balAfter = balBefore - amount;

      wallet.balance = balAfter;
      wallet.heldBalance += amount; // Giữ tạm thời cho đến khi chuyển khoản hoàn tất
      await manager.save(StoreWallet, wallet);

      const withdrawal = manager.create(StoreWithdrawal, {
        walletId: wallet.id,
        storeId,
        amount,
        bankName: wallet.bankName,
        bankAccountNumber: wallet.bankAccountNumber,
        bankAccountHolder: wallet.bankAccountHolder,
        status: StoreWithdrawalStatus.PENDING,
      });
      const savedWithdrawal = await manager.save(StoreWithdrawal, withdrawal);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.WITHDRAWAL,
        amount: -amount,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        idempotencyKey,
        description: `Lệnh rút tiền về ngân hàng ${wallet.bankName} (${wallet.bankAccountNumber}): -${amount.toLocaleString('vi-VN')}đ [Mã lệnh: #WDR-${savedWithdrawal.id}]`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] 💸 Store #${storeId} requested withdrawal of ${amount.toLocaleString('vi-VN')}đ. Balance: ${balBefore} -> ${balAfter}`);

      return {
        success: true,
        message: `Đã tạo lệnh rút ${amount.toLocaleString('vi-VN')}đ thành công. Tiền sẽ được chuyển về tài khoản ${wallet.bankName} trong 1-2 ngày làm việc.`,
        withdrawal: savedWithdrawal,
        newBalance: balAfter,
      };
    });
  }

  /**
   * ⭐ ADMIN: Lấy danh sách tất cả các lệnh rút tiền từ quán để thực hiện chuyển khoản
   */
  async getAllWithdrawals(query?: { status?: string; search?: string }) {
    const qb = this.withdrawalRepo.createQueryBuilder('w')
      .orderBy('w.createdAt', 'DESC');

    if (query?.status && query.status !== 'all') {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    const withdrawals = await qb.getMany();
    const storeIds = Array.from(new Set(withdrawals.map(w => Number(w.storeId)).filter(Boolean)));
    
    let storeMap = new Map<number, any>();
    if (storeIds.length > 0) {
      try {
        const stores = await this.dataSource.query(
          `SELECT id, name, phone, address FROM listings WHERE id IN (?)`,
          [storeIds],
        );
        storeMap = new Map((stores || []).map((s: any) => [Number(s.id), s]));
      } catch (e) {
        this.logger.warn(`Could not fetch store listings for withdrawals: ${e.message}`);
      }
    }

    return withdrawals.map(w => {
      const store = storeMap.get(Number(w.storeId));
      const bankCode = this.getVietQrBankCode(w.bankName);
      const cleanAcc = (w.bankAccountNumber || '').replace(/\D/g, '');
      const vietQrUrl = `https://img.vietqr.io/image/${bankCode}-${cleanAcc}-compact2.png?amount=${w.amount}&addInfo=TOPLISTNA%20WDR%20${w.id}&accountName=${encodeURIComponent(w.bankAccountHolder || '')}`;

      return {
        id: w.id,
        walletId: w.walletId,
        storeId: w.storeId,
        storeName: store?.name || `Quán đối tác #${w.storeId}`,
        storePhone: store?.phone || '---',
        storeAddress: store?.address || '',
        amount: w.amount,
        bankName: w.bankName,
        bankAccountNumber: w.bankAccountNumber,
        bankAccountHolder: w.bankAccountHolder,
        bankCode,
        vietQrUrl,
        status: w.status,
        rejectionReason: w.rejectionReason,
        processedAt: w.processedAt,
        createdAt: w.createdAt,
      };
    });
  }

  /**
   * ⭐ Chuẩn hóa mã ngân hàng sang chuẩn VietQR NAPAS
   */
  getVietQrBankCode(bankName: string): string {
    const b = (bankName || '').toUpperCase();
    if (b.includes('MB')) return 'MB';
    if (b.includes('VIETCOM') || b.includes('VCB')) return 'VCB';
    if (b.includes('VIETIN') || b.includes('CTG') || b.includes('ICB')) return 'ICB';
    if (b.includes('TECHCOM') || b.includes('TCB')) return 'TCB';
    if (b.includes('BIDV')) return 'BIDV';
    if (b.includes('ACB')) return 'ACB';
    if (b.includes('TPBANK') || b.includes('TIENPHONG') || b.includes('TPB')) return 'TPB';
    if (b.includes('VPBANK') || b.includes('VPB')) return 'VPB';
    if (b.includes('SACOM') || b.includes('STB')) return 'STB';
    if (b.includes('HDBANK') || b.includes('HDB')) return 'HDB';
    if (b.includes('VIB')) return 'VIB';
    if (b.includes('SHB')) return 'SHB';
    if (b.includes('OCB')) return 'OCB';
    if (b.includes('AGRIBANK') || b.includes('VBA')) return 'VBA';
    if (b.includes('SEABANK') || b.includes('SSB')) return 'SEAB';
    if (b.includes('MSB') || b.includes('HANG HAI')) return 'MSB';
    if (b.includes('LPBANK') || b.includes('LIENVIET')) return 'LPB';
    return 'MB';
  }

  /**
   * ⭐ ADMIN: Xử lý lệnh rút tiền (Đã chuyển khoản thành công hoặc Từ chối hoàn tiền)
   */
  async processWithdrawal(
    withdrawalId: number,
    status: 'COMPLETED' | 'REJECTED',
    note?: string,
    adminInfo?: string,
  ) {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException(`Không tìm thấy lệnh rút tiền #${withdrawalId}`);
    }

    if (withdrawal.status !== StoreWithdrawalStatus.PENDING && withdrawal.status !== StoreWithdrawalStatus.PROCESSING) {
      throw new BadRequestException(`Lệnh rút tiền #${withdrawalId} đã được xử lý trước đó (${withdrawal.status})`);
    }

    const wallet = await this.getOrCreateWallet(withdrawal.storeId);

    return await this.dataSource.transaction(async (manager) => {
      if (status === 'COMPLETED') {
        wallet.heldBalance = Math.max(0, (wallet.heldBalance || 0) - withdrawal.amount);
        await manager.save(StoreWallet, wallet);

        withdrawal.status = StoreWithdrawalStatus.COMPLETED;
        withdrawal.processedAt = new Date();
        if (note) withdrawal.rejectionReason = note;
        await manager.save(StoreWithdrawal, withdrawal);

        this.logger.log(`[StoreWallet] ✅ Payout COMPLETED for withdrawal #${withdrawalId} (${withdrawal.amount.toLocaleString('vi-VN')}đ) to store #${withdrawal.storeId} by ${adminInfo || 'Admin'}`);
      } else {
        // REJECTED -> Hoàn tiền lại số dư khả dụng
        const balBefore = wallet.balance || 0;
        const balAfter = balBefore + withdrawal.amount;
        wallet.balance = balAfter;
        wallet.heldBalance = Math.max(0, (wallet.heldBalance || 0) - withdrawal.amount);
        await manager.save(StoreWallet, wallet);

        withdrawal.status = StoreWithdrawalStatus.REJECTED;
        withdrawal.rejectionReason = note || 'Admin từ chối lệnh rút (Thông tin ngân hàng không hợp lệ)';
        withdrawal.processedAt = new Date();
        await manager.save(StoreWithdrawal, withdrawal);

        const tx = manager.create(StoreWalletTransaction, {
          walletId: wallet.id,
          storeId: withdrawal.storeId,
          type: StoreWalletTransactionType.WITHDRAWAL_REFUND,
          amount: withdrawal.amount,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          idempotencyKey: `TOPLISTNA:REFUND_WDR:${withdrawalId}:${Date.now()}`,
          description: `Hoàn tiền lệnh rút #${withdrawalId}: +${withdrawal.amount.toLocaleString('vi-VN')}đ. Lý do: ${withdrawal.rejectionReason}`,
        });
        await manager.save(StoreWalletTransaction, tx);

        this.logger.log(`[StoreWallet] ❌ Withdrawal #${withdrawalId} REJECTED. Refunded ${withdrawal.amount.toLocaleString('vi-VN')}đ to store #${withdrawal.storeId}`);
      }

      return {
        success: true,
        message: status === 'COMPLETED' ? 'Đã ghi nhận chuyển khoản thành công cho quán!' : 'Đã từ chối lệnh và hoàn tiền về ví cho quán!',
        withdrawal,
      };
    });
  }

  /**
   * ⭐ ADMIN: Chuyển tiền quyết toán trực tiếp cho Quán (Direct Payout to Bank)
   */
  async directPayoutToStore(
    storeId: number,
    amount: number,
    source: 'balance' | 'pendingBalance',
    note?: string,
    adminInfo?: string,
  ) {
    const wallet = await this.getOrCreateWallet(storeId);
    if (!wallet.bankAccountNumber || !wallet.bankName) {
      throw new BadRequestException('Quán đối tác chưa cài đặt thông tin tài khoản ngân hàng để nhận tiền');
    }

    const available = source === 'pendingBalance' ? (wallet.pendingBalance || 0) : (wallet.balance || 0);
    if (available < amount) {
      throw new BadRequestException(`Số dư ${source === 'pendingBalance' ? 'Ví Chờ' : 'Ví Khả Dụng'} không đủ. Hiện có: ${available.toLocaleString('vi-VN')}đ, muốn chuyển: ${amount.toLocaleString('vi-VN')}đ`);
    }

    return await this.dataSource.transaction(async (manager) => {
      const balBefore = source === 'pendingBalance' ? (wallet.pendingBalance || 0) : (wallet.balance || 0);
      const balAfter = balBefore - amount;

      if (source === 'pendingBalance') {
        wallet.pendingBalance = balAfter;
      } else {
        wallet.balance = balAfter;
      }
      await manager.save(StoreWallet, wallet);

      const withdrawal = manager.create(StoreWithdrawal, {
        walletId: wallet.id,
        storeId,
        amount,
        bankName: wallet.bankName,
        bankAccountNumber: wallet.bankAccountNumber,
        bankAccountHolder: wallet.bankAccountHolder,
        status: StoreWithdrawalStatus.COMPLETED,
        processedAt: new Date(),
        rejectionReason: `Admin chuyển tiền trực tiếp: ${note || 'Quyết toán doanh thu'} (${adminInfo || 'Admin'})`,
      });
      const savedWithdrawal = await manager.save(StoreWithdrawal, withdrawal);

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.WITHDRAWAL,
        amount: -amount,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        idempotencyKey: `TOPLISTNA:ADMIN_DIRECT_PAYOUT:${storeId}:${Date.now()}`,
        description: `Admin chuyển tiền trực tiếp về ngân hàng ${wallet.bankName} (${wallet.bankAccountNumber}): -${amount.toLocaleString('vi-VN')}đ. Ghi chú: ${note || 'Quyết toán'}`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] 💸 Admin direct payout ${amount.toLocaleString('vi-VN')}đ to store #${storeId} completed!`);

      return {
        success: true,
        message: `Đã thực hiện chuyển khoản ${amount.toLocaleString('vi-VN')}đ cho Quán thành công!`,
        withdrawal: savedWithdrawal,
      };
    });
  }

  /**
   * ⭐ ADMIN: Danh sách ví tất cả quán kèm thông tin ngân hàng & số dư đối soát
   */
  async getAllStoreWalletsWithListings(search?: string) {
    const wallets = await this.walletRepo.find();
    const walletMap = new Map(wallets.map(w => [Number(w.storeId), w]));

    // Query listings
    let listingsQuery = `SELECT id, name, phone, address FROM listings WHERE id IN (${wallets.map(w => Number(w.storeId)).join(',') || '0'})`;
    if (wallets.length === 0) {
      listingsQuery = `SELECT id, name, phone, address FROM listings ORDER BY id DESC LIMIT 50`;
    }
    const listings = await this.dataSource.query(listingsQuery);

    return listings.map((l: any) => {
      const lid = Number(l.id);
      const w = walletMap.get(lid);
      const balance = Number(w?.balance || 0);
      const pendingBalance = Number(w?.pendingBalance || 0);
      const heldBalance = Number(w?.heldBalance || 0);
      const bankName = w?.bankName || '';
      const bankAccountNumber = w?.bankAccountNumber || '';
      const bankAccountHolder = w?.bankAccountHolder || '';
      const bankCode = this.getVietQrBankCode(bankName);
      const cleanAcc = bankAccountNumber.replace(/\D/g, '');
      const defaultQrUrl = bankAccountNumber ? `https://img.vietqr.io/image/${bankCode}-${cleanAcc}-compact2.png?amount=${pendingBalance || balance || 50000}&addInfo=TOPLISTNA%20PAYOUT%20${lid}&accountName=${encodeURIComponent(bankAccountHolder)}` : '';

      return {
        storeId: lid,
        storeName: l.name,
        storePhone: l.phone || '---',
        storeAddress: l.address || '',
        balance,
        pendingBalance,
        heldBalance,
        totalEarnings: balance + pendingBalance + heldBalance,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        bankCode,
        hasBankAccount: !!(bankAccountNumber && bankName),
        vietQrUrl: defaultQrUrl,
      };
    });
  }

  /**
   * ⭐ ADMIN: Lấy tất cả lịch sử biến động số dư của các quán
   */
  async getAllWalletTransactions(limit = 100) {
    const txs = await this.transactionRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const storeIds = Array.from(new Set(txs.map(t => Number(t.storeId)).filter(Boolean)));
    let storeMap = new Map<number, string>();
    if (storeIds.length > 0) {
      const stores = await this.dataSource.query(
        `SELECT id, name FROM listings WHERE id IN (?)`,
        [storeIds],
      );
      storeMap = new Map((stores || []).map((s: any) => [Number(s.id), s.name]));
    }

    return txs.map(t => ({
      ...t,
      storeName: storeMap.get(Number(t.storeId)) || `Quán #${t.storeId}`,
    }));
  }

  /**
   * ⭐ ADMIN: Danh sách địa điểm có công nợ hoa hồng & Thống kê tổng quan
   */
  async getAdminDebtsOverview(search?: string, minDebt?: number) {
    const allWallets = await this.walletRepo.find();
    
    let totalDebt = 0;
    let debtStoreCount = 0;
    let maxDebt = 0;

    for (const w of allWallets) {
      const debt = Number(w.debtBalance || 0);
      if (debt > 0) {
        totalDebt += debt;
        debtStoreCount++;
        if (debt > maxDebt) maxDebt = debt;
      }
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const repaymentTxs = await this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.type = :type', { type: StoreWalletTransactionType.DEBT_REPAYMENT })
      .andWhere('tx.created_at >= :startOfMonth', { startOfMonth })
      .getMany();

    const totalCollectedThisMonth = repaymentTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    let debtors = allWallets.filter(w => Number(w.debtBalance || 0) > 0);
    if (minDebt && minDebt > 0) {
      debtors = debtors.filter(w => Number(w.debtBalance || 0) >= minDebt);
    }

    debtors.sort((a, b) => Number(b.debtBalance || 0) - Number(a.debtBalance || 0));

    const storeIds = debtors.map(w => Number(w.storeId));
    let storeMap = new Map<number, any>();
    if (storeIds.length > 0) {
      const listings = await this.dataSource.query(
        `SELECT id, name, phone, address, type, thumb FROM listings WHERE id IN (?)`,
        [storeIds]
      );
      storeMap = new Map((listings || []).map((l: any) => [Number(l.id), l]));
    }

    let items = debtors.map(w => {
      const lid = Number(w.storeId);
      const l = storeMap.get(lid);
      const debt = Number(w.debtBalance || 0);
      const balance = Number(w.balance || 0);
      const pendingBalance = Number(w.pendingBalance || 0);
      return {
        storeId: lid,
        storeName: l?.name || `Địa điểm #${lid}`,
        storePhone: l?.phone || '---',
        storeAddress: l?.address || '---',
        storeType: l?.type || 'HOTEL',
        storeThumb: l?.thumb || '',
        debtBalance: debt,
        balance,
        pendingBalance,
        bankName: w.bankName || '',
        bankAccountNumber: w.bankAccountNumber || '',
        bankAccountHolder: w.bankAccountHolder || '',
        updatedAt: w.updatedAt,
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i => 
        i.storeName.toLowerCase().includes(q) ||
        i.storePhone.toLowerCase().includes(q) ||
        String(i.storeId).includes(q) ||
        i.storeAddress.toLowerCase().includes(q)
      );
    }

    return {
      stats: {
        totalDebt,
        debtStoreCount,
        totalCollectedThisMonth,
        maxDebt,
      },
      items,
    };
  }

  /**
   * ⭐ ADMIN: Ghi nhận thu nợ / Gạch nợ trực tiếp cho địa điểm
   */
  async recordDebtPayment(
    storeId: number,
    amount: number,
    method: 'bank_transfer' | 'cash' | 'other' = 'bank_transfer',
    referenceCode?: string,
    note?: string,
    adminInfo?: string,
  ) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền thu nợ phải lớn hơn 0đ');
    }
    const wallet = await this.getOrCreateWallet(storeId);
    const currentDebt = wallet.debtBalance || 0;
    if (currentDebt <= 0) {
      throw new BadRequestException(`Địa điểm #${storeId} hiện không có công nợ cần thanh toán`);
    }

    const payAmount = Math.min(amount, currentDebt);

    return await this.dataSource.transaction(async (manager) => {
      const debtBefore = wallet.debtBalance || 0;
      const debtAfter = Math.max(0, debtBefore - payAmount);
      wallet.debtBalance = debtAfter;
      await manager.save(StoreWallet, wallet);

      const methodText = method === 'bank_transfer' ? 'Chuyển khoản ngân hàng' : (method === 'cash' ? 'Tiền mặt' : 'Khác');
      const refText = referenceCode ? ` [Mã GD: ${referenceCode}]` : '';
      const adminText = adminInfo ? ` (Admin: ${adminInfo})` : '';

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.DEBT_REPAYMENT,
        amount: payAmount,
        balanceBefore: debtBefore,
        balanceAfter: debtAfter,
        idempotencyKey: `TOPLISTNA:ADMIN_DEBT_PAYMENT:${storeId}:${Date.now()}`,
        description: `Admin gạch nợ hoa hồng: -${payAmount.toLocaleString('vi-VN')}đ qua ${methodText}${refText}. Nợ còn: ${debtAfter.toLocaleString('vi-VN')}đ. Ghi chú: ${note || 'Không'}${adminText}`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] 💵 Admin recorded debt payment: -${payAmount.toLocaleString('vi-VN')}đ for Store #${storeId}. Debt: ${debtBefore} -> ${debtAfter}`);

      return {
        success: true,
        message: `Đã ghi nhận thu nợ ${payAmount.toLocaleString('vi-VN')}đ thành công!`,
        wallet: {
          storeId,
          debtBalance: debtAfter,
          balance: wallet.balance,
          pendingBalance: wallet.pendingBalance,
        },
      };
    });
  }

  /**
   * ⭐ ADMIN: Sửa / Điều chỉnh công nợ hoa hồng (Tăng / Giảm / Đặt lại)
   */
  async adjustStoreDebt(
    storeId: number,
    action: 'SET' | 'INCREASE' | 'DECREASE',
    amount: number,
    reason: string,
    adminNote?: string,
    adminInfo?: string,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do điều chỉnh công nợ để lưu vết kiểm toán');
    }
    if (amount === undefined || amount < 0) {
      throw new BadRequestException('Số tiền điều chỉnh không hợp lệ');
    }

    const wallet = await this.getOrCreateWallet(storeId);
    const debtBefore = wallet.debtBalance || 0;
    let debtAfter = debtBefore;
    let diff = 0;

    if (action === 'SET') {
      debtAfter = Math.max(0, amount);
      diff = debtAfter - debtBefore;
    } else if (action === 'INCREASE') {
      debtAfter = debtBefore + amount;
      diff = amount;
    } else if (action === 'DECREASE') {
      debtAfter = Math.max(0, debtBefore - amount);
      diff = -(debtBefore - debtAfter);
    } else {
      throw new BadRequestException('Hành động điều chỉnh không hợp lệ (SET, INCREASE, DECREASE)');
    }

    return await this.dataSource.transaction(async (manager) => {
      wallet.debtBalance = debtAfter;
      await manager.save(StoreWallet, wallet);

      const actionText = action === 'SET' ? 'Đặt lại số nợ' : (action === 'INCREASE' ? 'Tăng công nợ' : 'Giảm trừ / Miễn giảm công nợ');
      const adminText = adminInfo ? ` (Thực hiện bởi: ${adminInfo})` : '';

      const tx = manager.create(StoreWalletTransaction, {
        walletId: wallet.id,
        storeId,
        type: StoreWalletTransactionType.ADJUSTMENT,
        amount: diff,
        balanceBefore: debtBefore,
        balanceAfter: debtAfter,
        idempotencyKey: `TOPLISTNA:ADMIN_ADJUST_DEBT:${storeId}:${Date.now()}`,
        description: `Admin điều chỉnh công nợ [${actionText}]: ${debtBefore.toLocaleString('vi-VN')}đ -> ${debtAfter.toLocaleString('vi-VN')}đ. Lý do: ${reason.trim()}.${adminNote ? ` Ghi chú: ${adminNote.trim()}` : ''}${adminText}`,
      });
      await manager.save(StoreWalletTransaction, tx);

      this.logger.log(`[StoreWallet] ✏️ Admin adjusted debt for Store #${storeId} [${action}]: ${debtBefore} -> ${debtAfter}. Reason: ${reason}`);

      return {
        success: true,
        message: `Đã điều chỉnh công nợ thành ${debtAfter.toLocaleString('vi-VN')}đ thành công!`,
        wallet: {
          storeId,
          debtBalance: debtAfter,
          balance: wallet.balance,
          pendingBalance: wallet.pendingBalance,
        },
      };
    });
  }

  /**
   * ⭐ ADMIN: Lấy chi tiết lịch sử biến động công nợ của một địa điểm
   */
  async getStoreDebtHistory(storeId: number, limit = 50) {
    const txs = await this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.store_id = :storeId', { storeId })
      .andWhere('tx.type IN (:...types)', {
        types: [
          StoreWalletTransactionType.PROPERTY_COLLECT_COMMISSION_DEBT,
          StoreWalletTransactionType.DEBT_REPAYMENT,
          StoreWalletTransactionType.COMMISSION_AUTO_DEDUCTION,
          StoreWalletTransactionType.ADJUSTMENT,
        ],
      })
      .orderBy('tx.created_at', 'DESC')
      .take(limit)
      .getMany();

    const listings = await this.dataSource.query(
      `SELECT id, name, phone, address FROM listings WHERE id = ? LIMIT 1`,
      [storeId]
    );
    const storeInfo = listings && listings[0] ? listings[0] : null;

    const wallet = await this.walletRepo.findOne({ where: { storeId } });

    return {
      storeInfo: {
        storeId,
        storeName: storeInfo?.name || `Địa điểm #${storeId}`,
        storePhone: storeInfo?.phone || '---',
        storeAddress: storeInfo?.address || '---',
        debtBalance: wallet?.debtBalance || 0,
        balance: wallet?.balance || 0,
        pendingBalance: wallet?.pendingBalance || 0,
      },
      history: txs,
    };
  }
}

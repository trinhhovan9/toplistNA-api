import { Controller, Get, Put, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { StoreWalletService } from './store-wallet.service';

@Controller('store/wallet')
export class StoreWalletController {
  constructor(private readonly storeWalletService: StoreWalletService) {}

  @Get(':storeId')
  async getWalletDetails(@Param('storeId') storeId: string) {
    return this.storeWalletService.getWalletDetails(Number(storeId));
  }

  @Put(':storeId/bank-account')
  async updateBankAccount(
    @Param('storeId') storeId: string,
    @Body() dto: { bankName: string; bankAccountNumber: string; bankAccountHolder: string },
  ) {
    return this.storeWalletService.updateBankAccount(Number(storeId), dto);
  }

  @Post(':storeId/withdraw')
  async requestWithdrawal(
    @Param('storeId') storeId: string,
    @Body() dto: { amount: number },
  ) {
    return this.storeWalletService.requestWithdrawal(Number(storeId), Number(dto.amount));
  }

  @Post(':storeId/release-pending')
  async releasePendingBalance(
    @Param('storeId') storeId: string,
    @Body() dto?: { amount?: number },
  ) {
    return this.storeWalletService.releasePendingBalance(Number(storeId), dto?.amount);
  }

  @Post(':storeId/repay-debt')
  async repayCommissionDebt(
    @Param('storeId') storeId: string,
    @Body() dto: { amount: number; method?: 'balance' | 'manual'; note?: string },
  ) {
    return this.storeWalletService.repayHotelCommissionDebt(
      Number(storeId),
      Number(dto.amount),
      dto.method || 'balance',
      dto.note,
    );
  }

  // ==========================================
  // ⭐ ADMIN ROUTES FOR SETTLEMENT & PAYOUTS
  // ==========================================
  @Get('admin/all-wallets')
  async getAllWallets() {
    return this.storeWalletService.getAllStoreWalletsWithListings();
  }

  @Get('admin/withdrawals')
  async getAllWithdrawals() {
    return this.storeWalletService.getAllWithdrawals();
  }

  @Post('admin/withdrawals/:id/process')
  async processWithdrawal(
    @Param('id') id: string,
    @Body() body: { status: 'COMPLETED' | 'REJECTED'; note?: string },
  ) {
    return this.storeWalletService.processWithdrawal(Number(id), body.status, body.note);
  }

  @Post('admin/direct-payout/:storeId')
  async directPayout(
    @Param('storeId') storeId: string,
    @Body() body: { amount: number; source: 'balance' | 'pendingBalance'; note?: string },
  ) {
    return this.storeWalletService.directPayoutToStore(
      Number(storeId),
      Number(body.amount),
      body.source || 'balance',
      body.note,
    );
  }

  @Get('admin/transactions')
  async getAllTransactions() {
    return this.storeWalletService.getAllWalletTransactions();
  }

  // ==========================================
  // ⭐ ADMIN ROUTES FOR STORE DEBT MANAGEMENT
  // ==========================================
  @Get('admin/debts')
  async getAdminDebtsOverview(
    @Query('search') search?: string,
    @Query('minDebt') minDebt?: string,
  ) {
    return this.storeWalletService.getAdminDebtsOverview(search, minDebt ? Number(minDebt) : undefined);
  }

  @Post('admin/debts/:storeId/record-payment')
  async recordDebtPayment(
    @Param('storeId') storeId: string,
    @Body() body: { amount: number; method?: 'bank_transfer' | 'cash' | 'other'; referenceCode?: string; note?: string; adminInfo?: string },
  ) {
    return this.storeWalletService.recordDebtPayment(
      Number(storeId),
      Number(body.amount),
      body.method || 'bank_transfer',
      body.referenceCode,
      body.note,
      body.adminInfo,
    );
  }

  @Post('admin/debts/:storeId/adjust')
  async adjustStoreDebt(
    @Param('storeId') storeId: string,
    @Body() body: { action: 'SET' | 'INCREASE' | 'DECREASE'; amount: number; reason: string; adminNote?: string; adminInfo?: string },
  ) {
    return this.storeWalletService.adjustStoreDebt(
      Number(storeId),
      body.action,
      Number(body.amount),
      body.reason,
      body.adminNote,
      body.adminInfo,
    );
  }

  @Get('admin/debts/:storeId/history')
  async getStoreDebtHistory(
    @Param('storeId') storeId: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeWalletService.getStoreDebtHistory(Number(storeId), limit ? Number(limit) : 50);
  }
}

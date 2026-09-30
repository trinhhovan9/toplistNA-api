import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminDataService } from './admin-data.service';

@Controller('admin')
@UseGuards(AdminJwtGuard)
export class AdminDataController {
  constructor(private readonly dataService: AdminDataService) {}

  // 1. DASHBOARD
  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.dataService.getDashboardStats();
  }

  @Get('dashboard/monthly-revenue')
  async getMonthlyRevenue(@Query('year') year?: number) {
    return this.dataService.getMonthlyRevenue(year);
  }

  // 2. ORDERS
  @Get('orders')
  async getOrders(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getOrders({ status, search, startDate, endDate, page, limit });
  }

  @Get('orders/:id')
  async getOrderDetail(@Param('id', ParseIntPipe) id: number) {
    return this.dataService.getOrderDetail(id);
  }

  @Put('orders/:id/status')
  async updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; reason?: string },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateOrderStatus(
      id,
      body.status,
      body.reason || '',
      req.admin || req.user,
      ip,
      ua,
    );
  }

  // 3. RESTAURANTS
  @Get('restaurants')
  async getRestaurants(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getRestaurants({ status, type, search, startDate, endDate, page, limit });
  }

  @Put('restaurants/:id/eta')
  async updateRestaurantEta(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { prepMin: number; prepMax: number },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateRestaurantEta(
      id,
      Number(body.prepMin),
      Number(body.prepMax),
      req.admin || req.user,
      ip,
      ua,
    );
  }

  @Put('restaurants/:id/status')
  async updateRestaurantStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateRestaurantStatus(id, body.status, req.admin || req.user, ip, ua);
  }

  // 3.1 HOTELS & ACCOMMODATIONS (LƯU TRÚ)
  @Get('hotels')
  async getHotels(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getHotels({ status, type, search, startDate, endDate, page, limit });
  }

  @Put('hotels/:id/config')
  async updateHotelConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      commissionRate?: number;
      checkinTime?: string;
      checkoutTime?: string;
      allowPayAtHotel?: boolean;
      starRating?: number;
    },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateHotelConfig(id, body, req.admin || req.user, ip, ua);
  }

  @Put('hotels/:id/status')
  async updateHotelStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateHotelStatus(id, body.status, req.admin || req.user, ip, ua);
  }

  @Get('hotels/:id/rooms')
  async getHotelRooms(@Param('id', ParseIntPipe) id: number) {
    return this.dataService.getHotelRooms(id);
  }

  @Put('hotels/rooms/:roomId/toggle-status')
  async toggleHotelRoomStatus(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() body: { isAvailable: boolean },
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.toggleHotelRoomStatus(roomId, Boolean(body.isAvailable), req.admin || req.user, ip, ua);
  }

  // 4. MENU ITEMS
  @Get('menu')
  async getMenuItems(
    @Query('listingId') listingId?: number,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getMenuItems({
      listingId: listingId ? Number(listingId) : undefined,
      search,
      page,
      limit,
    });
  }

  @Post('menu')
  async createMenuItem(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.createMenuItem(body, req.admin || req.user, ip, ua);
  }

  @Put('menu/:id/toggle-stock')
  async toggleMenuItemStock(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.toggleMenuItemStock(id, req.admin || req.user, ip, ua);
  }

  @Put('menu/:id')
  async updateMenuItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateMenuItem(id, body, req.admin || req.user, ip, ua);
  }

  // 5. PAYMENTS & MANUAL RECHECK
  @Get('payments')
  async getPayments(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getPayments({ status, search, startDate, endDate, page, limit });
  }

  @Post('payments/:id/recheck')
  async recheckPayment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.recheckPayment(id, req.admin || req.user, ip, ua);
  }

  // 6. DELIVERIES (FIREGO FLEET & ACTIVE ORDERS)
  @Get('deliveries')
  async getDeliveries() {
    return this.dataService.getActiveDeliveries();
  }

  // 7. FLASH SALES
  @Get('flash-sales')
  async getFlashSales() {
    return this.dataService.getFlashSales();
  }

  @Post('flash-sales')
  async createFlashSale(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.createFlashSale(body, req.admin || req.user, ip, ua);
  }

  @Put('flash-sales/:id/toggle')
  async toggleFlashSale(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.toggleFlashSale(id, req.admin || req.user, ip, ua);
  }

  @Put('flash-sales/:id/extend')
  async extendFlashSale(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.extendFlashSale(id, req.admin || req.user, ip, ua);
  }

  @Delete('flash-sales/:id')
  async deleteFlashSale(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.deleteFlashSale(id, req.admin || req.user, ip, ua);
  }

  // 8. VOUCHERS
  @Get('vouchers')
  async getVouchers() {
    return this.dataService.getVouchers();
  }

  @Post('vouchers')
  async createVoucher(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.createVoucher(body, req.admin || req.user, ip, ua);
  }

  @Put('vouchers/:id')
  async updateVoucher(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateVoucher(id, body, req.admin || req.user, ip, ua);
  }

  @Put('vouchers/:id/toggle')
  async toggleVoucher(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.toggleVoucher(id, req.admin || req.user, ip, ua);
  }

  // 9. SETTLEMENT
  @Get('settlement')
  async getSettlement(@Query('search') search?: string) {
    return this.dataService.getSettlementSummary({ search });
  }

  // 10. CUSTOMERS CRM
  @Get('customers')
  async getCustomers(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getCustomers({ search, page, limit });
  }

  // 11. REVIEWS
  @Get('reviews')
  async getReviews(
    @Query('search') search?: string,
    @Query('rating') rating?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dataService.getReviews({ search, rating, page, limit });
  }

  // 12. APP VERSIONS
  @Get('app-versions')
  async getAppVersions() {
    return this.dataService.getAppVersions();
  }

  @Post('app-versions')
  async createAppVersion(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.createAppVersion(body, req.user || req.admin, ip, ua);
  }

  @Put('app-versions/:id')
  async updateAppVersion(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateAppVersion(id, body, req.user || req.admin, ip, ua);
  }

  // 13. SYSTEM HEALTH
  @Get('system-health')
  async getSystemHealth() {
    return this.dataService.getSystemHealth();
  }

  // 14. SYSTEM SETTINGS & PRICING
  @Get('system-settings')
  async getSystemSettings() {
    const config = await this.dataService.getSystemSettings();
    return { success: true, data: config };
  }

  @Put('system-settings')
  async updateSystemSettings(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateSystemSettings(body, req.user || req.admin, ip, ua);
  }

  // 15. HOMEPAGE COLLECTIONS CMS
  @Get('homepage-collections')
  async getHomepageCollections() {
    return this.dataService.getHomepageCollections();
  }

  @Post('homepage-collections')
  async createHomepageCollection(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.createHomepageCollection(body, req.admin || req.user, ip, ua);
  }

  @Put('homepage-collections/reorder')
  async reorderHomepageCollections(@Body() body: { orders: Array<{ id: number; sortOrder: number }> }) {
    return this.dataService.reorderHomepageCollections(body.orders || []);
  }

  @Put('homepage-collections/:id')
  async updateHomepageCollection(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.updateHomepageCollection(id, body, req.admin || req.user, ip, ua);
  }

  @Delete('homepage-collections/:id')
  async deleteHomepageCollection(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.dataService.deleteHomepageCollection(id, req.admin || req.user, ip, ua);
  }
}


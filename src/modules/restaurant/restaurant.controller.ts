import { Controller, Get, Post, Put, Delete, Param, Query, Body, Headers, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { RestaurantService } from './restaurant.service';

@ApiTags('Restaurant')
@Controller('restaurants')
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  /**
   * GET /api/v1/restaurants/merchant/my-stores
   * Lấy danh sách quán thuộc quyền sở hữu của user đang đăng nhập
   */
  @Get('merchant/my-stores')
  @ApiOperation({ summary: 'Lấy danh sách quán thuộc quyền sở hữu của Merchant' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  async getMyStores(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    if (!userId) {
      return { success: true, data: [], message: 'Chưa đăng nhập hoặc không có quán nào' };
    }
    const data = await this.restaurantService.getMyStores(userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/restaurants/merchant/my-locations
   * Lấy danh sách địa điểm khác (ngoài ăn uống và lưu trú) thuộc quyền sở hữu của user
   */
  @Get('merchant/my-locations')
  @ApiOperation({ summary: 'Lấy danh sách địa điểm khác ngoài ẩm thực và lưu trú' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  async getMyLocations(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    if (!userId) {
      return { success: true, data: [] };
    }
    const data = await this.restaurantService.getMyLocations(userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/restaurants/merchant/:id/verify
   * Xác thực quyền quản trị quán
   */
  @Get('merchant/:id/verify')
  @ApiOperation({ summary: 'Xác thực quyền quản trị quán' })
  async verifyPermission(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    const listing = await this.restaurantService.verifyMerchantPermission(userId, parseInt(id, 10));
    return { success: true, data: { is_authorized: true, listing_id: listing.id, name: listing.name } };
  }

  /**
   * POST /api/v1/restaurants/merchant/items
   * Thêm món ăn mới vào thực đơn quán
   */
  @Post('merchant/items')
  @ApiOperation({ summary: 'Thêm món ăn mới vào thực đơn (Merchant)' })
  async addMenuItem(
    @Body() dto: any,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId || dto.userId || dto.user_id;
    const userId = parseInt(rawId || '0', 10);
    const result = await this.restaurantService.saveMerchantMenuItem(userId, dto);
    return { success: true, data: result, message: 'Đã lưu món ăn vào thực đơn' };
  }

  /**
   * PUT /api/v1/restaurants/merchant/items/:itemId
   * Cập nhật món ăn
   */
  @Put('merchant/items/:itemId')
  @ApiOperation({ summary: 'Cập nhật món ăn (Merchant)' })
  async updateMenuItem(
    @Param('itemId') itemId: string,
    @Body() dto: any,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId || dto.userId || dto.user_id;
    const userId = parseInt(rawId || '0', 10);
    dto.id = parseInt(itemId, 10);
    const result = await this.restaurantService.saveMerchantMenuItem(userId, dto);
    return { success: true, data: result, message: 'Đã cập nhật món ăn thành công' };
  }

  /**
   * DELETE /api/v1/restaurants/merchant/items/:itemId
   * Xóa món ăn khỏi thực đơn quán
   */
  @Delete('merchant/items/:itemId')
  @ApiOperation({ summary: 'Xóa món ăn khỏi thực đơn (Merchant)' })
  async deleteMenuItem(
    @Param('itemId') itemId: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    const result = await this.restaurantService.deleteMerchantMenuItem(userId, parseInt(itemId, 10));
    return result;
  }

  /**
   * POST /api/v1/restaurants/merchant/items/:itemId/toggle-available
   * Bật / Tắt còn món hoặc hết món nhanh (Merchant)
   */
  @Post('merchant/items/:itemId/toggle-available')
  @ApiOperation({ summary: 'Bật / Tắt còn món hoặc hết món nhanh (Merchant)' })
  async toggleItemAvailable(
    @Param('itemId') itemId: string,
    @Body() body: { is_available: boolean },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    const result = await this.restaurantService.toggleMenuItemAvailability(
      userId,
      parseInt(itemId, 10),
      body.is_available,
    );
    return { success: true, data: result, message: 'Đã cập nhật trạng thái món ăn' };
  }

  /**
   * POST /api/v1/restaurants/merchant/:id/toggle-open
   * Bật / Tắt trạng thái mở cửa quán
   */
  @Post('merchant/:id/toggle-open')
  @ApiOperation({ summary: 'Bật / Tắt trạng thái mở cửa quán' })
  async toggleOpen(
    @Param('id') id: string,
    @Body() body: { is_open: boolean },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '0', 10);
    const result = await this.restaurantService.toggleStoreStatus(userId, parseInt(id, 10), body.is_open);
    return { success: true, data: result, message: 'Đã cập nhật trạng thái hoạt động của quán' };
  }

  /**
   * GET /api/v1/restaurants/nearby?lat=18.67&lng=105.68&filter=Gần nhất&page=1
   */
  @Get('nearby')
  @ApiOperation({ summary: 'Danh sách quán ăn gần vị trí hiện tại' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'q', required: false, description: 'Từ khóa tìm kiếm món ăn hoặc tên quán' })
  @ApiQuery({ name: 'filter', required: false, description: 'Gần nhất|Toplist Verified|Free ship' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async getNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('q') search = '',
    @Query('filter') filter = '',
    @Query('page') page = '1',
  ) {
    const filters = filter ? filter.split(',') : [];
    const data = await this.restaurantService.getNearby(
      parseFloat(lat),
      parseFloat(lng),
      filters,
      search,
      parseInt(page),
    );
    return { success: true, data };
  }

  /**
   * GET /api/v1/restaurants/:id/menu
   */
  @Get(':id/menu')
  @ApiOperation({ summary: 'Lấy menu chi tiết của một quán ăn' })
  @ApiParam({ name: 'id', type: Number })
  async getMenu(@Param('id') id: string) {
    const data = await this.restaurantService.getMenu(parseInt(id));
    return { success: true, data };
  }

  /**
   * GET /api/v1/restaurants/merchant/:storeId/revenue-stats
   * Thống kê doanh thu thật và món bán chạy của quán
   */
  @Get('merchant/:storeId/revenue-stats')
  @ApiOperation({ summary: 'Thống kê doanh thu thật và món bán chạy của quán' })
  async getRevenueStats(
    @Param('storeId') storeId: string,
    @Query('period') period = 'today',
  ) {
    const data = await this.restaurantService.getStoreRevenueStats(parseInt(storeId, 10), period);
    return { success: true, data };
  }

  /**
   * GET /api/v1/restaurants/merchant/:storeId/reviews
   * Lấy danh sách đánh giá của quán & món ăn từ CSDL
   */
  @Get('merchant/:storeId/reviews')
  @ApiOperation({ summary: 'Lấy danh sách đánh giá quán & món ăn' })
  async getStoreReviews(
    @Param('storeId') storeId: string,
    @Query('star') star?: string,
  ) {
    const starNum = star ? parseInt(star, 10) : undefined;
    const data = await this.restaurantService.getStoreReviews(parseInt(storeId, 10), starNum);
    return { success: true, data };
  }

  /**
   * POST /api/v1/restaurants/merchant/reviews/:reviewId/reply
   * Chủ quán phản hồi đánh giá của khách
   */
  @Post('merchant/reviews/:reviewId/reply')
  @ApiOperation({ summary: 'Chủ quán phản hồi đánh giá' })
  async replyReview(
    @Param('reviewId') reviewId: string,
    @Body() body: { reply: string },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '817', 10);
    const data = await this.restaurantService.replyStoreReview(userId, parseInt(reviewId, 10), body.reply);
    return { success: true, data, message: 'Đã gửi phản hồi đánh giá' };
  }

  /**
   * POST /api/v1/restaurants/:storeId/reviews
   * Khách hàng gửi đánh giá quán & món ăn
   */
  @Post(':storeId/reviews')
  @ApiOperation({ summary: 'Khách hàng gửi đánh giá quán & món ăn' })
  async createReview(
    @Param('storeId') storeId: string,
    @Body()
    body: {
      rating: number;
      comment: string;
      dish_reviews?: any;
      images?: string[];
    },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const rawId = queryUserId || headerUserId;
    const userId = parseInt(rawId || '817', 10);
    const data = await this.restaurantService.createStoreReview(
      userId,
      parseInt(storeId, 10),
      body.rating,
      body.comment,
      body.dish_reviews,
      body.images,
    );
    return { success: true, data, message: 'Cảm ơn bạn đã gửi đánh giá!' };
  }
}

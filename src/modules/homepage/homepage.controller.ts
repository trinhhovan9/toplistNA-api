import { Controller, Get, Post, Body, Query, Param, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HomepageService } from './homepage.service';
import { HomeFeedEngineService } from './home-feed-engine.service';
import * as jwt from 'jsonwebtoken';

@ApiTags('Homepage')
@Controller('homepage')
export class HomepageController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly feedEngineService: HomeFeedEngineService,
  ) {}

  /**
   * GET /api/v1/homepage/feed?lat=18.6796&lng=105.6813
   * Dynamic Home Feed Engine: CMS Collections + Real-time Availability + Normalized Ranking + Diversity
   */
  @Get('feed')
  @ApiOperation({ summary: 'Lấy Dynamic Home Feed (CMS Collections, Availability, Normalized Ranking & Diversity)' })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  async getHomeFeed(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Headers('x-device-id') deviceId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: number | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token) as any;
        if (decoded && (decoded.id || decoded.sub)) {
          userId = Number(decoded.id || decoded.sub);
        }
      } catch (_) {}
    }

    const data = await this.feedEngineService.getHomeFeed({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      userId,
      deviceId,
    });

    return { success: true, data };
  }

  /**
   * GET /api/v1/homepage/collections/:key/items
   * "Xem tất cả" chi tiết bộ sưu tập với bộ lọc và phân trang chuẩn
   */
  @Get('collections/:key/items')
  @ApiOperation({ summary: 'Lấy danh sách phân trang món/quán thuộc bộ sưu tập cho trang Xem tất cả' })
  async getCollectionItems(
    @Param('key') key: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('search') search?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('ratingMin') ratingMin?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('feedSessionId') feedSessionId?: string,
    @Headers('x-device-id') deviceId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: number | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token) as any;
        if (decoded && (decoded.id || decoded.sub)) {
          userId = Number(decoded.id || decoded.sub);
        }
      } catch (_) {}
    }

    const res = await this.feedEngineService.getCollectionItems(key, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      sort,
      search,
      priceMin: priceMin ? parseInt(priceMin) : undefined,
      priceMax: priceMax ? parseInt(priceMax) : undefined,
      ratingMin: ratingMin ? parseFloat(ratingMin) : undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      userId,
      deviceId,
      feedSessionId,
    });

    return res;
  }

  /**
   * POST /api/v1/homepage/events
   * Ghi nhận event tracking người dùng
   */
  @Post('events')
  @ApiOperation({ summary: 'Ghi nhận tracking event (impression, click, add_to_cart, order)' })
  async logEvent(
    @Body() body: any,
    @Headers('x-device-id') deviceId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: number | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token) as any;
        if (decoded && (decoded.id || decoded.sub)) {
          userId = Number(decoded.id || decoded.sub);
        }
      } catch (_) {}
    }

    return this.feedEngineService.logEvent({
      ...body,
      userId: userId || body.userId,
      anonymousDeviceId: deviceId || body.anonymousDeviceId,
    });
  }

  /**
   * GET /api/v1/homepage/meal-suggestions?meal=breakfast&lat=18.6796&lng=105.6813&limit=15
   * Thuật toán gợi ý thực đơn theo buổi dựa trên tags, danh mục và từ khóa món
   */
  @Get('meal-suggestions')
  @ApiOperation({ summary: 'Gợi ý món ăn thông minh theo bữa dựa trên tags, danh mục và từ khóa' })
  @ApiQuery({ name: 'meal', required: false, enum: ['breakfast', 'lunch', 'afternoon', 'dinner'] })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMealSuggestions(
    @Query('meal') meal?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.homepageService.getMealSuggestions(
      meal || 'breakfast',
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      limit ? parseInt(limit) : 15,
    );
    return { success: true, data };
  }

  /**
   * GET /api/v1/homepage?lat=18.6796&lng=105.6813 (Legacy support)
   */
  @Get()
  @ApiOperation({ summary: 'Lấy dữ liệu trang chủ (services, deals, foods, rooms)' })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  async getHomepage(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const data = await this.homepageService.getHomepage(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
    return { success: true, data };
  }

  @Get('config')
  @ApiOperation({ summary: 'Lấy cấu hình tham số vận hành & giá sàn hệ thống' })
  async getSystemConfig() {
    const config = await this.homepageService.getPublicConfig();
    return {
      success: true,
      data: config,
    };
  }

  @Get('service-fee-config')
  @ApiOperation({ summary: 'Lấy cấu hình Phí Dịch Vụ & Tiện Ích kèm phụ phí khung giờ cao điểm và thời tiết thời gian thực' })
  async getServiceFeeConfig(
    @Query('food_subtotal') foodSubtotal?: string,
    @Query('subtotal') subtotalQuery?: string,
  ) {
    const rawVal = foodSubtotal || subtotalQuery;
    const subtotal = rawVal ? parseInt(rawVal, 10) || 100000 : 100000;
    const data = await this.homepageService.getServiceFeeConfig(subtotal);
    return {
      success: true,
      data,
    };
  }

  @Get('app-version')
  @ApiOperation({ summary: 'Kiểm tra phiên bản ứng dụng' })
  async getAppVersion(@Query('platform') platform?: string) {
    const data = await this.homepageService.getAppVersion(platform);
    return {
      success: true,
      data,
    };
  }
}

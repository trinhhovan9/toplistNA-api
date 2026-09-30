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

    // 1. Nếu key là meal collection theo buổi (ví dụ: meal_lunch, meal_breakfast, ...)
    const cleanMealKey = key.replace(/^meal_/, '').toLowerCase();
    if (['breakfast', 'lunch', 'afternoon', 'dinner'].includes(cleanMealKey)) {
      const userLat = lat ? parseFloat(lat) : 18.6732;
      const userLng = lng ? parseFloat(lng) : 105.6881;
      const mealData = await this.homepageService.getMealSuggestions(cleanMealKey, userLat, userLng, 60);

      let rawItems = (mealData.items || []).map((it: any) => ({
        id: it.id,
        name: it.dish_name || it.name,
        dish_name: it.dish_name || it.name,
        store_id: it.restaurant_id,
        store_name: it.restaurant_name,
        store_address: it.restaurant_address || 'TP Vinh, Nghệ An',
        store_image: it.image,
        store_rating_avg: it.rating,
        restaurant_id: it.restaurant_id,
        restaurant_name: it.restaurant_name,
        restaurant_address: it.restaurant_address || 'TP Vinh, Nghệ An',
        restaurant_image: it.image,
        price: it.price,
        original_price: it.original_price,
        discount_percent: it.discount ? parseInt(it.discount.replace(/[^0-9]/g, ''), 10) : 0,
        rating: it.rating,
        distance_km: it.distance_km || 1.2,
        delivery_time: it.delivery_time || '15-20 phút',
        image: it.image,
        image_url: it.image,
        sold_count: it.sold_count,
        sold_text: it.sold_count,
        badge: it.badge || 'Gợi ý',
        tag: it.category_name || it.tag || 'Món ngon',
        category_name: it.category_name,
        is_available: true,
        tags: it.tags || [],
      }));

      // Live search filter
      if (search && search.trim().length > 0) {
        const s = search.toLowerCase().trim();
        rawItems = rawItems.filter(
          (it: any) =>
            (it.name || '').toLowerCase().includes(s) ||
            (it.store_name || '').toLowerCase().includes(s) ||
            (it.category_name || '').toLowerCase().includes(s),
        );
      }

      // Price filter
      if (priceMax) rawItems = rawItems.filter((it: any) => it.price <= Number(priceMax));
      if (priceMin) rawItems = rawItems.filter((it: any) => it.price >= Number(priceMin));

      // Rating filter
      if (ratingMin) rawItems = rawItems.filter((it: any) => (it.rating || 0) >= Number(ratingMin));

      // Sort
      if (sort === 'discount') rawItems.sort((a: any, b: any) => (b.discount_percent || 0) - (a.discount_percent || 0));
      else if (sort === 'price_asc') rawItems.sort((a: any, b: any) => a.price - b.price);
      else if (sort === 'price_desc') rawItems.sort((a: any, b: any) => b.price - a.price);
      else if (sort === 'rating') rawItems.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
      else if (sort === 'nearby' || sort === 'nearest') rawItems.sort((a: any, b: any) => (a.distance_km || 0) - (b.distance_km || 0));
      else if (sort === 'popular') rawItems.sort((a: any, b: any) => (b.sold_count || 0) - (a.sold_count || 0));

      const pageNum = page ? parseInt(page) : 1;
      const limitNum = limit ? parseInt(limit) : 20;
      const total = rawItems.length;
      const start = (pageNum - 1) * limitNum;
      const paginatedItems = rawItems.slice(start, start + limitNum);

      return {
        success: true,
        collection: {
          title: mealData.title,
          subtitle: mealData.subtitle,
          badge: mealData.badge,
          headerColor: mealData.header_color,
          gradientColors: mealData.gradient_colors,
        },
        items: paginatedItems,
        total,
        page: pageNum,
        limit: limitNum,
        hasMore: start + limitNum < total,
      };
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

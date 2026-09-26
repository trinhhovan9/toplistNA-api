import { Controller, Get, Post, Body, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';

@ApiTags('Favorites')
@Controller()
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  /** POST /api/v1/favorites/toggle or /api/v1/user/favorites */
  @Post(['favorites/toggle', 'user/favorites', 'favorites'])
  @ApiOperation({ summary: 'Thêm hoặc xóa địa điểm yêu thích (toggle)' })
  async toggle(@Request() req: any, @Body() body: any) {
    const userId = req.user?.id ? Number(req.user.id) : (body.user_id ? Number(body.user_id) : 1);
    const favorableId = Number(body.favorable_id || body.listing_id || body.id || 0);
    const favorableType = body.favorable_type || 'listings';

    const data = await this.favoriteService.toggle(userId, favorableType, favorableId);
    return { success: true, ...data };
  }

  /** GET /api/v1/favorites/check */
  @Get('favorites/check')
  @ApiOperation({ summary: 'Kiểm tra trạng thái yêu thích' })
  async checkStatus(@Request() req: any, @Query() query: any) {
    const userId = req.user?.id ? Number(req.user.id) : (query.user_id ? Number(query.user_id) : 1);
    const favorableId = Number(query.favorable_id || query.listing_id || query.id || 0);

    const data = await this.favoriteService.checkFavorite(userId, favorableId);
    return { success: true, ...data };
  }

  /** GET /api/v1/favorites or /api/v1/user/favorites */
  @Get(['favorites', 'user/favorites'])
  @ApiOperation({ summary: 'Lấy danh sách yêu thích' })
  async getMyFavorites(@Request() req: any, @Query() query: any) {
    const userId = req.user?.id ? Number(req.user.id) : (query.user_id ? Number(query.user_id) : undefined);
    return this.favoriteService.getMyFavorites(userId);
  }
}

import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/v1/search?q=bò né&type=restaurant&page=1
   */
  @Get()
  @ApiOperation({ summary: 'Tìm kiếm toàn cục' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'type', required: false, description: 'restaurant | hotel | cafe | tourist' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async search(
    @Query('q') q = '',
    @Query('type') type?: string,
    @Query('page') page = '1',
  ) {
    const data = await this.searchService.search(q, type, parseInt(page));
    return { success: true, data };
  }

  /**
   * GET /api/v1/search/listings?categoryAlias=am-thuc&categoryId=42&tagSlug=an-vat&search=bò&page=1
   */
  @Get('listings')
  @ApiOperation({ summary: 'Lấy danh sách địa điểm theo danh mục / thẻ tag' })
  @ApiQuery({ name: 'categoryAlias', required: false })
  @ApiQuery({ name: 'categoryId', required: false, type: Number })
  @ApiQuery({ name: 'tagSlug', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getListings(
    @Query('categoryAlias') categoryAlias?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagSlug') tagSlug?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const data = await this.searchService.getListingsByCategory(
      categoryAlias,
      categoryId ? parseInt(categoryId) : undefined,
      tagSlug,
      search,
      parseInt(page),
      parseInt(limit),
    );
    return { success: true, data };
  }

  /**
   * GET /api/v1/search/listings/:idOrAlias
   */
  @Get('listings/:idOrAlias')
  @ApiOperation({ summary: 'Lấy chi tiết một địa điểm theo ID hoặc Alias' })
  async getListingDetail(@Param('idOrAlias') idOrAlias: string) {
    const data = await this.searchService.getListingDetail(idOrAlias);
    return { success: true, data };
  }
}

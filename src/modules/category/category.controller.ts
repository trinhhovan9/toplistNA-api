import { Controller, Get, Param, Query } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  async getCategories() {
    const data = await this.categoryService.getCategoriesTree();
    return { data };
  }

  @Get('merchant/food-categories')
  async getMerchantFoodCategories() {
    const data = await this.categoryService.getMerchantFoodCategories();
    return { data };
  }

  @Get('food-services')
  async getFoodServices() {
    const data = await this.categoryService.getFoodServices();
    return { data };
  }

  @Get('tags/popular')
  async getPopularTags(@Query('limit') limit?: number, @Query('q') q?: string) {
    const data = await this.categoryService.getPopularTags(limit ? Number(limit) : 40, q);
    return { data };
  }

  @Get(':alias')
  async getCategoryByAlias(@Param('alias') alias: string) {
    const data = await this.categoryService.getCategoryByAlias(alias);
    return { data };
  }
}

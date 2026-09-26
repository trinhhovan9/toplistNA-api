import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { CartService } from './cart.service';

class AddToCartDto {
  @IsInt() listing_id: number;
  @IsInt() menu_item_id: number;
  @IsInt() @Min(0) quantity: number;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** GET /api/v1/cart */
  @Get()
  @ApiOperation({ summary: 'Lấy giỏ hàng hiện tại' })
  async getCart(@Request() req) {
    const data = await this.cartService.getCart(req.user.id);
    return { success: true, data };
  }

  /** POST /api/v1/cart/add */
  @Post('add')
  @ApiOperation({ summary: 'Thêm hoặc cập nhật số lượng món trong giỏ hàng' })
  async addToCart(@Request() req, @Body() dto: AddToCartDto) {
    const data = await this.cartService.addToCart(
      req.user.id,
      dto.listing_id,
      dto.menu_item_id,
      dto.quantity,
      dto.note,
    );
    return { success: true, data };
  }
}

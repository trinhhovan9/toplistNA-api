import { Controller, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { AiService } from './ai.service';

class AiQueryDto {
  @IsNotEmpty() @IsString() question: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

class OrderAiSupportDto {
  @IsNotEmpty() order_id: string | number;
  @IsNotEmpty() @IsString() message: string;
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** POST /api/v1/ai/query */
  @Post('query')
  @ApiOperation({ summary: 'Trợ lý AI tư vấn dịch vụ tại Nghệ An' })
  async query(@Body() dto: AiQueryDto) {
    const data = await this.aiService.query(dto.question, dto.lat, dto.lng);
    return { success: true, data };
  }

  /** POST /api/v1/ai/order-support */
  @Post('order-support')
  @ApiOperation({ summary: 'Trợ lý AI tổng đài viên tư vấn và giải đáp đơn hàng' })
  async orderSupport(@Body() dto: OrderAiSupportDto) {
    const data = await this.aiService.orderSupport(dto.order_id, dto.message);
    return { success: true, data };
  }
}

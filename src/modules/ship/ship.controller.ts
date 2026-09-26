import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ShipService } from './ship.service';

class EstimateDto {
  @IsNumber() pickup_latitude: number;
  @IsNumber() pickup_longitude: number;
  @IsNumber() delivery_latitude: number;
  @IsNumber() delivery_longitude: number;
  @IsNotEmpty() @IsString() vehicle_type: string; // motorbike | truck
}

class FindDriverDto {
  @IsNotEmpty() @IsString() pickup_address: string;
  @IsNumber() pickup_latitude: number;
  @IsNumber() pickup_longitude: number;
  @IsNotEmpty() @IsString() delivery_address: string;
  @IsNumber() delivery_latitude: number;
  @IsNumber() delivery_longitude: number;
  @IsOptional() @IsString() package_type?: string;
  @IsOptional() @IsString() package_weight?: string;
  @IsNotEmpty() @IsString() recipient_name: string;
  @IsNotEmpty() @IsString() recipient_phone: string;
  @IsNotEmpty() @IsString() vehicle_type: string;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('Ship')
@Controller('ship')
export class ShipController {
  constructor(private readonly shipService: ShipService) {}

  /** POST /api/v1/ship/estimate */
  @Post('estimate')
  @ApiOperation({ summary: 'Ước tính cước phí và thời gian giao hàng' })
  async estimate(@Body() dto: EstimateDto) {
    const data = await this.shipService.estimate(
      dto.pickup_latitude,
      dto.pickup_longitude,
      dto.delivery_latitude,
      dto.delivery_longitude,
      dto.vehicle_type,
    );
    return { success: true, data };
  }

  /** POST /api/v1/ship/find-driver */
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('find-driver')
  @ApiOperation({ summary: 'Tạo đơn ship và tìm tài xế gần nhất' })
  async findDriver(@Request() req, @Body() dto: FindDriverDto) {
    const data = await this.shipService.findDriver(
      req.user.id,
      dto.pickup_address,
      dto.pickup_latitude,
      dto.pickup_longitude,
      dto.delivery_address,
      dto.delivery_latitude,
      dto.delivery_longitude,
      dto.package_type ?? 'Hàng hóa',
      dto.package_weight ?? 'Dưới 5kg',
      dto.recipient_name,
      dto.recipient_phone,
      dto.vehicle_type,
      dto.note,
    );
    return { success: true, data };
  }
}

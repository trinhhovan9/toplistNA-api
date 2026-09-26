import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { TableBookingService } from './table-booking.service';

class CreateTableBookingDto {
  @IsInt() listing_id: number;
  @IsNotEmpty() @IsString() customer_name: string;
  @IsNotEmpty() @IsString() phone_number: string;
  @IsOptional() @IsEmail() email?: string;
  @IsInt() @Min(1) guest_count: number;
  @IsNotEmpty() @IsString() reservation_date: string; // YYYY-MM-DD
  @IsNotEmpty() @IsString() reservation_time: string; // HH:mm
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('Table Booking')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('table-bookings')
export class TableBookingController {
  constructor(private readonly tableBookingService: TableBookingService) {}

  /** POST /api/v1/table-bookings */
  @Post()
  @ApiOperation({ summary: 'Đặt bàn tại nhà hàng' })
  async create(@Request() req, @Body() dto: CreateTableBookingDto) {
    const data = await this.tableBookingService.create(
      req.user.id,
      dto.listing_id,
      dto.customer_name,
      dto.phone_number,
      dto.email ?? '',
      dto.guest_count,
      dto.reservation_date,
      dto.reservation_time,
      dto.area,
      dto.note,
    );
    return { success: true, data };
  }
}

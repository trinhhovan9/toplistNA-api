import { Controller, Post, Get, Delete, Body, Param, Query, Request, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { TableBookingService } from './table-booking.service';

function extractUserIdFromRequest(req: any): number | null {
  const customHeader = req.headers?.['x-user-id'] || req.headers?.['x-userid'];
  if (customHeader && !isNaN(Number(customHeader)) && Number(customHeader) > 0) {
    return Number(customHeader);
  }
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        const id = payload.sub ?? payload.id ?? payload.userId ?? payload.user_id;
        if (id && !isNaN(Number(id))) return Number(id);
      }
    } catch (_) {}
  }
  return null;
}

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
  @IsOptional() @IsInt() user_id?: number;
}

@ApiTags('Table Booking')
@Controller('table-bookings')
export class TableBookingController {
  constructor(private readonly tableBookingService: TableBookingService) {}

  /** POST /api/v1/table-bookings */
  @Post()
  @ApiOperation({ summary: 'Đặt bàn tại nhà hàng' })
  async create(
    @Request() req: any,
    @Body() dto: CreateTableBookingDto,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const userId = dto.user_id || (headerUserId ? Number(headerUserId) : null) || extractUserIdFromRequest(req);
    const data = await this.tableBookingService.create(
      userId,
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

  /** GET /api/v1/table-bookings/my-reservations */
  @Get('my-reservations')
  @ApiOperation({ summary: 'Lấy danh sách đặt bàn của khách hàng' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'phone', required: false, type: String })
  async getMyReservations(
    @Query('userId') queryUserId?: string,
    @Query('phone') queryPhone?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Request() req?: any,
  ) {
    const rawId = queryUserId || headerUserId || extractUserIdFromRequest(req);
    const userId = rawId ? parseInt(String(rawId), 10) : undefined;
    const phone = queryPhone?.trim();
    const data = await this.tableBookingService.getMyTableBookings({ userId, phone });
    return { success: true, data };
  }

  /** DELETE /api/v1/table-bookings/:id */
  @Delete(':id')
  @ApiOperation({ summary: 'Hủy lịch đặt bàn' })
  @ApiParam({ name: 'id', type: Number })
  async cancel(@Param('id') id: string) {
    return this.tableBookingService.cancelTableBooking(parseInt(id, 10));
  }
}


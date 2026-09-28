import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsOptional, IsEmail, Min, IsNumber } from 'class-validator';
import { HotelService } from './hotel.service';

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

export class CalculatePriceDto {
  @IsInt() hotel_id: number;
  @IsInt() room_id: number;
  @IsNotEmpty() @IsString() checkin_date: string;
  @IsNotEmpty() @IsString() checkout_date: string;
  @IsOptional() @IsInt() @Min(1) number_of_rooms?: number;
  @IsOptional() @IsString() voucher_code?: string;
}

export class CreateHotelBookingDto {
  @IsInt() hotel_id: number;
  @IsInt() room_id: number;
  @IsNotEmpty() @IsString() customer_name: string;
  @IsNotEmpty() @IsString() phone_number: string;
  @IsOptional() @IsEmail() email?: string;
  @IsNotEmpty() @IsString() checkin_date: string; // YYYY-MM-DD
  @IsNotEmpty() @IsString() checkout_date: string; // YYYY-MM-DD
  @IsOptional() @IsInt() @Min(1) number_of_rooms?: number;
  @IsOptional() @IsInt() @Min(1) adults?: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsOptional() @IsString() deposit_method?: string; // full | deposit_30 | pay_at_hotel
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsInt() physical_room_id?: number;
  @IsOptional() @IsString() room_number?: string;
  @IsOptional() @IsInt() user_id?: number;
}

export class CreateRoomTypeDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() originalPrice?: number;
  @IsOptional() @IsInt() @Min(1) totalRooms?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() bedType?: string;
  @IsOptional() @IsString() amenities?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() floorAllocations?: Array<{ floorNumber: number; floorName?: string; count: number }>;
}

export class CreateFloorDto {
  @IsNotEmpty() @IsString() name: string;
  @IsOptional() @IsInt() floor_number?: number;
}

export class BatchCreateRoomsDto {
  @IsInt() floor_id: number;
  @IsInt() room_type_id: number;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsInt() start_number?: number;
  @IsOptional() custom_numbers?: string[];
}

export class UpdateRoomStatusDto {
  @IsNotEmpty() @IsString() status: string; // available | occupied | booked | cleaning | maintenance
  @IsOptional() @IsString() notes?: string;
}

export class UpdateRoomTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() originalPrice?: number;
  @IsOptional() @IsInt() @Min(1) totalRooms?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() bedType?: string;
  @IsOptional() @IsString() amenities?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() isAvailable?: boolean;
}

export class UpdateBookingStatusDto {
  @IsNotEmpty() @IsString() status: string; // confirmed | checked_in | completed | cancelled
}

@ApiTags('Hotel')
@Controller()
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  /** GET /api/v1/hotels/search?checkin=2026-08-10&checkout=2026-08-12&adults=2 */
  @Get('hotels/search')
  @ApiOperation({ summary: 'Tìm kiếm khách sạn còn phòng trống' })
  @ApiQuery({ name: 'checkin', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'checkout', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'adults', required: true, type: Number })
  @ApiQuery({ name: 'children', required: false, type: Number })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  async search(
    @Query('checkin') checkin: string,
    @Query('checkout') checkout: string,
    @Query('adults') adults = '2',
    @Query('children') children = '0',
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.hotelService.search(checkin, checkout, parseInt(adults), parseInt(children), keyword);
    return { success: true, data };
  }

  /** GET /api/v1/hotels/locations */
  @Get('hotels/locations')
  @ApiOperation({ summary: 'Lấy danh sách khu vực/huyện/thị xã có khách sạn thực tế từ Database' })
  async getLocations() {
    const data = await this.hotelService.getHotelLocations();
    return { success: true, data };
  }

  /** GET /api/v1/hotels/:hotelId/room-availability-map */
  @Get('hotels/:hotelId/room-availability-map')
  @ApiOperation({ summary: 'Sơ đồ phòng trực quan dạng ghế rạp chiếu phim (Cinema Seat Map) & Kiểm tra trùng lịch' })
  @ApiParam({ name: 'hotelId', type: Number })
  @ApiQuery({ name: 'checkin', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'checkout', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'room_type_id', required: false, type: Number })
  async getRoomAvailabilityMap(
    @Param('hotelId') hotelId: number,
    @Query('checkin') checkin: string,
    @Query('checkout') checkout: string,
    @Query('room_type_id') roomTypeId?: string,
  ) {
    const data = await this.hotelService.getRoomAvailabilityMap(
      Number(hotelId),
      checkin,
      checkout,
      roomTypeId ? Number(roomTypeId) : undefined,
    );
    return { success: true, data };
  }

  /** GET /api/v1/hotels/:hotelId */
  @Get('hotels/:hotelId')
  @ApiOperation({ summary: 'Lấy chi tiết khách sạn và danh sách hạng phòng còn trống' })
  @ApiParam({ name: 'hotelId', type: Number })
  @ApiQuery({ name: 'checkin', required: false })
  @ApiQuery({ name: 'checkout', required: false })
  async getHotelDetail(
    @Param('hotelId') hotelId: number,
    @Query('checkin') checkin?: string,
    @Query('checkout') checkout?: string,
  ) {
    const data = await this.hotelService.getHotelDetail(Number(hotelId), checkin, checkout);
    return { success: true, data };
  }

  /** POST /api/v1/hotels/calculate-price */
  @Post('hotels/calculate-price')
  @ApiOperation({ summary: 'Tính giá đặt phòng chính xác từ Backend (Snapshot & Chống đặt trùng)' })
  async calculatePrice(@Body() dto: CalculatePriceDto) {
    const data = await this.hotelService.calculatePrice({
      hotelId: dto.hotel_id,
      roomId: dto.room_id,
      checkinDate: dto.checkin_date,
      checkoutDate: dto.checkout_date,
      numberOfRooms: dto.number_of_rooms,
      discountCode: dto.voucher_code,
    });
    return { success: true, data };
  }

  /** POST /api/v1/bookings */
  @Post('bookings')
  @ApiOperation({ summary: 'Đặt phòng khách sạn kèm snapshot tài chính' })
  async createBooking(
    @Request() req: any,
    @Body() dto: CreateHotelBookingDto,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const userId = dto.user_id || (headerUserId ? Number(headerUserId) : null) || extractUserIdFromRequest(req);
    const data = await this.hotelService.createBooking(userId, {
      hotelId: dto.hotel_id,
      roomId: dto.room_id,
      customerName: dto.customer_name,
      phoneNumber: dto.phone_number,
      email: dto.email,
      checkinDate: dto.checkin_date,
      checkoutDate: dto.checkout_date,
      numberOfRooms: dto.number_of_rooms || 1,
      adults: dto.adults || 2,
      children: dto.children || 0,
      depositMethod: dto.deposit_method,
      note: dto.note,
      physicalRoomId: dto.physical_room_id,
      roomNumber: dto.room_number,
    });
    return { success: true, data, message: 'Đặt phòng thành công!' };
  }

  /** GET /api/v1/bookings/my-bookings */
  @Get('bookings/my-bookings')
  @ApiOperation({ summary: 'Lấy danh sách đơn đặt phòng của khách hàng' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'phone', required: false, type: String })
  async getMyBookings(
    @Query('userId') queryUserId?: string,
    @Query('phone') queryPhone?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Request() req?: any,
  ) {
    const rawId = queryUserId || headerUserId || extractUserIdFromRequest(req);
    const userId = rawId ? parseInt(String(rawId), 10) : undefined;
    const phone = queryPhone?.trim();
    const data = await this.hotelService.getCustomerBookings({ userId, phone });
    return { success: true, data };
  }

  /** GET /api/v1/bookings/:idOrCode */
  @Get('bookings/:idOrCode')
  @ApiOperation({ summary: 'Chi tiết phiếu đặt phòng (theo ID hoặc Mã HT...)' })
  async getBookingDetail(@Param('idOrCode') idOrCode: string) {
    const data = await this.hotelService.getBookingDetail(idOrCode);
    return { success: true, data };
  }

  /** PUT /api/v1/bookings/:idOrCode/cancel */
  @Put('bookings/:idOrCode/cancel')
  @ApiOperation({ summary: 'Hủy đơn đặt phòng của khách hàng' })
  async cancelCustomerBooking(@Param('idOrCode') idOrCode: string) {
    const data = await this.hotelService.cancelCustomerBooking(idOrCode);
    return { success: true, data, message: 'Hủy đặt phòng thành công' };
  }

  // ==========================================
  // KHU VỰC QUẢN LÝ KHÁCH SẠN (HOTEL MANAGER HUB)
  // ==========================================

  /** GET /api/v1/hotels/manager/my-hotels */
  @Get('hotels/manager/my-hotels')
  @ApiOperation({ summary: 'Lấy danh sách khách sạn thuộc quyền sở hữu của User' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  async getMyHotels(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Request() req?: any,
  ) {
    const rawId = queryUserId || headerUserId || extractUserIdFromRequest(req);
    const userId = parseInt(String(rawId || '0'), 10);
    if (!userId) {
      return { success: true, data: [] };
    }
    const data = await this.hotelService.getMyHotels(userId);
    return { success: true, data };
  }

  /** GET /api/v1/hotels/:hotelId/manager/overview */
  @Get('hotels/:hotelId/manager/overview')
  @ApiOperation({ summary: 'Dashboard tổng quan kênh quản lý khách sạn' })
  async getManagerOverview(@Param('hotelId') hotelId: number) {
    const data = await this.hotelService.getManagerOverview(Number(hotelId));
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/wallet/repay-debt */
  @Post('hotels/:hotelId/manager/wallet/repay-debt')
  @ApiOperation({ summary: 'Thanh toán nợ hoa hồng (Khách trả tại khách sạn)' })
  async repayCommissionDebt(
    @Param('hotelId') hotelId: number,
    @Body() dto: { amount: number; method?: 'balance' | 'manual'; note?: string },
  ) {
    const data = await this.hotelService.repayCommissionDebt(
      Number(hotelId),
      Number(dto.amount),
      dto.method || 'balance',
      dto.note,
    );
    return { success: true, data };
  }

  /** GET /api/v1/hotels/:hotelId/manager/rooms */
  @Get('hotels/:hotelId/manager/rooms')
  @ApiOperation({ summary: 'Danh sách các hạng phòng của khách sạn' })
  async getManagerRooms(@Param('hotelId') hotelId: number) {
    const data = await this.hotelService.getManagerRooms(Number(hotelId));
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/rooms */
  @Post('hotels/:hotelId/manager/rooms')
  @ApiOperation({ summary: 'Tạo mới hạng phòng cho khách sạn' })
  async createRoomType(@Param('hotelId') hotelId: number, @Body() dto: CreateRoomTypeDto) {
    const data = await this.hotelService.createRoomType(Number(hotelId), dto);
    return { success: true, data, message: 'Thêm loại phòng thành công' };
  }

  /** PUT /api/v1/hotels/:hotelId/manager/rooms/:roomId */
  @Put('hotels/:hotelId/manager/rooms/:roomId')
  @ApiOperation({ summary: 'Chỉnh sửa thông tin hạng phòng' })
  async updateRoomType(
    @Param('hotelId') hotelId: number,
    @Param('roomId') roomId: number,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    const data = await this.hotelService.updateRoomType(Number(hotelId), Number(roomId), dto);
    return { success: true, data, message: 'Cập nhật loại phòng thành công' };
  }

  /** DELETE /api/v1/hotels/:hotelId/manager/rooms/:roomId */
  @Delete('hotels/:hotelId/manager/rooms/:roomId')
  @ApiOperation({ summary: 'Xóa hạng phòng' })
  async deleteRoomType(@Param('hotelId') hotelId: number, @Param('roomId') roomId: number) {
    const data = await this.hotelService.deleteRoomType(Number(hotelId), Number(roomId));
    return { success: true, data, message: 'Đã xóa loại phòng' };
  }

  /** GET /api/v1/hotels/:hotelId/manager/bookings */
  @Get('hotels/:hotelId/manager/bookings')
  @ApiOperation({ summary: 'Danh sách đơn đặt phòng' })
  @ApiQuery({ name: 'status', required: false })
  async getManagerBookings(@Param('hotelId') hotelId: number, @Query('status') status?: string) {
    const data = await this.hotelService.getManagerBookings(Number(hotelId), status);
    return { success: true, data };
  }

  /** PUT /api/v1/hotels/:hotelId/manager/bookings/:bookingId/status */
  @Put('hotels/:hotelId/manager/bookings/:bookingId/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn đặt phòng' })
  async updateBookingStatus(
    @Param('hotelId') hotelId: number,
    @Param('bookingId') bookingId: number,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    const data = await this.hotelService.updateBookingStatus(
      Number(hotelId),
      Number(bookingId),
      dto.status,
    );
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/bookings/lookup-qr */
  @Post('hotels/:hotelId/manager/bookings/lookup-qr')
  @ApiOperation({ summary: 'Tra cứu thông tin đơn phòng từ mã QR/Barcode' })
  async lookupByQr(
    @Param('hotelId') hotelId: number,
    @Body() dto: { code: string },
  ) {
    const data = await this.hotelService.lookupBookingByQrCode(Number(hotelId), dto.code);
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/bookings/check-in-qr */
  @Post('hotels/:hotelId/manager/bookings/check-in-qr')
  @ApiOperation({ summary: 'Quét mã QR hoặc nhập mã để Check-in nhận phòng' })
  async checkInByQr(
    @Param('hotelId') hotelId: number,
    @Body() dto: { code: string },
  ) {
    const data = await this.hotelService.checkInByQrCode(Number(hotelId), dto.code);
    return { success: true, data };
  }

  // ==========================================
  // QUẢN LÝ TẦNG & PHÒNG VẬT LÝ (TÒA NHÀ -> TẦNG -> PHÒNG)
  // ==========================================

  /** GET /api/v1/hotels/:hotelId/manager/floors-and-rooms */
  @Get('hotels/:hotelId/manager/floors-and-rooms')
  @ApiOperation({ summary: 'Lấy sơ đồ tầng & danh sách phòng vật lý của khách sạn' })
  async getFloorsAndRooms(@Param('hotelId') hotelId: number) {
    const data = await this.hotelService.getHotelFloorsAndRooms(Number(hotelId));
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/floors */
  @Post('hotels/:hotelId/manager/floors')
  @ApiOperation({ summary: 'Thêm tầng mới cho khách sạn' })
  async createFloor(@Param('hotelId') hotelId: number, @Body() dto: CreateFloorDto) {
    const data = await this.hotelService.createFloor(Number(hotelId), dto.name, dto.floor_number);
    return { success: true, data, message: 'Thêm tầng thành công' };
  }

  /** DELETE /api/v1/hotels/:hotelId/manager/floors/:floorId */
  @Delete('hotels/:hotelId/manager/floors/:floorId')
  @ApiOperation({ summary: 'Xóa tầng' })
  async deleteFloor(@Param('hotelId') hotelId: number, @Param('floorId') floorId: number) {
    const data = await this.hotelService.deleteFloor(Number(hotelId), Number(floorId));
    return { success: true, data };
  }

  /** POST /api/v1/hotels/:hotelId/manager/physical-rooms/batch */
  @Post('hotels/:hotelId/manager/physical-rooms/batch')
  @ApiOperation({ summary: 'Tạo phòng vật lý hàng loạt cho tầng' })
  async batchCreateRooms(@Param('hotelId') hotelId: number, @Body() dto: BatchCreateRoomsDto) {
    const data = await this.hotelService.createPhysicalRoomsBatch(Number(hotelId), {
      floorId: dto.floor_id,
      roomTypeId: dto.room_type_id,
      quantity: dto.quantity,
      startNumber: dto.start_number,
      customNumbers: dto.custom_numbers,
    });
    return { success: true, data };
  }

  /** PUT /api/v1/hotels/:hotelId/manager/physical-rooms/:roomId/status */
  @Put('hotels/:hotelId/manager/physical-rooms/:roomId/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái phòng vật lý (Trống, Đang ở, Đã đặt, Bảo trì, Đang dọn)' })
  async updatePhysicalRoomStatus(
    @Param('hotelId') hotelId: number,
    @Param('roomId') roomId: number,
    @Body() dto: UpdateRoomStatusDto,
  ) {
    const data = await this.hotelService.updatePhysicalRoomStatus(
      Number(hotelId),
      Number(roomId),
      dto.status,
      dto.notes,
    );
    return { success: true, data };
  }

  /** DELETE /api/v1/hotels/:hotelId/manager/physical-rooms/:roomId */
  @Delete('hotels/:hotelId/manager/physical-rooms/:roomId')
  @ApiOperation({ summary: 'Xóa phòng vật lý' })
  async deletePhysicalRoom(@Param('hotelId') hotelId: number, @Param('roomId') roomId: number) {
    const data = await this.hotelService.deletePhysicalRoom(Number(hotelId), Number(roomId));
    return { success: true, data };
  }
}

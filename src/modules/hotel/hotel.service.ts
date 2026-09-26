import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, In } from 'typeorm';
import { Listing } from '../../entities/listing.entity';
import { HotelRoom } from '../../entities/hotel-room.entity';
import { HotelReservation } from '../../entities/hotel-reservation.entity';
import { HotelFloor } from '../../entities/hotel-floor.entity';
import { HotelPhysicalRoom } from '../../entities/hotel-physical-room.entity';
import { StoreWalletService } from '../store-wallet/store-wallet.service';
import { NotificationService } from '../notification/notification.service';
import { FcmService } from '../notification/fcm.service';
import { OrderGateway } from '../order/order.gateway';

const defaultHotelPhotos = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1551882547-ff40c0d5bf8f?auto=format&fit=crop&w=800&q=80',
];

function formatImageUrl(thumb: any, mediaPath?: string | null, hotelId?: number): string {
  if (mediaPath && mediaPath.length > 0) {
    if (mediaPath.startsWith('http')) return mediaPath;
    return `https://toplistnghean.vn/storage/${mediaPath}`;
  }
  if (thumb) {
    const thumbStr = String(thumb);
    if (thumbStr.startsWith('http')) return thumbStr;
    if (thumbStr.includes('.')) return `https://toplistnghean.vn/storage/${thumbStr}`;
  }
  const idx = Math.abs(hotelId || 0) % defaultHotelPhotos.length;
  return defaultHotelPhotos[idx];
}

export interface CalculatePriceDto {
  hotelId: number;
  roomId: number;
  checkinDate: string; // YYYY-MM-DD
  checkoutDate: string; // YYYY-MM-DD
  numberOfRooms?: number;
  discountCode?: string;
}

export interface CreateHotelBookingDto {
  hotelId: number;
  roomId: number;
  customerName: string;
  phoneNumber: string;
  email?: string;
  checkinDate: string;
  checkoutDate: string;
  numberOfRooms?: number;
  adults?: number;
  children?: number;
  depositMethod?: string; // full | deposit_30 | pay_at_hotel
  note?: string;
  physicalRoomId?: number;
  roomNumber?: string;
}

@Injectable()
export class HotelService {
  private readonly logger = new Logger(HotelService.name);

  constructor(
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(HotelRoom) private readonly hotelRoomRepo: Repository<HotelRoom>,
    @InjectRepository(HotelReservation) private readonly reservationRepo: Repository<HotelReservation>,
    @InjectRepository(HotelFloor) private readonly floorRepo: Repository<HotelFloor>,
    @InjectRepository(HotelPhysicalRoom) private readonly physicalRoomRepo: Repository<HotelPhysicalRoom>,
    private readonly storeWalletService: StoreWalletService,
    private readonly notificationService: NotificationService,
    private readonly fcmService: FcmService,
    @Inject(forwardRef(() => OrderGateway))
    private readonly orderGateway: OrderGateway,
  ) {}

  /**
   * Tính số lượng phòng còn trống trong khoảng ngày [checkin, checkout)
   */
  async getAvailableRoomsCount(roomId: number, totalRooms: number, checkinDate: string, checkoutDate: string): Promise<number> {
    const bookedResult = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.room_type = :roomId', { roomId })
      .andWhere("r.status NOT IN ('cancelled', 'rejected')")
      .andWhere('r.checkin_date < :checkoutDate AND r.checkout_date > :checkinDate', {
        checkinDate,
        checkoutDate,
      })
      .select('SUM(COALESCE(r.number_of_rooms, 1))', 'totalBooked')
      .getRawOne();

    const bookedCount = parseInt(bookedResult?.totalBooked || '0', 10);
    return Math.max(0, (totalRooms || 5) - bookedCount);
  }

  /**
   * Tìm kiếm khách sạn theo ngày nhận/trả và số khách
   */
  async search(checkin: string, checkout: string, adults: number, children = 0, keyword?: string) {
    const rawAll = await this.listingRepo.query(`
      SELECT 
        l.id AS id, 
        l.name AS name, 
        l.address AS address, 
        l.type AS type, 
        l.thumb AS thumb, 
        l.rating_avg AS rating_avg, 
        l.description AS description, 
        l.ward_id AS ward_id,
        w.name AS ward_name,
        w.type AS ward_type,
        m.path AS media_path 
      FROM listings l 
      LEFT JOIN wards w ON l.ward_id = w.id
      LEFT JOIN media m ON CAST(l.thumb AS UNSIGNED) = m.id 
      WHERE l.deleted_at IS NULL
    `);

    const rawHotels = rawAll.filter((l) => {
      const t = (l.type || '').toLowerCase();
      const n = (l.name || '').toLowerCase();
      return (
        t === 'hotel' ||
        t === 'accommodation' ||
        t === 'luu-tru' ||
        t === 'homestay' ||
        t === 'resort' ||
        t === 'villa' ||
        n.includes('khách sạn') ||
        n.includes('hotel') ||
        n.includes('homestay')
      );
    });

    // Collect media IDs from all rooms to resolve at once
    const allRoomMediaIds: (string | number)[] = [];
    for (const h of rawHotels) {
      const hRooms = await this.hotelRoomRepo.find({
        where: { listingId: Number(h.id), isAvailable: true },
      });
      for (const r of hRooms) {
        if (r.imageUrl) allRoomMediaIds.push(r.imageUrl);
      }
    }
    const roomMediaMap = await this.resolveMediaUrls(allRoomMediaIds);

    const formattedHotels = await Promise.all(
      rawHotels.map(async (hotel) => {
        const hId = Number(hotel.id);
        const rooms = await this.hotelRoomRepo.find({
          where: { listingId: hId, isAvailable: true },
        });

        const imgUrl = formatImageUrl(hotel.thumb, hotel.media_path, hId);
        const availableRoomsList: any[] = [];

        for (const room of rooms) {
          const capacity = room.capacity ?? 2;
          if (capacity < (adults + children)) continue;

          const availableCount = await this.getAvailableRoomsCount(
            room.id,
            room.totalRooms || 5,
            checkin,
            checkout,
          );

          if (availableCount > 0) {
            const resolvedRoomImg = (room.imageUrl ? roomMediaMap.get(String(room.imageUrl)) : null) || imgUrl;
            availableRoomsList.push({
              room_id: room.id,
              room_name: room.name,
              price_per_night: room.price || 550000,
              original_price: room.originalPrice || (room.price ? Math.round(room.price * 1.2) : 650000),
              capacity: room.capacity || 2,
              bed_type: room.bedType || '1 giường đôi',
              total_rooms: room.totalRooms || 5,
              available_rooms: availableCount,
              amenities: room.amenities ? room.amenities.split(',').map((s) => s.trim()) : ['Wifi', 'Điều hoà', 'Ăn sáng'],
              image: resolvedRoomImg,
              description: room.description || 'Phòng nghỉ đầy đủ tiện nghi, sạch sẽ thoáng mát.',
            });
          }
        }

        const minPrice = availableRoomsList.length > 0
          ? Math.min(...availableRoomsList.map((r) => r.price_per_night))
          : 550000;

        const rawRating = hotel.rating_avg;
        const rating = rawRating ? Number(rawRating) : 4.8;
        const wardFullName = hotel.ward_name ? `${hotel.ward_type ? hotel.ward_type + ' ' : ''}${hotel.ward_name}`.trim() : '';

        return {
          hotel_id: hId,
          name: hotel.name,
          address: hotel.address || 'Nghệ An',
          ward_id: hotel.ward_id ? Number(hotel.ward_id) : null,
          ward_name: wardFullName,
          image: imgUrl,
          rating_avg: Number(rating.toFixed(1)),
          price_from: minPrice,
          available_rooms: availableRoomsList,
          brief: hotel.description ? hotel.description.substring(0, 120) : 'Khách sạn vị trí đẹp, tiện nghi cao cấp, dịch vụ chu đáo.',
          verified: true,
        };
      }),
    );

    if (keyword && keyword.trim()) {
      const q = keyword.trim().toLowerCase();
      return formattedHotels.filter((hotel) => {
        const matchName = (hotel.name || '').toLowerCase().includes(q);
        const matchAddress = (hotel.address || '').toLowerCase().includes(q);
        const matchWard = (hotel.ward_name || '').toLowerCase().includes(q);
        const matchBrief = (hotel.brief || '').toLowerCase().includes(q);
        const matchRoom = (hotel.available_rooms || []).some((r: any) =>
          (r.room_name || '').toLowerCase().includes(q) ||
          (r.bed_type || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.amenities || []).some((a: string) => a.toLowerCase().includes(q))
        );
        return matchName || matchAddress || matchWard || matchBrief || matchRoom;
      });
    }

    return formattedHotels;
  }

  /**
   * Lấy danh sách toàn bộ các khu vực xã / phường hiện nay từ Database (130 xã/phường của Nghệ An)
   */
  async getHotelLocations() {
    const raw = await this.listingRepo.query(`
      SELECT 
        w.id AS ward_id,
        w.name AS ward_name,
        w.type AS ward_type,
        w.iorder AS iorder,
        COUNT(l.id) AS hotel_count
      FROM wards w
      LEFT JOIN listings l ON l.ward_id = w.id 
        AND l.deleted_at IS NULL
        AND (l.type IN ('hotel', 'accommodation', 'luu-tru', 'homestay', 'resort', 'villa') OR l.name LIKE '%khách sạn%' OR l.name LIKE '%hotel%')
      WHERE w.province_id = 17
      GROUP BY w.id, w.name, w.type, w.iorder
      ORDER BY w.iorder ASC, w.id ASC
    `);

    const totalRaw = await this.listingRepo.query(`
      SELECT COUNT(l.id) AS total_count
      FROM listings l
      WHERE (l.type IN ('hotel', 'accommodation', 'luu-tru', 'homestay', 'resort', 'villa') OR l.name LIKE '%khách sạn%' OR l.name LIKE '%hotel%')
        AND l.deleted_at IS NULL
    `);
    const totalCount = parseInt(totalRaw[0]?.total_count || '0', 10);

    return {
      totalHotels: totalCount,
      locations: [
        {
          id: 0,
          name: 'Tất cả Nghệ An',
          ward_name: 'Tất cả Nghệ An',
          desc: 'Toàn bộ tỉnh Nghệ An',
          count: totalCount,
        },
        ...raw.map((r: any) => {
          const typeStr = r.ward_type ? `${r.ward_type} ` : '';
          const fullName = `${typeStr}${r.ward_name}`.trim();
          const hotelCount = Number(r.hotel_count || 0);
          return {
            id: Number(r.ward_id),
            name: fullName,
            ward_name: r.ward_name,
            ward_type: r.ward_type,
            desc: `${fullName}, Nghệ An`,
            count: hotelCount,
          };
        }),
      ],
    };
  }

  /**
   * Sơ đồ phòng theo tầng & Kiểm tra trùng lịch đặt phòng
   * Kiểm tra chính xác từng phòng vật lý trong khoảng ngày [checkin, checkout)
   */
  async getRoomAvailabilityMap(hotelId: number, checkin: string, checkout: string, roomTypeId?: number) {
    await this.autoUnlockExpiredBookings(hotelId);

    const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Khách sạn không tồn tại');

    // 1. Lấy danh sách hạng phòng
    const roomTypes = await this.hotelRoomRepo.find({
      where: { listingId: hotelId, isAvailable: true },
    });
    const roomTypeMap = new Map<number, HotelRoom>();
    roomTypes.forEach((rt) => roomTypeMap.set(rt.id, rt));

    // 2. Lấy danh sách tầng
    let floors = await this.floorRepo.find({
      where: { listingId: hotelId },
      order: { floorNumber: 'ASC', id: 'ASC' },
    });

    // 3. Lấy danh sách phòng vật lý
    let physicalRooms = await this.physicalRoomRepo.find({
      where: { listingId: hotelId },
      order: { floorId: 'ASC', roomNumber: 'ASC' },
    });

    // Nếu khách sạn chưa khởi tạo tầng & phòng vật lý, tự động sinh chuẩn hóa
    if (floors.length === 0 || physicalRooms.length === 0) {
      if (floors.length === 0) {
        const floor1 = await this.floorRepo.save(this.floorRepo.create({ listingId: hotelId, floorNumber: 1, name: 'Tầng 1' }));
        const floor2 = await this.floorRepo.save(this.floorRepo.create({ listingId: hotelId, floorNumber: 2, name: 'Tầng 2' }));
        const floor3 = await this.floorRepo.save(this.floorRepo.create({ listingId: hotelId, floorNumber: 3, name: 'Tầng 3' }));
        floors = [floor1, floor2, floor3];
      }

      if (physicalRooms.length === 0 && roomTypes.length > 0) {
        const defaultRoomType = roomTypes[0];
        const newRooms: HotelPhysicalRoom[] = [];
        floors.forEach((f) => {
          const fn = f.floorNumber || 1;
          for (let i = 1; i <= 4; i++) {
            const rNum = `${fn * 100 + i}`;
            const targetRt = roomTypes[(i - 1) % roomTypes.length] || defaultRoomType;
            newRooms.push(
              this.physicalRoomRepo.create({
                listingId: hotelId,
                floorId: f.id,
                roomTypeId: targetRt.id,
                roomNumber: rNum,
                status: 'available',
                cleanStatus: 'clean',
              }),
            );
          }
        });
        physicalRooms = await this.physicalRoomRepo.save(newRooms);
      }
    }

    // 4. Lấy TẤT CẢ đơn đặt phòng trùng lịch [checkin, checkout)
    // Điều kiện trùng lịch: r.checkinDate < checkoutDate AND r.checkoutDate > checkinDate
    const overlappingReservations = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.listingId = :hotelId', { hotelId })
      .andWhere("r.status NOT IN ('cancelled', 'rejected')")
      .andWhere('r.checkinDate < :checkoutDate AND r.checkoutDate > :checkinDate', {
        checkinDate: checkin,
        checkoutDate: checkout,
      })
      .getMany();

    const bookedRoomIds = new Map<number, HotelReservation>();
    const bookedRoomNumbers = new Map<string, HotelReservation>();
    const genericBookingsByRoomType = new Map<number, number>();

    for (const r of overlappingReservations) {
      if (r.physicalRoomId) {
        bookedRoomIds.set(Number(r.physicalRoomId), r);
      }
      if (r.roomNumber) {
        const nums = String(r.roomNumber).split(',').map((s) => s.trim()).filter(Boolean);
        for (const num of nums) {
          bookedRoomNumbers.set(num, r);
        }
      }
      if (!r.physicalRoomId && !r.roomNumber && r.roomType) {
        const count = genericBookingsByRoomType.get(Number(r.roomType)) || 0;
        genericBookingsByRoomType.set(Number(r.roomType), count + (r.numberOfRooms || 1));
      }
    }

    const remainingGenericBooked = new Map<number, number>(genericBookingsByRoomType);

    // 5. Xây dựng Sơ đồ theo Tầng
    const floorMap = new Map<number, any>();
    floors.forEach((f) => {
      floorMap.set(f.id, {
        floor_id: f.id,
        floor_number: f.floorNumber,
        name: f.name,
        rooms: [],
      });
    });

    let totalPhysical = 0;
    let availableCount = 0;
    let bookedCount = 0;
    let maintenanceCount = 0;

    for (const pRoom of physicalRooms) {
      const rt = roomTypeMap.get(pRoom.roomTypeId);

      totalPhysical++;
      let isAvailable = true;
      let conflictReason: string | null = null;
      let effectiveStatus = pRoom.status || 'available';

      const matchedRes = bookedRoomIds.get(pRoom.id) || bookedRoomNumbers.get(pRoom.roomNumber);
      if (matchedRes) {
        isAvailable = false;
        effectiveStatus = 'booked';
        const inDate = matchedRes.checkinDate ? new Date(matchedRes.checkinDate).toLocaleDateString('vi-VN') : '';
        const outDate = matchedRes.checkoutDate ? new Date(matchedRes.checkoutDate).toLocaleDateString('vi-VN') : '';
        conflictReason = `Đã có khách đặt trùng ngày (${inDate} - ${outDate})`;
        bookedCount++;
      } else if (pRoom.status === 'occupied') {
        isAvailable = false;
        effectiveStatus = 'occupied';
        conflictReason = 'Phòng đang có khách ở';
        bookedCount++;
      } else if (pRoom.status === 'maintenance') {
        isAvailable = false;
        effectiveStatus = 'maintenance';
        conflictReason = 'Phòng đang bảo trì sửa chữa';
        maintenanceCount++;
      } else {
        const genericCount = remainingGenericBooked.get(pRoom.roomTypeId) || 0;
        if (genericCount > 0) {
          isAvailable = false;
          effectiveStatus = 'booked';
          conflictReason = 'Đã có khách giữ chỗ hạng phòng này';
          remainingGenericBooked.set(pRoom.roomTypeId, genericCount - 1);
          bookedCount++;
        } else {
          isAvailable = true;
          effectiveStatus = 'available';
          availableCount++;
        }
      }

      const roomData = {
        id: pRoom.id,
        room_number: pRoom.roomNumber,
        floor_id: pRoom.floorId,
        room_type_id: pRoom.roomTypeId,
        room_type_name: rt?.name || 'Phòng tiêu chuẩn',
        price_per_night: rt?.price || 550000,
        original_price: rt?.originalPrice || (rt?.price ? Math.round(rt.price * 1.2) : 650000),
        capacity: rt?.capacity || 2,
        bed_type: rt?.bedType || '1 giường đôi',
        amenities: rt?.amenities ? rt.amenities.split(',').map((s) => s.trim()) : ['Wifi', 'Điều hòa'],
        image: rt?.imageUrl || null,
        status: effectiveStatus,
        is_available: isAvailable,
        conflict_reason: conflictReason,
        notes: pRoom.notes,
      };

      const targetFloor = floorMap.get(pRoom.floorId);
      if (targetFloor) {
        targetFloor.rooms.push(roomData);
      }
    }

    const checkinDateObj = new Date(checkin);
    const checkoutDateObj = new Date(checkout);
    const nights = Math.max(1, Math.round((checkoutDateObj.getTime() - checkinDateObj.getTime()) / (1000 * 3600 * 24)));

    return {
      hotel_id: hotelId,
      hotel_name: hotel.name,
      checkin,
      checkout,
      nights,
      floors: Array.from(floorMap.values()),
      room_types: roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        price: rt.price,
        capacity: rt.capacity,
        bed_type: rt.bedType,
        total_rooms: rt.totalRooms,
      })),
      stats: {
        total_rooms: totalPhysical,
        available_rooms: availableCount,
        booked_rooms: bookedCount,
        maintenance_rooms: maintenanceCount,
      },
    };
  }

  /**
   * Phân giải ID media thành URL ảnh thực tế trên máy chủ Toplist Nghệ An
   */
  async resolveMediaUrls(idsOrPaths: (string | number | null | undefined)[]): Promise<Map<string, string>> {
    const resultMap = new Map<string, string>();
    const numericIds: number[] = [];

    for (const item of idsOrPaths) {
      if (item === null || item === undefined) continue;
      const str = String(item).trim();
      if (!str) continue;

      if (str.startsWith('http://') || str.startsWith('https://')) {
        resultMap.set(str, str);
      } else if (str.startsWith('media/') || (str.includes('.') && !/^\d+$/.test(str))) {
        resultMap.set(str, `https://toplistnghean.vn/storage/${str}`);
      } else if (/^\d+$/.test(str)) {
        numericIds.push(Number(str));
      }
    }

    if (numericIds.length > 0) {
      try {
        const uniqueIds = Array.from(new Set(numericIds));
        const mediaRows = await this.listingRepo.query(
          `SELECT id, path FROM media WHERE id IN (${uniqueIds.join(',')})`,
        );
        for (const row of mediaRows) {
          if (row.path) {
            const url = row.path.startsWith('http')
              ? row.path
              : `https://toplistnghean.vn/storage/${row.path}`;
            resultMap.set(String(row.id), url);
          }
        }
      } catch (err) {
        this.logger.error(`Error resolving media URLs: ${err.message}`);
      }
    }

    return resultMap;
  }

  /**
   * Lấy chi tiết khách sạn kèm danh sách hạng phòng và tình trạng phòng trống
   */
  async getHotelDetail(hotelId: number, checkin?: string, checkout?: string) {
    const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Không tìm thấy khách sạn #${hotelId}`);
    }

    const rooms = await this.hotelRoomRepo.find({
      where: { listingId: hotelId, isAvailable: true },
      order: { price: 'ASC' },
    });

    const defaultCheckin = checkin || new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultCheckout = checkout || tomorrow.toISOString().split('T')[0];

    // Thu thập tất cả các ID ảnh để phân giải 1 lần duy nhất từ bảng media
    const mediaCandidates: (string | number)[] = [];
    if (hotel.thumb) mediaCandidates.push(hotel.thumb);

    let parsedHotelImages: (string | number)[] = [];
    if (hotel.images) {
      try {
        const parsed = typeof hotel.images === 'string' ? JSON.parse(hotel.images) : hotel.images;
        if (Array.isArray(parsed)) {
          parsedHotelImages = parsed;
          mediaCandidates.push(...parsed);
        }
      } catch (_) {}
    }

    for (const r of rooms) {
      if (r.imageUrl) mediaCandidates.push(r.imageUrl);
    }

    const mediaUrlMap = await this.resolveMediaUrls(mediaCandidates);

    // Ảnh đại diện chính thức của khách sạn
    const hotelMainImage =
      mediaUrlMap.get(String(hotel.thumb)) ||
      formatImageUrl(hotel.thumb, null, hotelId);

    // Bộ sưu tập album ảnh khách sạn
    const resolvedGallery = parsedHotelImages
      .map((id) => mediaUrlMap.get(String(id)))
      .filter((url): url is string => Boolean(url));

    const finalHotelImages = [
      hotelMainImage,
      ...resolvedGallery.filter((url) => url !== hotelMainImage),
    ];
    if (finalHotelImages.length === 0) {
      finalHotelImages.push(defaultHotelPhotos[0]);
    }

    const formattedRooms = await Promise.all(
      rooms.map(async (room) => {
        const availableCount = await this.getAvailableRoomsCount(
          room.id,
          room.totalRooms || 5,
          defaultCheckin,
          defaultCheckout,
        );

        const roomImgUrl =
          (room.imageUrl ? mediaUrlMap.get(String(room.imageUrl)) : null) ||
          hotelMainImage;

        return {
          id: room.id,
          name: room.name,
          price: room.price || 550000,
          originalPrice: room.originalPrice || (room.price ? Math.round(room.price * 1.2) : 650000),
          capacity: room.capacity || 2,
          bedType: room.bedType || '1 giường đôi',
          totalRooms: room.totalRooms || 5,
          availableRooms: availableCount,
          isAvailable: availableCount > 0,
          amenities: room.amenities ? room.amenities.split(',').map((s) => s.trim()) : ['Wifi', 'Điều hoà', 'Ăn sáng', 'View biển'],
          imageUrl: roomImgUrl,
          description: room.description || 'Phòng tiêu chuẩn ấm cúng, đầy đủ tiện nghi, view thoáng mát.',
        };
      }),
    );

    return {
      hotel: {
        id: hotel.id,
        name: hotel.name,
        address: hotel.address || '59 Đặng Thái Thuyến, P. Cửa Lò, Nghệ An',
        phone: hotel.phone || '0987654321',
        rating: 4.8,
        reviewsCount: 320,
        description: hotel.description || 'Khách sạn tiêu chuẩn nằm ngay vị trí trung tâm du lịch Cửa Lò, chỉ cách bãi biển vài phút đi bộ. Đầy đủ tiện nghi hiện đại, bãi đỗ xe rộng rãi, nhân viên thân thiện và nhiệt tình phục vụ 24/7.',
        amenities: [
          'Wifi tốc độ cao',
          'Điều hoà nhiệt độ',
          'Bãi đỗ xe ô tô miễn phí',
          'Thang máy tốc độ cao',
          'Lễ tân 24/7',
          'Dọn phòng hàng ngày',
          'Nhà hàng ăn sáng buffet',
          'Hỗ trợ đặt tour & xe',
        ],
        policies: {
          checkInTime: '14:00',
          checkOutTime: '12:00',
          cancellation: 'Miễn phí hủy phòng trước 24 giờ nhận phòng.',
          idRequirement: 'Vui lòng xuất trình CCCD hoặc hộ chiếu khi làm thủ tục nhận phòng.',
        },
        images: finalHotelImages,
      },
      checkinDate: defaultCheckin,
      checkoutDate: defaultCheckout,
      rooms: formattedRooms,
    };
  }

  /**
   * Tính toán báo giá chính xác và kiểm tra phòng còn (Strict Backend Pricing)
   */
  async calculatePrice(dto: CalculatePriceDto) {
    const room = await this.hotelRoomRepo.findOne({
      where: { id: dto.roomId, listingId: dto.hotelId },
    });
    if (!room) {
      throw new NotFoundException(`Không tìm thấy hạng phòng #${dto.roomId}`);
    }

    const checkin = new Date(dto.checkinDate);
    const checkout = new Date(dto.checkoutDate);
    if (isNaN(checkin.getTime()) || isNaN(checkout.getTime())) {
      throw new BadRequestException('Ngày nhận/trả phòng không hợp lệ (YYYY-MM-DD)');
    }
    if (checkin >= checkout) {
      throw new BadRequestException('Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm');
    }

    const diffDays = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
    const numberOfNights = Math.max(1, diffDays);
    const numberOfRooms = Math.max(1, dto.numberOfRooms || 1);

    // Kiểm tra số lượng phòng còn trống
    const availableRooms = await this.getAvailableRoomsCount(
      room.id,
      room.totalRooms || 5,
      dto.checkinDate,
      dto.checkoutDate,
    );

    const isAvailable = availableRooms >= numberOfRooms;

    const roomPrice = Number(room.price || 550000);
    const grossAmount = roomPrice * numberOfNights * numberOfRooms;
    const discountAmount = 0; // Áp dụng voucher nếu có
    const commissionRate = await this.getEffectiveHotelCommissionRate(dto.hotelId);
    const commissionAmount = Math.round(((grossAmount - discountAmount) * commissionRate) / 100);
    const customerPayable = grossAmount - discountAmount;
    const hotelNetAmount = grossAmount - discountAmount - commissionAmount;

    // Các mức cọc nếu khách chọn cọc
    const deposit30 = Math.round(customerPayable * 0.3);

    return {
      hotelId: dto.hotelId,
      roomId: dto.roomId,
      roomName: room.name,
      checkinDate: dto.checkinDate,
      checkoutDate: dto.checkoutDate,
      numberOfNights,
      numberOfRooms,
      roomPrice,
      grossAmount,
      discountAmount,
      commissionRate,
      commissionAmount,
      customerPayable,
      hotelNetAmount,
      depositOptions: {
        full: customerPayable,
        deposit30: deposit30,
        payAtHotel: customerPayable,
      },
      availableRooms,
      isAvailable,
      financialBreakdown: {
        roomGross: grossAmount,
        discount: discountAmount,
        commissionRate,
        commissionAmount,
        customerPayable,
        hotelNetAmount,
        numberOfNights,
        numberOfRooms,
        roomPrice,
      },
    };
  }

  /**
   * Đặt phòng khách sạn (Snapshot giá & Ngăn ngừa Overbooking)
   */
  async createBooking(userId: number | null, dto: CreateHotelBookingDto) {
    const hotel = await this.listingRepo.findOne({ where: { id: dto.hotelId } });
    if (!hotel) throw new NotFoundException('Khách sạn không tồn tại');

    const room = await this.hotelRoomRepo.findOne({
      where: { id: dto.roomId, listingId: dto.hotelId },
    });
    if (!room) throw new NotFoundException('Hạng phòng không tồn tại');

    const numberOfRooms = Math.max(1, dto.numberOfRooms || 1);

    // 1. Kiểm tra tình trạng phòng trống (Chống đặt trùng phòng / Overbooking)
    const availableRooms = await this.getAvailableRoomsCount(
      room.id,
      room.totalRooms || 5,
      dto.checkinDate,
      dto.checkoutDate,
    );

    if (availableRooms < numberOfRooms) {
      throw new BadRequestException(
        `Rất tiếc! Hạng phòng "${room.name}" chỉ còn ${availableRooms} phòng trống trong khoảng thời gian từ ${dto.checkinDate} đến ${dto.checkoutDate}. Vui lòng chọn số lượng hoặc ngày khác.`,
      );
    }

    // 1b. Kiểm tra trùng phòng vật lý cụ thể (hỗ trợ chọn 1 hoặc nhiều phòng)
    if (dto.roomNumber) {
      const roomNums = dto.roomNumber.split(',').map((s) => s.trim()).filter(Boolean);
      for (const rNum of roomNums) {
        const conflict = await this.reservationRepo
          .createQueryBuilder('r')
          .where('r.listingId = :hotelId', { hotelId: dto.hotelId })
          .andWhere("r.status NOT IN ('cancelled', 'rejected')")
          .andWhere('r.checkinDate < :checkoutDate AND r.checkoutDate > :checkinDate', {
            checkinDate: dto.checkinDate,
            checkoutDate: dto.checkoutDate,
          })
          .andWhere('r.roomNumber LIKE :rNum', { rNum: `%${rNum}%` })
          .getOne();

        if (conflict) {
          throw new BadRequestException(
            `Rất tiếc! Phòng ${rNum} đã có người đặt trong khoảng ngày từ ${dto.checkinDate} đến ${dto.checkoutDate}. Vui lòng chọn phòng khác!`,
          );
        }
      }
    } else if (dto.physicalRoomId) {
      const conflict = await this.reservationRepo
        .createQueryBuilder('r')
        .where('r.listingId = :hotelId', { hotelId: dto.hotelId })
        .andWhere("r.status NOT IN ('cancelled', 'rejected')")
        .andWhere('r.checkinDate < :checkoutDate AND r.checkoutDate > :checkinDate', {
          checkinDate: dto.checkinDate,
          checkoutDate: dto.checkoutDate,
        })
        .andWhere('r.physicalRoomId = :physId', { physId: dto.physicalRoomId })
        .getOne();

      if (conflict) {
        throw new BadRequestException(
          `Rất tiếc! Phòng này đã có người đặt trong khoảng ngày từ ${dto.checkinDate} đến ${dto.checkoutDate}. Vui lòng chọn phòng khác!`,
        );
      }
    }

    // 2. Tính toán tài chính do backend quyết định (Snapshotting)
    const priceCalculation = await this.calculatePrice({
      hotelId: dto.hotelId,
      roomId: dto.roomId,
      checkinDate: dto.checkinDate,
      checkoutDate: dto.checkoutDate,
      numberOfRooms,
    });

    const bookingCode = `HT${Date.now().toString().slice(-6)}`;
    const depositMethod = dto.depositMethod || 'pay_at_hotel';
    let depositPercentage = 0;
    let depositAmount = 0;

    if (depositMethod === 'deposit_30') {
      depositPercentage = 30;
      depositAmount = Math.round((priceCalculation.customerPayable * 30) / 100);
    } else if (depositMethod === 'full') {
      depositPercentage = 100;
      depositAmount = priceCalculation.customerPayable;
    }

    // 3. Lưu trữ đơn đặt phòng với Financial Snapshot bất biến
    const reservation = this.reservationRepo.create({
      bookingCode,
      listingId: dto.hotelId,
      userId: userId ? Number(userId) : null as any,
      customerName: dto.customerName,
      phoneNumber: dto.phoneNumber,
      email: dto.email || '',
      checkinDate: new Date(dto.checkinDate) as any,
      checkoutDate: new Date(dto.checkoutDate) as any,
      checkinTime: '14:00',
      numberOfNights: priceCalculation.numberOfNights,
      numberOfRooms,
      adults: dto.adults || 2,
      children: dto.children || 0,
      roomType: room.id,
      physicalRoomId: dto.physicalRoomId,
      roomNumber: dto.roomNumber,
      roomPrice: priceCalculation.roomPrice,
      grossAmount: priceCalculation.grossAmount,
      discountAmount: priceCalculation.discountAmount,
      commissionRate: priceCalculation.commissionRate,
      commissionAmount: priceCalculation.commissionAmount,
      customerPayable: priceCalculation.customerPayable,
      hotelNetAmount: priceCalculation.hotelNetAmount,
      financialBreakdown: JSON.stringify(priceCalculation.financialBreakdown),
      depositMethod,
      depositPercentage,
      depositAmount,
      totalPrice: priceCalculation.customerPayable,
      notes: dto.note,
      status: 'pending',
      paymentStatus: depositMethod === 'pay_at_hotel' ? 'unpaid' : 'paid',
      createdAt: new Date(),
    });

    const saved = await this.reservationRepo.save(reservation);
    this.logger.log(`[HotelBooking] 🏨 Booking created #${bookingCode} (PENDING) for Hotel #${dto.hotelId}. Customer: ${dto.customerName}`);

    // 4. Quyết toán tài chính: Ghi nhận doanh thu thuần của khách sạn vào Ví Chờ đối soát (Hotel Wallet)
    try {
      await this.storeWalletService.settleHotelBookingRevenue(saved);
    } catch (err) {
      this.logger.error(`[HotelBooking] ⚠️ Wallet settlement error for #${bookingCode}: ${err.message}`);
    }

    // 5. Gửi thông báo Push đến Khách sạn (Rung + Chuông Khẩn Cấp)
    try {
      const hotelOwnerId = (hotel as any).userId || (hotel as any).user_id || 817;
      const roomInfoStr = saved.roomNumber ? ` (Phòng: ${saved.roomNumber})` : '';
      const notifTitle = `🛎️ ĐẶT PHÒNG MỚI #${bookingCode}`;
      const notifBody = `Khách ${dto.customerName} (${dto.phoneNumber}) vừa đặt ${numberOfRooms} phòng [${room.name}${roomInfoStr}]. Nhận: ${dto.checkinDate} → Trả: ${dto.checkoutDate}. Tổng: ${priceCalculation.customerPayable.toLocaleString('vi-VN')}đ.`;

      await this.notificationService.createNotification({
        userId: hotelOwnerId,
        title: notifTitle,
        message: notifBody,
        type: 'App\\Notifications\\HotelBookingNotification',
        data: {
          type: 'hotel:booking_new',
          bookingId: saved.id,
          bookingCode,
          hotelId: dto.hotelId,
          isOrderAlert: 'true',
        },
      });

      await this.fcmService.sendToUser(
        hotelOwnerId,
        notifTitle,
        notifBody,
        {
          type: 'hotel:booking_new',
          isOrderAlert: 'true',
          bookingId: saved.id,
          bookingCode,
          hotelId: dto.hotelId,
        },
        'default',
      );
    } catch (e: any) {
      this.logger.warn(`[HotelBooking] Failed to push to hotel owner: ${e.message}`);
    }

    // 6. Gửi thông báo Push xác nhận đến Khách hàng
    if (userId) {
      try {
        const custTitle = `🏨 Đặt phòng thành công #${bookingCode}`;
        const custBody = `Đơn đặt phòng tại ${hotel.name} đã được gửi thành công và đang chờ khách sạn xác nhận.`;

        await this.notificationService.createNotification({
          userId: Number(userId),
          title: custTitle,
          message: custBody,
          type: 'App\\Notifications\\HotelBookingNotification',
          data: {
            type: 'hotel:booking_customer',
            bookingId: saved.id,
            bookingCode,
            hotelId: dto.hotelId,
          },
        });

        await this.fcmService.sendToUser(
          Number(userId),
          custTitle,
          custBody,
          {
            type: 'hotel:booking_customer',
            bookingId: saved.id,
            bookingCode,
            hotelId: dto.hotelId,
          },
        );
      } catch (e: any) {
        this.logger.warn(`[HotelBooking] Failed to push to customer: ${e.message}`);
      }
    }

    // 7. Phát sự kiện WebSocket tức thì cho App Khách Sạn & Khách hàng
    try {
      this.orderGateway.emitNewHotelBooking({
        ...saved,
        bookingCode,
        hotelName: hotel.name,
        roomName: room.name,
        customerName: dto.customerName,
        customerPhone: dto.phoneNumber,
        numberOfRooms,
        payable: priceCalculation.customerPayable,
        isOrderAlert: 'true',
      });
    } catch (e: any) {
      this.logger.warn(`[HotelBooking] Failed to emit websocket: ${e.message}`);
    }

    return {
      id: saved.id,
      bookingCode: saved.bookingCode,
      hotelName: hotel.name,
      hotelAddress: hotel.address,
      roomName: room.name,
      physicalRoomId: saved.physicalRoomId,
      roomNumber: saved.roomNumber,
      checkinDate: dto.checkinDate,
      checkoutDate: dto.checkoutDate,
      numberOfNights: priceCalculation.numberOfNights,
      numberOfRooms,
      roomPrice: priceCalculation.roomPrice,
      grossAmount: priceCalculation.grossAmount,
      commissionRate: priceCalculation.commissionRate,
      commissionAmount: priceCalculation.commissionAmount,
      customerPayable: priceCalculation.customerPayable,
      hotelNetAmount: priceCalculation.hotelNetAmount,
      depositMethod,
      depositAmount,
      status: saved.status,
      paymentStatus: saved.paymentStatus,
    };
  }

  /**
   * Danh sách đơn đặt phòng của khách hàng (theo userId hoặc số điện thoại)
   */
  async getCustomerBookings(filter: { userId?: number; phone?: string }) {
    const qb = this.reservationRepo.createQueryBuilder('r')
      .orderBy('r.id', 'DESC');

    const conditions: string[] = [];
    const params: any = {};

    if (filter.userId) {
      conditions.push('r.user_id = :userId');
      params.userId = filter.userId;
    }
    if (filter.phone) {
      conditions.push('r.phone_number = :phone');
      params.phone = filter.phone;
    }

    if (conditions.length === 0) {
      return [];
    }

    qb.where(`(${conditions.join(' OR ')})`, params);

    const bookings = await qb.getMany();
    if (!bookings.length) return [];

    const hotelIds = Array.from(new Set(bookings.map((b) => Number(b.listingId)).filter(Boolean)));
    const roomIds = Array.from(new Set(bookings.map((b) => Number(b.roomType)).filter(Boolean)));

    let hotelMap = new Map<number, Listing>();
    if (hotelIds.length > 0) {
      const hotels = await this.listingRepo.find({ where: { id: In(hotelIds) } });
      hotelMap = new Map(hotels.map((h) => [Number(h.id), h]));
    }

    let roomMap = new Map<number, HotelRoom>();
    if (roomIds.length > 0) {
      const rooms = await this.hotelRoomRepo.find({ where: { id: In(roomIds) } });
      roomMap = new Map(rooms.map((r) => [Number(r.id), r]));
    }

    return bookings.map((b) => {
      const hotel = hotelMap.get(Number(b.listingId));
      const room = roomMap.get(Number(b.roomType));
      return this._formatBookingResponse(b, hotel, room);
    });
  }

  /**
   * Lấy chi tiết đơn đặt phòng theo ID hoặc mã đặt phòng HT...
   */
  async getBookingDetail(idOrCode: string | number) {
    const qb = this.reservationRepo.createQueryBuilder('r');
    const isNum = !isNaN(Number(idOrCode)) && String(idOrCode).trim() !== '';
    if (isNum) {
      qb.where('r.id = :id OR r.booking_code = :code', { id: Number(idOrCode), code: String(idOrCode).trim() });
    } else {
      qb.where('r.booking_code = :code', { code: String(idOrCode).trim() });
    }

    const b = await qb.getOne();
    if (!b) throw new NotFoundException('Không tìm thấy đơn đặt phòng');

    const hotel = b.listingId ? await this.listingRepo.findOne({ where: { id: b.listingId } }) : null;
    const room = b.roomType ? await this.hotelRoomRepo.findOne({ where: { id: b.roomType } }) : null;

    return this._formatBookingResponse(b, hotel, room);
  }

  /**
   * Hủy đơn đặt phòng từ phía khách hàng
   */
  async cancelCustomerBooking(idOrCode: string | number) {
    const qb = this.reservationRepo.createQueryBuilder('r');
    const isNum = !isNaN(Number(idOrCode)) && String(idOrCode).trim() !== '';
    if (isNum) {
      qb.where('r.id = :id OR r.booking_code = :code', { id: Number(idOrCode), code: String(idOrCode).trim() });
    } else {
      qb.where('r.booking_code = :code', { code: String(idOrCode).trim() });
    }

    const b = await qb.getOne();
    if (!b) throw new NotFoundException('Không tìm thấy đơn đặt phòng');

    b.status = 'cancelled';
    const saved = await this.reservationRepo.save(b);
    this.logger.log(`[HotelBooking] Khách hàng đã hủy đơn #${b.bookingCode || b.id}`);
    return { id: saved.id, status: saved.status };
  }

  private _formatBookingResponse(b: HotelReservation, hotel?: Listing | null, room?: HotelRoom | null) {
    const formatDate = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val.includes('T') ? val.split('T')[0] : val;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      return String(val);
    };

    return {
      id: Number(b.id),
      bookingCode: b.bookingCode || `HT${b.id}`,
      hotelId: b.listingId ? Number(b.listingId) : null,
      hotelName: hotel?.name || 'Khách sạn Toplist',
      hotelAddress: hotel?.address || 'Nghệ An, Việt Nam',
      hotelPhone: hotel?.phone || '02383528999',
      hotelThumb: hotel?.thumb,
      roomType: b.roomType ? Number(b.roomType) : null,
      roomName: room?.name || (b.roomNumber ? `Phòng ${b.roomNumber}` : 'Phòng tiêu chuẩn'),
      roomNumber: b.roomNumber,
      physicalRoomId: b.physicalRoomId,
      customerName: b.customerName,
      phoneNumber: b.phoneNumber,
      email: b.email,
      checkinDate: formatDate(b.checkinDate),
      checkoutDate: formatDate(b.checkoutDate),
      numberOfNights: b.numberOfNights || 1,
      numberOfRooms: b.numberOfRooms || 1,
      adults: b.adults || 1,
      children: b.children || 0,
      roomPrice: Number(b.roomPrice || 0),
      grossAmount: Number(b.grossAmount || 0),
      commissionRate: Number(b.commissionRate || 15),
      commissionAmount: Number(b.commissionAmount || 0),
      customerPayable: Number(b.customerPayable || b.totalPrice || 0),
      hotelNetAmount: Number(b.hotelNetAmount || 0),
      depositMethod: b.depositMethod || 'pay_at_hotel',
      depositAmount: Number(b.depositAmount || 0),
      totalPrice: Number(b.customerPayable || b.totalPrice || 0),
      notes: b.notes,
      status: b.status || 'confirmed',
      paymentStatus: b.paymentStatus || 'pending',
      createdAt: b.createdAt,
    };
  }

  // ==========================================
  // KHU VỰC QUẢN LÝ KHÁCH SẠN (HOTEL MANAGER HUB)
  // ==========================================

  /**
   * Lấy danh sách các khách sạn do User làm chủ/quản lý
   */
  async getMyHotels(userId: number) {
    if (!userId) return [];
    const hotels = await this.listingRepo.find({
      where: {
        ownerUserId: userId,
        type: In(['accommodation', 'hotel']),
      },
      order: { id: 'ASC' },
    });

    return hotels.map((h) => {
      return {
        id: Number(h.id),
        name: h.name,
        address: h.address || 'Nghệ An',
        phone: h.phone || '0988 123 456',
        rating: h.ratingAvg ? Number(h.ratingAvg) : 4.8,
        image: formatImageUrl(h.thumb, null, Number(h.id)),
      };
    });
  }

  /**
   * Kiểm tra quyền quản lý khách sạn của user
   */
  async verifyHotelManagerPermission(userId: number, hotelId: number) {
    if (!userId) {
      throw new BadRequestException('Bạn cần đăng nhập để thực hiện quản lý khách sạn!');
    }
    const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Không tìm thấy khách sạn #${hotelId}!`);
    }
    if (Number(hotel.ownerUserId) !== Number(userId) && userId !== 817 && userId !== 1) {
      throw new BadRequestException('Bạn không có quyền quản lý khách sạn này!');
    }
    return hotel;
  }

  /**
   * Lấy tỷ lệ hoa hồng / phí sàn khách sạn được cấu hình từ Admin (hoặc cấu hình riêng cho từng khách sạn)
   */
  async getEffectiveHotelCommissionRate(hotelId?: number): Promise<number> {
    let rate = 15; // default fallback
    try {
      // 1. Kiểm tra cấu hình toàn hệ thống từ admin trong bảng options
      const opt = await this.listingRepo.manager.query(
        "SELECT option_value FROM options WHERE option_name = 'system_operational_config' LIMIT 1"
      );
      if (opt && opt[0]?.option_value) {
        const parsed = JSON.parse(opt[0].option_value);
        if (parsed.hotel_commission_rate !== undefined) {
          rate = Number(parsed.hotel_commission_rate);
        }
      }

      // 2. Nếu khách sạn có cấu hình riêng trong json_params, ưu tiên cấu hình riêng
      if (hotelId) {
        const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
        if (hotel && hotel.jsonParams) {
          let p: any = hotel.jsonParams;
          if (typeof p === 'string') {
            try { p = JSON.parse(p); } catch (_) {}
          }
          if (p && typeof p === 'object' && (p.commission_rate !== undefined || p.hotel_commission_rate !== undefined)) {
            const customRate = Number(p.commission_rate ?? p.hotel_commission_rate);
            if (!isNaN(customRate) && customRate >= 0 && customRate <= 50) {
              rate = customRate;
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to resolve hotel commission rate: ${e}`);
    }
    return rate;
  }

  /**
   * Lấy tổng quan quản lý khách sạn (Dashboard thống kê)
   */
  async getManagerOverview(hotelId: number) {
    const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Không tìm thấy khách sạn');

    const rooms = await this.hotelRoomRepo.find({ where: { listingId: hotelId } });
    const totalRoomInventory = rooms.reduce((sum, r) => sum + (r.totalRooms || 0), 0);

    const bookings = await this.reservationRepo.find({
      where: { listingId: hotelId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const totalRevenue = bookings
      .filter((b) => b.status === 'completed' || b.status === 'confirmed')
      .reduce((sum, b) => sum + (b.hotelNetAmount || 0), 0);

    const commissionRate = await this.getEffectiveHotelCommissionRate(hotelId);
    const wallet = await this.storeWalletService.getOrCreateWallet(hotelId);

    return {
      hotel: {
        id: hotel.id,
        name: hotel.name,
        address: hotel.address,
        phone: hotel.phone,
        commissionRate,
      },
      stats: {
        totalRoomTypes: rooms.length,
        totalRoomInventory,
        totalBookings: bookings.length,
        totalRevenue,
        commissionRate,
      },
      wallet: {
        balance: wallet.balance,
        pendingBalance: wallet.pendingBalance || 0,
        heldBalance: wallet.heldBalance,
        debtBalance: wallet.debtBalance || 0,
        bankName: wallet.bankName,
        bankAccountNumber: wallet.bankAccountNumber,
        bankAccountHolder: wallet.bankAccountHolder,
      },
      recentBookings: bookings.slice(0, 5),
    };
  }

  /**
   * Thanh toán nộp công nợ hoa hồng Property Collect
   */
  async repayCommissionDebt(hotelId: number, amount: number, method: 'balance' | 'manual' = 'balance', note?: string) {
    return this.storeWalletService.repayHotelCommissionDebt(hotelId, amount, method, note);
  }

  /**
   * Quản lý phòng: Lấy danh sách hạng phòng của khách sạn
   */
  async getManagerRooms(hotelId: number) {
    const rooms = await this.hotelRoomRepo.find({
      where: { listingId: hotelId },
      order: { createdAt: 'DESC' },
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const detailedRooms = await Promise.all(
      rooms.map(async (room) => {
        const availableToday = await this.getAvailableRoomsCount(
          room.id,
          room.totalRooms || 5,
          todayStr,
          tomorrowStr,
        );

        return {
          id: room.id,
          name: room.name,
          price: room.price || 550000,
          originalPrice: room.originalPrice || 650000,
          totalRooms: room.totalRooms || 5,
          availableRooms: availableToday,
          capacity: room.capacity || 2,
          bedType: room.bedType || '1 giường đôi',
          amenities: room.amenities || 'Wifi,Điều hoà,Ăn sáng,View biển',
          description: room.description || '',
          imageUrl: room.imageUrl || '',
          isAvailable: room.isAvailable,
        };
      }),
    );

    return detailedRooms;
  }

  /**
   * Tạo mới hạng phòng (Thêm loại phòng kèm tự động phân bổ tầng & sinh phòng vật lý)
   */
  async createRoomType(hotelId: number, dto: any) {
    let totalRoomsCalculated = Number(dto.totalRooms || 5);
    const allocations: Array<{ floorNumber: number; floorName?: string; count: number }> =
      Array.isArray(dto.floorAllocations) ? dto.floorAllocations : [];

    if (allocations.length > 0) {
      totalRoomsCalculated = allocations.reduce(
        (sum, a) => sum + Math.max(0, Number(a.count || 0)),
        0,
      );
    }

    const room = this.hotelRoomRepo.create({
      listingId: hotelId,
      name: dto.name,
      price: Number(dto.price || 550000),
      originalPrice: dto.originalPrice ? Number(dto.originalPrice) : undefined,
      totalRooms: totalRoomsCalculated,
      capacity: Number(dto.capacity || 2),
      bedType: dto.bedType || '1 giường đôi',
      amenities: dto.amenities || 'Wifi,Điều hoà,Ăn sáng',
      description: dto.description || '',
      imageUrl: dto.imageUrl || '',
      isAvailable: dto.isAvailable !== false,
    } as Partial<HotelRoom>);

    const saved = await this.hotelRoomRepo.save(room);
    this.logger.log(`[HotelManager] ➕ Created room type #${saved.id} "${saved.name}" for Hotel #${hotelId}`);

    // Tự động sinh phòng vật lý theo phân bổ tầng (nếu có)
    if (allocations.length > 0) {
      for (const alloc of allocations) {
        const fNum = Number(alloc.floorNumber || 1);
        const count = Math.max(0, Number(alloc.count || 0));
        if (count === 0) continue;

        // Tìm hoặc tạo tầng
        let floor = await this.floorRepo.findOne({
          where: { listingId: hotelId, floorNumber: fNum },
        });
        if (!floor) {
          floor = await this.floorRepo.save(
            this.floorRepo.create({
              listingId: hotelId,
              floorNumber: fNum,
              name: alloc.floorName || `Tầng ${fNum}`,
            }),
          );
        }

        // Lấy danh sách số phòng hiện tại trên tầng để tính số bắt đầu
        const existingRooms = await this.physicalRoomRepo.find({
          where: { listingId: hotelId, floorId: floor.id },
        });
        const existingNumbers = new Set(existingRooms.map((r) => r.roomNumber));

        // Sinh phòng: bắt đầu từ fNum * 100 + 1 (ví dụ 101, 102...)
        let createdForThisFloor = 0;
        let candidateNumber = fNum * 100 + 1;

        while (createdForThisFloor < count) {
          const roomNumStr = candidateNumber.toString();
          if (!existingNumbers.has(roomNumStr)) {
            const pRoom = this.physicalRoomRepo.create({
              listingId: hotelId,
              floorId: floor.id,
              roomTypeId: saved.id,
              roomNumber: roomNumStr,
              status: 'available',
              cleanStatus: 'clean',
            });
            await this.physicalRoomRepo.save(pRoom);
            existingNumbers.add(roomNumStr);
            createdForThisFloor++;
          }
          candidateNumber++;
        }
      }
    }

    return saved;
  }

  /**
   * Sửa hạng phòng (Cập nhật giá, số lượng, tiện ích)
   */
  async updateRoomType(hotelId: number, roomId: number, dto: any) {
    const room = await this.hotelRoomRepo.findOne({
      where: { id: roomId, listingId: hotelId },
    });
    if (!room) throw new NotFoundException('Không tìm thấy hạng phòng');

    if (dto.name !== undefined) room.name = dto.name;
    if (dto.price !== undefined) room.price = Number(dto.price);
    if (dto.originalPrice !== undefined) room.originalPrice = Number(dto.originalPrice);
    if (dto.totalRooms !== undefined) room.totalRooms = Number(dto.totalRooms);
    if (dto.capacity !== undefined) room.capacity = Number(dto.capacity);
    if (dto.bedType !== undefined) room.bedType = dto.bedType;
    if (dto.amenities !== undefined) room.amenities = dto.amenities;
    if (dto.description !== undefined) room.description = dto.description;
    if (dto.imageUrl !== undefined) room.imageUrl = dto.imageUrl;
    if (dto.isAvailable !== undefined) room.isAvailable = Boolean(dto.isAvailable);

    const saved = await this.hotelRoomRepo.save(room);
    this.logger.log(`[HotelManager] ✏️ Updated room type #${saved.id} for Hotel #${hotelId}`);
    return saved;
  }

  /**
   * Xóa hạng phòng
   */
  async deleteRoomType(hotelId: number, roomId: number) {
    const room = await this.hotelRoomRepo.findOne({
      where: { id: roomId, listingId: hotelId },
    });
    if (!room) throw new NotFoundException('Không tìm thấy hạng phòng');

    await this.hotelRoomRepo.remove(room);
    this.logger.log(`[HotelManager] 🗑️ Deleted room type #${roomId} for Hotel #${hotelId}`);
    return { success: true, message: 'Đã xóa hạng phòng thành công' };
  }

  /**
   * Tự động mở khóa các phòng và hoàn tất đơn lưu trú đã hết ngày
   */
  async autoUnlockExpiredBookings(hotelId: number) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const expiredBookings = await this.reservationRepo
        .createQueryBuilder('r')
        .where('r.listing_id = :hotelId', { hotelId })
        .andWhere("r.status = 'checked_in'")
        .andWhere('r.checkout_date < :todayStr', { todayStr })
        .getMany();

      for (const b of expiredBookings) {
        await this.updateBookingStatus(hotelId, b.id, 'completed');
      }
    } catch (e: any) {
      this.logger.warn(`autoUnlockExpiredBookings error: ${e.message}`);
    }
  }

  /**
   * Danh sách đơn đặt phòng của khách sạn
   */
  async getManagerBookings(hotelId: number, status?: string) {
    await this.autoUnlockExpiredBookings(hotelId);

    const qb = this.reservationRepo
      .createQueryBuilder('r')
      .where('r.listing_id = :hotelId', { hotelId })
      .orderBy('r.id', 'DESC');

    if (status && status !== 'all') {
      qb.andWhere('r.status = :status', { status });
    }

    const bookings = await qb.getMany();
    const roomIds = Array.from(new Set(bookings.map((b) => b.roomType).filter(Boolean)));
    let roomMap = new Map<number, HotelRoom>();
    if (roomIds.length > 0) {
      const rooms = await this.hotelRoomRepo.find({ where: { id: In(roomIds) } });
      roomMap = new Map(rooms.map((r) => [Number(r.id), r]));
    }

    return bookings.map((b) => {
      const room = roomMap.get(Number(b.roomType));
      const isExpired = b.status === 'checked_in' && b.checkoutDate
        ? new Date(b.checkoutDate) <= new Date()
        : false;

      return {
        id: b.id,
        bookingCode: b.bookingCode || `HT${b.id}`,
        customerName: b.customerName,
        phoneNumber: b.phoneNumber,
        email: b.email,
        roomName: room?.name || `Phòng #${b.roomType}`,
        roomNumber: b.roomNumber,
        physicalRoomId: b.physicalRoomId,
        checkinDate: b.checkinDate,
        checkoutDate: b.checkoutDate,
        numberOfNights: b.numberOfNights || 1,
        numberOfRooms: b.numberOfRooms || 1,
        roomPrice: b.roomPrice,
        grossAmount: b.grossAmount,
        commissionRate: b.commissionRate,
        commissionAmount: b.commissionAmount,
        customerPayable: b.customerPayable,
        hotelNetAmount: b.hotelNetAmount,
        depositMethod: b.depositMethod,
        depositAmount: b.depositAmount,
        status: b.status,
        paymentStatus: b.paymentStatus,
        notes: b.notes,
        isExpired,
        createdAt: b.createdAt,
      };
    });
  }

  /**
   * Cập nhật trạng thái đơn đặt phòng (Xác nhận, Check-in, Hoàn tất, Hủy)
   */
  async updateBookingStatus(hotelId: number, bookingId: number, status: string) {
    const booking = await this.reservationRepo.findOne({
      where: { id: bookingId, listingId: hotelId },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy đơn đặt phòng');

    booking.status = status;
    const saved = await this.reservationRepo.save(booking);

    // Cập nhật trạng thái phòng vật lý đồng bộ (hỗ trợ cả 1 hoặc nhiều phòng đặt cùng lúc)
    const targetRoomNumbers: string[] = [];
    if (booking.roomNumber) {
      targetRoomNumbers.push(...String(booking.roomNumber).split(',').map((s) => s.trim()).filter(Boolean));
    }

    if (status === 'checked_in') {
      if (booking.physicalRoomId) {
        await this.physicalRoomRepo.update({ id: booking.physicalRoomId }, { status: 'occupied' });
      }
      for (const rNum of targetRoomNumbers) {
        await this.physicalRoomRepo.update(
          { listingId: hotelId, roomNumber: rNum },
          { status: 'occupied' },
        );
      }
    } else if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
      if (booking.physicalRoomId) {
        await this.physicalRoomRepo.update({ id: booking.physicalRoomId }, { status: 'available' });
      }
      for (const rNum of targetRoomNumbers) {
        await this.physicalRoomRepo.update(
          { listingId: hotelId, roomNumber: rNum },
          { status: 'available' },
        );
      }
    }

    if (status === 'completed') {
      // Đảm bảo đối soát ví nếu chưa cộng
      await this.storeWalletService.settleHotelBookingRevenue(saved);
    }

    // Bắn Push Notification báo cho khách hàng khi khách sạn xác nhận hoặc cập nhật
    if (booking.userId) {
      try {
        const hotel = await this.listingRepo.findOne({ where: { id: hotelId } });
        let notifTitle = '';
        let notifBody = '';

        if (status === 'confirmed' || status === 'accepted') {
          notifTitle = `✅ Khách sạn đã xác nhận đặt phòng #${booking.bookingCode || booking.id}`;
          notifBody = `Khách sạn ${hotel?.name || 'Toplist'} đã xác nhận đơn phòng của bạn${saved.roomNumber ? ' (' + saved.roomNumber + ')' : ''}. Chúc bạn có kỳ nghỉ tuyệt vời!`;
        } else if (status === 'checked_in') {
          notifTitle = `🏨 Nhận phòng thành công #${booking.bookingCode || booking.id}`;
          notifBody = `Chào mừng bạn đến với ${hotel?.name || 'Khách sạn'}! Phòng của bạn là ${saved.roomNumber || ''}. Chúc bạn có kỳ nghỉ thật tuyệt vời!`;
        } else if (status === 'cancelled' || status === 'rejected') {
          notifTitle = `❌ Đơn đặt phòng #${booking.bookingCode || booking.id} đã bị hủy`;
          notifBody = `Đơn đặt phòng tại ${hotel?.name || 'Khách sạn'} đã bị từ chối/hủy. Vui lòng liên hệ khách sạn để biết thêm chi tiết.`;
        } else if (status === 'completed') {
          notifTitle = `🎉 Kỳ nghỉ hoàn tất #${booking.bookingCode || booking.id}`;
          notifBody = `Cảm ơn bạn đã lưu trú tại ${hotel?.name || 'Khách sạn'}. Hãy để lại đánh giá trải nghiệm nhé!`;
        }

        if (notifTitle) {
          await this.notificationService.createNotification({
            userId: Number(booking.userId),
            title: notifTitle,
            message: notifBody,
            type: 'App\\Notifications\\HotelBookingNotification',
            data: {
              type: 'hotel:booking_status_updated',
              bookingId: saved.id,
              bookingCode: booking.bookingCode,
              hotelId,
              status,
            },
          });

          await this.fcmService.sendToUser(
            Number(booking.userId),
            notifTitle,
            notifBody,
            {
              type: 'hotel:booking_status_updated',
              bookingId: saved.id,
              bookingCode: booking.bookingCode,
              hotelId,
              status,
            },
          );
        }
      } catch (e: any) {
        this.logger.warn(`[HotelBooking] Failed to push status update to customer: ${e.message}`);
      }
    }

    // Phát sự kiện WebSocket tức thì cập nhật trạng thái đơn đặt phòng
    try {
      this.orderGateway.emitHotelBookingStatusUpdate({
        bookingId: saved.id,
        bookingCode: booking.bookingCode,
        status,
        hotelId,
        userId: booking.userId,
      });
    } catch (e: any) {
      this.logger.warn(`[HotelBooking] Failed to emit websocket status: ${e.message}`);
    }

    return {
      success: true,
      message: `Cập nhật trạng thái đơn #${booking.bookingCode || booking.id} thành "${status}" thành công`,
      booking: saved,
    };
  }

  /**
   * Helper chuẩn hóa mã đơn từ mọi nguồn: Barcode Code-128, QR URL, JSON, v.v.
   */
  parseCleanBookingCode(rawCode: string): string {
    if (!rawCode) return '';
    let code = String(rawCode).trim();

    // 1. Nếu là URL: https://.../?code=HT123 hoặc https://.../booking/HT123
    try {
      if (code.includes('http://') || code.includes('https://')) {
        const url = new URL(code);
        const qCode = url.searchParams.get('code') || url.searchParams.get('bookingCode') || url.searchParams.get('id');
        if (qCode) {
          code = qCode;
        } else {
          const segments = url.pathname.split('/').filter(Boolean);
          if (segments.length > 0) code = segments[segments.length - 1];
        }
      }
    } catch (_) {}

    // 2. Nếu là chuỗi JSON: {"bookingCode": "HT123"}
    if (code.includes('{') && code.includes('}')) {
      try {
        const parsed = JSON.parse(code);
        code = parsed.bookingCode || parsed.code || parsed.id || code;
      } catch (_) {}
    }

    // 3. Nếu chuỗi chứa mẫu HT\d+ (ví dụ "MÃ ĐƠN: #HT708524" hay "Phiếu #HT708524")
    const htMatch = code.match(/HT\d+/i);
    if (htMatch) {
      return htMatch[0].toUpperCase();
    }

    // 4. Nếu chứa chuỗi 6 chữ số liên tiếp (đuôi mã HT)
    const num6Match = code.match(/\b\d{6}\b/);
    if (num6Match) {
      return num6Match[0];
    }

    // 5. Chuẩn hóa: loại bỏ khoảng trắng, dấu ngoặc kép, dấu #
    return String(code).trim().replace(/^#+/, '').toUpperCase();
  }

  /**
   * Tìm đơn đặt phòng từ mã bất kỳ, hỗ trợ mọi trường hợp thẻ/mã
   */
  async findBookingByCodeOrId(hotelId: number, rawCode: string) {
    const cleanCode = this.parseCleanBookingCode(rawCode);
    if (!cleanCode) {
      throw new BadRequestException('Mã đơn không hợp lệ hoặc để trống');
    }

    // Phân tích xem có phải ID dạng số không (ví dụ "390" hoặc "HT390" hoặc 6 số cuối "708524")
    let potentialId: number | null = null;
    let codeSuffix: string | null = null;
    if (!isNaN(Number(cleanCode))) {
      potentialId = Number(cleanCode);
      if (cleanCode.length === 6) codeSuffix = cleanCode;
    } else if (cleanCode.startsWith('HT') && !isNaN(Number(cleanCode.substring(2)))) {
      const numPart = cleanCode.substring(2);
      potentialId = Number(numPart);
      codeSuffix = numPart;
    }

    // 1. Tìm đơn thuộc khách sạn này trước
    const qb = this.reservationRepo.createQueryBuilder('r')
      .where('r.listing_id = :hotelId', { hotelId });

    const conditions: string[] = [
      'UPPER(r.booking_code) = :code',
      'UPPER(r.booking_code) = :codeHash',
      'UPPER(r.booking_code) = :codeHt',
    ];
    const params: any = {
      code: cleanCode,
      codeHash: '#' + cleanCode,
      codeHt: cleanCode.startsWith('HT') ? cleanCode : 'HT' + cleanCode,
      hotelId,
    };

    if (potentialId !== null) {
      conditions.push('r.id = :potentialId');
      params.potentialId = potentialId;
    }
    if (codeSuffix !== null) {
      conditions.push('r.booking_code LIKE :likeSuffix');
      params.likeSuffix = `%${codeSuffix}`;
    }

    qb.andWhere(`(${conditions.join(' OR ')})`, params);
    let booking = await qb.getOne();

    // 2. Nếu vẫn không thấy, thử tìm partial match trong khách sạn này
    if (!booking) {
      const qbLoose = this.reservationRepo.createQueryBuilder('r')
        .where('r.listing_id = :hotelId', { hotelId })
        .andWhere('(UPPER(r.booking_code) LIKE :likeCode OR UPPER(r.customer_name) LIKE :likeCode)', {
          likeCode: `%${cleanCode}%`,
        });
      booking = await qbLoose.getOne();
    }

    // 3. Nếu không tìm thấy ở khách sạn này, kiểm tra xem có ở khách sạn nào khác không
    if (!booking) {
      const otherQb = this.reservationRepo.createQueryBuilder('r');
      const otherConditions: string[] = [
        'UPPER(r.booking_code) = :code',
        'UPPER(r.booking_code) = :codeHash',
        'UPPER(r.booking_code) = :codeHt',
      ];
      if (potentialId !== null) otherConditions.push('r.id = :potentialId');
      if (codeSuffix !== null) otherConditions.push('r.booking_code LIKE :likeSuffix');

      otherQb.where(`(${otherConditions.join(' OR ')})`, params);
      const otherBooking = await otherQb.getOne();
      if (otherBooking) {
        const otherHotel = await this.listingRepo.findOne({ where: { id: otherBooking.listingId } });
        throw new BadRequestException(
          `Đơn phòng #${otherBooking.bookingCode || otherBooking.id} thuộc về "${otherHotel?.name || 'Khách sạn khác'}", không thuộc khách sạn đang quản lý.`
        );
      }

      throw new NotFoundException(`Không tìm thấy đơn đặt phòng với mã "${rawCode}". Vui lòng kiểm tra lại thẻ hoặc phiếu của khách.`);
    }

    return booking;
  }

  /**
   * Tra cứu thông tin chi tiết đơn đặt phòng từ mã Barcode/QR
   */
  async lookupBookingByQrCode(hotelId: number, rawCode: string) {
    const booking = await this.findBookingByCodeOrId(hotelId, rawCode);

    // Lấy tên hạng phòng từ hotelRoomRepo nếu có
    let roomName = 'Phòng tiêu chuẩn';
    if (booking.roomType) {
      const room = await this.hotelRoomRepo.findOne({ where: { id: Number(booking.roomType) } });
      if (room?.name) roomName = room.name;
    }

    // Tính toán thông tin hiển thị rõ ràng cho Lễ tân
    const payable = Number(booking.customerPayable || booking.totalPrice || 0);
    const commRate = Number(booking.commissionRate || 15);
    const commission = Number(booking.commissionAmount || Math.round(payable * commRate / 100));
    const isPropertyCollect = booking.depositMethod === 'pay_at_hotel';

    return {
      id: booking.id,
      bookingCode: booking.bookingCode || `HT${booking.id}`,
      customerName: booking.customerName || 'Khách hàng',
      phoneNumber: booking.phoneNumber || '',
      roomName,
      roomNumber: booking.roomNumber,
      physicalRoomId: booking.physicalRoomId,
      numberOfRooms: booking.numberOfRooms || 1,
      numberOfNights: booking.numberOfNights || 1,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      totalPrice: Number(booking.totalPrice || 0),
      customerPayable: payable,
      depositMethod: booking.depositMethod || 'pay_at_hotel',
      isPropertyCollect,
      commissionRate: commRate,
      commissionAmount: commission,
      hotelNetAmount: Number(booking.hotelNetAmount || (payable - commission)),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      canCheckIn: booking.status === 'pending' || booking.status === 'confirmed',
      alreadyCheckedIn: booking.status === 'checked_in',
      isCompleted: booking.status === 'completed',
      isCancelled: booking.status === 'cancelled' || booking.status === 'rejected',
      createdAt: booking.createdAt,
    };
  }

  /**
   * Quét mã QR hoặc nhập mã để Check-in nhận phòng tức thì (Hỗ trợ mọi định dạng thẻ/mã)
   */
  async checkInByQrCode(hotelId: number, codeOrId: string) {
    const booking = await this.findBookingByCodeOrId(hotelId, codeOrId);

    if (booking.status === 'checked_in') {
      return {
        success: true,
        alreadyCheckedIn: true,
        message: `Đơn phòng #${booking.bookingCode || booking.id} đã làm thủ tục nhận phòng trước đó!`,
        booking,
      };
    }

    if (booking.status === 'completed') {
      throw new BadRequestException(`Đơn phòng #${booking.bookingCode || booking.id} đã hoàn tất trả phòng trước đó!`);
    }

    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException(`Đơn phòng #${booking.bookingCode || booking.id} đã bị hủy!`);
    }

    // Cập nhật trạng thái sang 'checked_in' bằng updateBookingStatus để đồng bộ mọi thông báo, socket, phòng
    const res = await this.updateBookingStatus(hotelId, booking.id, 'checked_in');

    return {
      success: true,
      alreadyCheckedIn: false,
      message: `Nhận phòng thành công #${booking.bookingCode || booking.id}! Phòng ${booking.roomNumber || ''} đã chuyển sang Đang lưu trú.`,
      booking: res.booking,
    };
  }

  // ==========================================
  // QUẢN LÝ TẦNG & PHÒNG VẬT LÝ (TÒA NHÀ -> TẦNG -> PHÒNG)
  // ==========================================

  /**
   * Lấy sơ đồ tầng & phòng vật lý của khách sạn (cho Tab "Tầng & phòng")
   */
  async getHotelFloorsAndRooms(hotelId: number) {
    await this.autoUnlockExpiredBookings(hotelId);

    const floors = await this.floorRepo.find({
      where: { listingId: hotelId },
      order: { floorNumber: 'ASC' },
    });

    const physicalRooms = await this.physicalRoomRepo.find({
      where: { listingId: hotelId },
      order: { roomNumber: 'ASC' },
    });

    const roomTypes = await this.hotelRoomRepo.find({
      where: { listingId: hotelId },
    });
    const typeMap = new Map<number, HotelRoom>();
    for (const t of roomTypes) {
      typeMap.set(Number(t.id), t);
    }

    // Nhóm phòng theo tầng
    const floorsWithRooms = floors.map((f) => {
      const fRooms = physicalRooms
        .filter((r) => Number(r.floorId) === Number(f.id))
        .map((r) => {
          const t = typeMap.get(Number(r.roomTypeId));
          return {
            id: r.id,
            roomNumber: r.roomNumber,
            roomTypeId: r.roomTypeId,
            roomTypeName: t?.name || 'Chưa gán',
            roomTypePrice: t?.price || 0,
            status: r.status || 'available', // available | occupied | booked | cleaning | maintenance
            cleanStatus: r.cleanStatus || 'clean',
            notes: r.notes || '',
          };
        });

      return {
        id: f.id,
        floorNumber: f.floorNumber,
        name: f.name,
        rooms: fRooms,
        stats: {
          total: fRooms.length,
          available: fRooms.filter((r) => r.status === 'available').length,
          occupied: fRooms.filter((r) => r.status === 'occupied').length,
          booked: fRooms.filter((r) => r.status === 'booked').length,
          maintenance: fRooms.filter(
            (r) => r.status === 'maintenance' || r.status === 'cleaning',
          ).length,
        },
      };
    });

    const totalPhysicalRooms = physicalRooms.length;
    const availableRooms = physicalRooms.filter((r) => r.status === 'available').length;
    const occupiedRooms = physicalRooms.filter((r) => r.status === 'occupied').length;
    const bookedRooms = physicalRooms.filter((r) => r.status === 'booked').length;
    const maintenanceRooms = physicalRooms.filter(
      (r) => r.status === 'maintenance' || r.status === 'cleaning',
    ).length;

    return {
      floors: floorsWithRooms,
      roomTypes: roomTypes.map((t) => ({
        id: t.id,
        name: t.name,
        price: t.price,
        totalRooms: t.totalRooms,
      })),
      stats: {
        totalFloors: floors.length,
        totalPhysicalRooms,
        availableRooms,
        occupiedRooms,
        bookedRooms,
        maintenanceRooms,
      },
    };
  }

  /**
   * Thêm tầng mới cho khách sạn
   */
  async createFloor(hotelId: number, name: string, floorNumber?: number) {
    let fNum = floorNumber;
    if (!fNum) {
      const highest = await this.floorRepo
        .createQueryBuilder('f')
        .where('f.listing_id = :hotelId', { hotelId })
        .orderBy('f.floor_number', 'DESC')
        .getOne();
      fNum = (highest?.floorNumber || 0) + 1;
    }

    const floor = this.floorRepo.create({
      listingId: hotelId,
      floorNumber: fNum,
      name: name || `Tầng ${fNum}`,
    });

    const saved = await this.floorRepo.save(floor);
    this.logger.log(`[HotelManager] 🏢 Created floor #${saved.id} "${saved.name}" for Hotel #${hotelId}`);
    return saved;
  }

  /**
   * Xóa tầng (kèm phòng vật lý trên tầng)
   */
  async deleteFloor(hotelId: number, floorId: number) {
    const floor = await this.floorRepo.findOne({
      where: { id: floorId, listingId: hotelId },
    });
    if (!floor) throw new NotFoundException('Không tìm thấy tầng');

    await this.physicalRoomRepo.delete({ floorId: floor.id, listingId: hotelId });
    await this.floorRepo.remove(floor);
    return { success: true, message: `Đã xóa ${floor.name}` };
  }

  /**
   * Tạo phòng hàng loạt cho tầng
   */
  async createPhysicalRoomsBatch(
    hotelId: number,
    dto: {
      floorId: number;
      roomTypeId: number;
      quantity?: number;
      startNumber?: number;
      customNumbers?: string[];
    },
  ) {
    const floor = await this.floorRepo.findOne({
      where: { id: dto.floorId, listingId: hotelId },
    });
    if (!floor) throw new NotFoundException('Không tìm thấy tầng được chọn');

    const roomType = await this.hotelRoomRepo.findOne({
      where: { id: dto.roomTypeId, listingId: hotelId },
    });
    if (!roomType) throw new NotFoundException('Không tìm thấy loại phòng được chọn');

    let numbersToCreate: string[] = [];

    if (Array.isArray(dto.customNumbers) && dto.customNumbers.length > 0) {
      numbersToCreate = dto.customNumbers.map((s) => s.trim()).filter(Boolean);
    } else {
      const quantity = Math.max(1, dto.quantity || 1);
      const startNum = dto.startNumber || (floor.floorNumber * 100 + 1);
      for (let i = 0; i < quantity; i++) {
        numbersToCreate.push((startNum + i).toString());
      }
    }

    const existingRooms = await this.physicalRoomRepo.find({
      where: { listingId: hotelId },
    });
    const existingNumbers = new Set(existingRooms.map((r) => r.roomNumber));

    const createdRooms: HotelPhysicalRoom[] = [];
    for (const num of numbersToCreate) {
      if (existingNumbers.has(num)) {
        continue;
      }
      const pRoom = this.physicalRoomRepo.create({
        listingId: hotelId,
        floorId: floor.id,
        roomTypeId: roomType.id,
        roomNumber: num,
        status: 'available',
        cleanStatus: 'clean',
      });
      const saved = await this.physicalRoomRepo.save(pRoom);
      createdRooms.push(saved);
      existingNumbers.add(num);
    }

    // Tự động cập nhật tổng số phòng (totalRooms) cho loại phòng này
    const totalForType = await this.physicalRoomRepo.count({
      where: { listingId: hotelId, roomTypeId: roomType.id },
    });
    if (totalForType > 0) {
      roomType.totalRooms = totalForType;
      await this.hotelRoomRepo.save(roomType);
    }

    return {
      success: true,
      message: `Đã tạo ${createdRooms.length} phòng mới cho ${floor.name}`,
      createdRooms,
      totalRoomsForType: totalForType,
    };
  }

  /**
   * Cập nhật trạng thái phòng vật lý (Trống, Đang ở, Đã đặt, Bảo trì, Đang dọn)
   */
  async updatePhysicalRoomStatus(hotelId: number, roomId: number, status: string, notes?: string) {
    const pRoom = await this.physicalRoomRepo.findOne({
      where: { id: roomId, listingId: hotelId },
    });
    if (!pRoom) throw new NotFoundException('Không tìm thấy phòng vật lý');

    pRoom.status = status;
    if (notes !== undefined) pRoom.notes = notes;
    const saved = await this.physicalRoomRepo.save(pRoom);
    return saved;
  }

  /**
   * Xóa phòng vật lý
   */
  async deletePhysicalRoom(hotelId: number, roomId: number) {
    const pRoom = await this.physicalRoomRepo.findOne({
      where: { id: roomId, listingId: hotelId },
    });
    if (!pRoom) throw new NotFoundException('Không tìm thấy phòng');

    const typeId = pRoom.roomTypeId;
    await this.physicalRoomRepo.remove(pRoom);

    // Cập nhật lại totalRooms
    const totalForType = await this.physicalRoomRepo.count({
      where: { listingId: hotelId, roomTypeId: typeId },
    });
    await this.hotelRoomRepo.update({ id: typeId }, { totalRooms: totalForType });

    return { success: true, message: 'Đã xóa phòng' };
  }
}

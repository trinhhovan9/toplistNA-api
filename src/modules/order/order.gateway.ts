import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class OrderGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrderGateway.name);

  afterInit() {
    this.logger.log('✅ OrderGateway WebSocket initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Lấy danh sách các room alias cho một mã đơn hoặc id */
  private getOrderRooms(orderIdentifier: string | number): string[] {
    const raw = String(orderIdentifier).trim();
    if (!raw) return [];
    const rooms = new Set<string>();
    rooms.add(`order_${raw}`);

    if (raw.toUpperCase().startsWith('OD')) {
      const withoutOd = raw.substring(2);
      if (withoutOd) rooms.add(`order_${withoutOd}`);
    } else {
      rooms.add(`order_OD${raw}`);
    }

    return Array.from(rooms);
  }

  /** Client sends join_order { orderId } to subscribe to live updates */
  @SubscribeMessage('join_order')
  handleJoinOrder(
    @MessageBody() data: { orderId: string | number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.orderId) return;
    const rooms = this.getOrderRooms(data.orderId);
    rooms.forEach((r) => client.join(r));
    this.logger.log(`Client ${client.id} joined rooms: ${rooms.join(', ')}`);
    client.emit('joined', { rooms, message: `Đang theo dõi đơn hàng ${data.orderId}` });
  }

  /** Client leaves an order room */
  @SubscribeMessage('leave_order')
  handleLeaveOrder(
    @MessageBody() data: { orderId: string | number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.orderId) return;
    const rooms = this.getOrderRooms(data.orderId);
    rooms.forEach((r) => client.leave(r));
    this.logger.log(`Client ${client.id} left rooms: ${rooms.join(', ')}`);
  }

  /**
   * Driver sends location update for an order
   */
  @SubscribeMessage('driver:update_location')
  handleDriverLocation(
    @MessageBody() data: { orderId: string | number; lat: number; lng: number; heading?: number; speed?: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.emitDriverLocation(data.orderId, data.lat, data.lng, data.heading ?? 0, data.speed ?? 0);
  }

  /**
   * Broadcast driver location update to all subscribers of that order.
   */
  emitDriverLocation(
    orderIdentifier: string | number,
    lat: number,
    lng: number,
    heading = 0,
    speed = 0,
    secondaryIdentifier?: string | number,
  ) {
    const targetRooms = new Set<string>();
    this.getOrderRooms(orderIdentifier).forEach((r) => targetRooms.add(r));
    if (secondaryIdentifier) {
      this.getOrderRooms(secondaryIdentifier).forEach((r) => targetRooms.add(r));
    }

    const payload = {
      order_id: orderIdentifier,
      lat,
      lng,
      heading,
      speed,
      timestamp: new Date().toISOString(),
    };

    targetRooms.forEach((room) => {
      this.server.to(room).emit('driver:location_update', payload);
    });
    // Broadcast toàn cục để client ở bất kỳ màn hình nào cũng nhận được ngay
    this.server.emit('driver:location_update', payload);
    this.logger.log(`Emitted driver:location_update to rooms [${Array.from(targetRooms).join(', ')}] & broadcast`);
  }

  /**
   * Broadcast order status update to all subscribers of that order and global listeners.
   * Called by OrderService / FireGoService after checkout or status change.
   */
  emitOrderUpdate(
    orderIdentifier: string | number,
    payload: Record<string, any>,
    secondaryIdentifier?: string | number,
  ) {
    const targetRooms = new Set<string>();
    this.getOrderRooms(orderIdentifier).forEach((r) => targetRooms.add(r));
    if (secondaryIdentifier) {
      this.getOrderRooms(secondaryIdentifier).forEach((r) => targetRooms.add(r));
    }

    const fullPayload = {
      order_id: orderIdentifier,
      ...payload,
      timestamp: new Date().toISOString(),
    };

    // 1. Gửi tới các rooms theo dõi chi tiết đơn
    targetRooms.forEach((room) => {
      this.server.to(room).emit('order:status_update', fullPayload);
    });

    // 2. Broadcast sự kiện chung cho các màn hình danh sách (MyOrdersScreen)
    this.server.emit('order:status_update', fullPayload);

    this.logger.log(`Emitted order:status_update to rooms [${Array.from(targetRooms).join(', ')}] & broadcast`);
  }

  /**
   * Broadcast new order creation to a general channel (for admin/staff dashboards).
   */
  emitNewOrder(orderData: Record<string, any>) {
    this.server.emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted order:new event`);
  }

  /**
   * Broadcast new hotel booking to hotel owners/managers with urgent alert
   */
  emitNewHotelBooking(bookingData: Record<string, any>) {
    this.server.emit('hotel:booking_new', {
      ...bookingData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted hotel:booking_new event for #${bookingData.bookingCode || bookingData.id}`);
  }

  /**
   * Broadcast hotel booking status update (confirmed, completed, cancelled)
   */
  emitHotelBookingStatusUpdate(bookingData: Record<string, any>) {
    this.server.emit('hotel:booking_status', {
      ...bookingData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted hotel:booking_status event for #${bookingData.bookingCode || bookingData.id}`);
  }

  /**
   * Broadcast real-time chat message to all subscribers of this order room.
   */
  emitOrderMessage(
    orderIdentifier: string | number,
    message: Record<string, any>,
    secondaryIdentifier?: string | number,
  ) {
    const targetRooms = new Set<string>();
    this.getOrderRooms(orderIdentifier).forEach((r) => targetRooms.add(r));
    if (secondaryIdentifier) {
      this.getOrderRooms(secondaryIdentifier).forEach((r) => targetRooms.add(r));
    }

    const payload = {
      order_id: orderIdentifier,
      ...message,
    };

    targetRooms.forEach((room) => {
      this.server.to(room).emit('chat:new_message', payload);
    });

    this.logger.log(`Emitted chat:new_message to rooms [${Array.from(targetRooms).join(', ')}]`);
  }
}

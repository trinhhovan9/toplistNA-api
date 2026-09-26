import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { HomepageModule } from './modules/homepage/homepage.module';
import { SearchModule } from './modules/search/search.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { CartModule } from './modules/cart/cart.module';
import { VoucherModule } from './modules/voucher/voucher.module';
import { OrderModule } from './modules/order/order.module';
import { HotelModule } from './modules/hotel/hotel.module';
import { ShipModule } from './modules/ship/ship.module';
import { TableBookingModule } from './modules/table-booking/table-booking.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { AiModule } from './modules/ai/ai.module';
import { CategoryModule } from './modules/category/category.module';
import { NotificationModule } from './modules/notification/notification.module';
import { FireGoModule } from './modules/firego/firego.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PromotionModule } from './modules/promotion/promotion.module';
import { DeliveryEtaModule } from './modules/delivery-eta/delivery-eta.module';
import { AdminModule } from './modules/admin/admin.module';
import { StoreWalletModule } from './modules/store-wallet/store-wallet.module';

@Module({
  imports: [
    // Load .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Connect to shared MySQL database (same as booking-na)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        database: config.get<string>('DB_DATABASE', 'bookingna'),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        entities: [__dirname + '/entities/*.entity{.ts,.js}'],
        // IMPORTANT: synchronize: false – do NOT auto-modify existing tables
        synchronize: false,
        logging: config.get<string>('APP_ENV') === 'development',
        timezone: '+07:00',
      }),
      inject: [ConfigService],
    }),

    AuthModule,
    HomepageModule,
    SearchModule,
    RestaurantModule,
    CartModule,
    VoucherModule,
    OrderModule,
    HotelModule,
    ShipModule,
    TableBookingModule,
    FavoriteModule,
    AiModule,
    CategoryModule,
    NotificationModule,
    FireGoModule,
    PaymentModule,
    PromotionModule,
    DeliveryEtaModule,
    AdminModule,
    StoreWalletModule,
  ],
})
export class AppModule {}

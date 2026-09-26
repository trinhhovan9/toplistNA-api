const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { HotelService } = require('../dist/modules/hotel/hotel.service');
const { RestaurantService } = require('../dist/modules/restaurant/restaurant.service');

async function testAll() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [cols] = await conn.query("SHOW COLUMNS FROM `hotel_rooms` LIKE 'amenities'");
  if (cols.length === 0) {
    await conn.query("ALTER TABLE `hotel_rooms` ADD COLUMN `amenities` TEXT NULL AFTER `bed_type`");
    console.log("✅ Added `amenities` column to `hotel_rooms`");
  }

  await conn.end();

  // Test NestJS app
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  console.log('AppModule bootstrapped.');

  const hotelService = app.get(HotelService);
  const hotelRes = await hotelService.search('2026-08-10', '2026-08-12', 2, 0);
  console.log('✅ hotel search success! Found hotels count:', hotelRes.length);

  const restaurantService = app.get(RestaurantService);
  const nearbyRes = await restaurantService.getNearby(18.6796, 105.6813, [], '', 1, 30);
  console.log('✅ getNearby success! Total:', nearbyRes.total, 'results count:', nearbyRes.results.length);

  await app.close();
}

testAll().catch(console.error);

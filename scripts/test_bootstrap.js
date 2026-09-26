const { NestFactory } = require('@nestjs/core');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
const { AppModule } = require('../dist/app.module');
const { RestaurantService } = require('../dist/modules/restaurant/restaurant.service');
const { HotelService } = require('../dist/modules/hotel/hotel.service');

async function testBootstrap() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    console.log('AppModule bootstrapped successfully.');

    const restaurantService = app.get(RestaurantService);
    console.log('Testing restaurantService.getNearby...');
    try {
      const nearbyRes = await restaurantService.getNearby(18.6796, 105.6813, [], '', 1, 30);
      console.log('✅ getNearby success! Total:', nearbyRes.total, 'results:', nearbyRes.results.length);
    } catch (err) {
      console.error('❌ getNearby Error:', err);
    }

    const hotelService = app.get(HotelService);
    console.log('Testing hotelService.search...');
    try {
      const hotelRes = await hotelService.search('2026-08-10', '2026-08-12', 2, 0);
      console.log('✅ hotel search success! count:', hotelRes.length);
    } catch (err) {
      console.error('❌ hotel search Error:', err);
    }

    await app.close();
  } catch (err) {
    console.error('Bootstrap Error:', err);
  }
}

testBootstrap();

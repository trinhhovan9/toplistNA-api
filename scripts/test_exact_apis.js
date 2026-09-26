const { NestFactory } = require('@nestjs/core');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
const { AppModule } = require('../dist/app.module');
const { RestaurantService } = require('../dist/modules/restaurant/restaurant.service');
const { HotelService } = require('../dist/modules/hotel/hotel.service');
const { SearchService } = require('../dist/modules/search/search.service');

async function testAllApis() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  console.log('AppModule bootstrapped.');

  const restaurantService = app.get(RestaurantService);
  const hotelService = app.get(HotelService);
  const searchService = app.get(SearchService);

  console.log('1. Testing getNearby...');
  const nearby = await restaurantService.getNearby(18.6796, 105.6813, [], '', 1, 30);
  console.log('✅ nearby total:', nearby.total, 'results:', nearby.results.length);

  console.log('2. Testing hotel search...');
  const hotels = await hotelService.search('2026-08-10', '2026-08-12', 2, 0);
  console.log('✅ hotels count:', hotels.length);

  console.log('3. Testing search Top 10...');
  const searchRes = await searchService.search('Top 10', 1, 20);
  console.log('✅ search results count:', searchRes.results.length);

  console.log('4. Testing search listings du-lich...');
  const catRes = await searchService.getListingsByCategory({ categoryAlias: 'du-lich', page: 1, limit: 20 });
  console.log('✅ catRes count:', catRes.results.length);

  await app.close();
}

testAllApis().catch(console.error);

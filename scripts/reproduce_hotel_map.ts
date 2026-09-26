import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HotelService } from '../src/modules/hotel/hotel.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const hotelService = app.get(HotelService);

  try {
    console.log('Testing hotel 1252:');
    const res1252 = await hotelService.getRoomAvailabilityMap(1252, '2026-09-26', '2026-09-27');
    console.log('Hotel 1252 success! floors:', res1252.floors?.length);
  } catch (err) {
    console.error('Hotel 1252 error:', err);
  }

  try {
    console.log('Testing hotel 1:');
    const res1 = await hotelService.getRoomAvailabilityMap(1, '2026-09-26', '2026-09-27');
    console.log('Hotel 1 success! floors:', res1.floors?.length);
  } catch (err) {
    console.error('Hotel 1 error:', err);
  }

  await app.close();
  process.exit(0);
}

main();

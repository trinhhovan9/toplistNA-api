const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: '139.180.186.68',
    port: 3306,
    user: 'bookingna_user',
    password: 'dakjs128!@',
    database: 'bookingna'
  });

  const hotelId = 1252; // Or 1
  const checkin = '2026-09-26';
  const checkout = '2026-09-27';

  try {
    // 1. Hotel
    const [hotels] = await conn.query('SELECT * FROM listings WHERE id = ?', [hotelId]);
    console.log('Hotel found:', hotels.length > 0 ? hotels[0].name : 'Not found');

    // 2. Room types
    const [roomTypes] = await conn.query('SELECT * FROM hotel_rooms WHERE listing_id = ? AND is_available = 1', [hotelId]);
    console.log('Room types:', roomTypes.length);

    // 3. Floors
    const [floors] = await conn.query('SELECT * FROM hotel_floors WHERE listing_id = ? ORDER BY floor_number ASC', [hotelId]);
    console.log('Floors:', floors.length);

    // 4. Physical rooms
    const [physicalRooms] = await conn.query('SELECT * FROM hotel_physical_rooms WHERE listing_id = ? ORDER BY floor_id ASC', [hotelId]);
    console.log('Physical rooms:', physicalRooms.length);

    // 5. Overlapping reservations
    const [res] = await conn.query(`
      SELECT * FROM hotel_reservations
      WHERE listing_id = ?
        AND status NOT IN ('cancelled', 'rejected')
        AND checkin_date < ? AND checkout_date > ?
    `, [hotelId, checkout, checkin]);
    console.log('Overlapping reservations:', res.length);

  } catch(e) {
    console.error('Error in test:', e);
  }

  // Also check hotel 1
  try {
    const [h1] = await conn.query('SELECT * FROM listings WHERE id = 1');
    console.log('Hotel 1:', h1.length > 0 ? h1[0].name : 'Not found');
    const [r1] = await conn.query('SELECT * FROM hotel_rooms WHERE listing_id = 1');
    console.log('Hotel 1 rooms:', r1.length);
  } catch(e) {
    console.error('Error h1:', e);
  }

  await conn.end();
}

test().catch(console.error);

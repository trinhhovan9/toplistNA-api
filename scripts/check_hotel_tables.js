const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: '139.180.186.68',
    port: 3306,
    user: 'bookingna_user',
    password: 'dakjs128!@',
    database: 'bookingna'
  });
  console.log('Connected to DB');

  const [tables] = await conn.query("SHOW TABLES LIKE '%hotel%'");
  console.log('Hotel tables:', tables);

  try {
    const [cols] = await conn.query('DESCRIBE hotel_reservations');
    console.log('hotel_reservations cols:', cols.map(c => c.Field));
  } catch(e) {
    console.log('hotel_reservations error:', e.message);
  }

  try {
    const [cols] = await conn.query('DESCRIBE hotel_physical_rooms');
    console.log('hotel_physical_rooms cols:', cols.map(c => c.Field));
  } catch(e) {
    console.log('hotel_physical_rooms error:', e.message);
  }

  try {
    const [cols] = await conn.query('DESCRIBE hotel_floors');
    console.log('hotel_floors cols:', cols.map(c => c.Field));
  } catch(e) {
    console.log('hotel_floors error:', e.message);
  }

  try {
    const [cols] = await conn.query('DESCRIBE hotel_rooms');
    console.log('hotel_rooms cols:', cols.map(c => c.Field));
  } catch(e) {
    console.log('hotel_rooms error:', e.message);
  }

  // Check rooms for hotel id 1 or others
  const [hotels] = await conn.query("SELECT id, name, type FROM listings WHERE type IN ('hotel', 'accommodation') LIMIT 5");
  console.log('Sample hotels:', hotels);

  if (hotels.length > 0) {
    const [rooms] = await conn.query("SELECT * FROM hotel_rooms WHERE listing_id = ?", [hotels[0].id]);
    console.log(`hotel_rooms for hotel ${hotels[0].id}:`, rooms.length);
  }

  await conn.end();
}
test().catch(console.error);

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

async function testExactCalls() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    console.log('--- 1. Testing hotel search exact SQL ---');
    const [rawHotels] = await conn.query(`
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
    console.log('Hotel query count:', rawHotels.length);

    console.log('--- 2. Checking hotel_rooms table ---');
    const [rooms] = await conn.query('SELECT * FROM hotel_rooms LIMIT 10');
    console.log('hotel_rooms count in DB:', rooms.length);

    console.log('--- 3. Checking hotel_physical_rooms table ---');
    const [phys] = await conn.query('SELECT * FROM hotel_physical_rooms LIMIT 10');
    console.log('hotel_physical_rooms count in DB:', phys.length);

    console.log('--- 4. Checking hotel_reservations table ---');
    const [res] = await conn.query('SELECT * FROM hotel_reservations LIMIT 10');
    console.log('hotel_reservations count in DB:', res.length);

    console.log('--- 5. Checking media query ---');
    const [media] = await conn.query('SELECT id, path FROM media WHERE id IN (1, 2, 3)');
    console.log('media sample:', media);

  } catch (err) {
    console.error('Exact Call Error:', err);
  } finally {
    await conn.end();
  }
}

testExactCalls();

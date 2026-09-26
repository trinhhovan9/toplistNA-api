const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

async function debugNearby() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('Connected to DB');

  try {
    const q1 = `
      SELECT l.id AS id, l.name AS name, l.address AS address, l.type AS type,
             l.thumb AS thumb, l.images AS images, l.rating_avg AS rating_avg,
             l.rating_count AS rating_count, l.price_min AS price_min,
             l.latitude AS latitude, l.longitude AS longitude,
             l.is_featured AS is_featured, l.description AS description,
             m.path AS media_path
      FROM listings l
      LEFT JOIN media m ON m.id = l.thumb
      WHERE l.deleted_at IS NULL AND l.type IN ('food', 'restaurant', 'cafe') AND l.latitude IS NOT NULL
      LIMIT 10
    `;
    const [rows] = await conn.query(q1);
    console.log('1. getNearby base query OK, count:', rows.length);

    // Check hotel table and queries
    const [tables] = await conn.query("SHOW TABLES LIKE '%hotel%'");
    console.log('2. Hotel tables:', tables);

    const [rooms] = await conn.query("SHOW TABLES LIKE '%room%'");
    console.log('3. Room tables:', rooms);

    const [promoTable] = await conn.query("SHOW TABLES LIKE '%promotion%'");
    console.log('4. Promotion tables:', promoTable);

  } catch (err) {
    console.error('Debug Error:', err);
  } finally {
    await conn.end();
  }
}

debugNearby();

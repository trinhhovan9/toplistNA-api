const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calcShippingFee(distanceKm) {
  if (distanceKm <= 3) return 15000;
  return Math.round((15000 + (distanceKm - 3) * 5000) / 1000) * 1000;
}

async function testGetNearby() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const lat = 18.6796;
    const lng = 105.6813;
    const filters = [];
    const searchQuery = '';
    const page = 1;
    const limit = 30;

    console.log('Testing getNearby query on DB...');
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
    `;
    const [rawAll] = await conn.query(q1);
    console.log('rawAll length:', rawAll.length);

    const withScore = rawAll.map((l) => {
      const dist = haversineKm(lat, lng, Number(l.latitude), Number(l.longitude));
      const rating = l.rating_avg ? Number(l.rating_avg) : 4.5;
      const isFeatured = l.is_featured == 1 || l.is_featured == true ? 1 : 0;
      const randomFactor = Math.random() * 4.0;
      let score = rating * 2.5 + isFeatured * 3.0 + randomFactor - dist * 0.2;
      return {
        ...l,
        distanceKm: dist,
        shippingFee: calcShippingFee(dist),
        score,
      };
    });

    const filtered = withScore.filter((l) => l.distanceKm <= 25);
    console.log('filtered <= 25km length:', filtered.length);

    filtered.sort((a, b) => b.score - a.score);
    const paged = filtered.slice((page - 1) * limit, page * limit);
    const pagedIds = paged.map((l) => l.id);
    console.log('pagedIds length:', pagedIds.length);

    if (pagedIds.length > 0) {
      const [menuItems] = await conn.query(
        'SELECT * FROM menu_items WHERE listing_id IN (?) AND is_available = 1 ORDER BY iorder ASC',
        [pagedIds]
      );
      console.log('menuItems length:', menuItems.length);
    }

    console.log('Testing Hotel Search...');
    const [hotelRows] = await conn.query(`
      SELECT l.id, l.name, l.address, l.type, l.rating_avg, l.price_min, l.latitude, l.longitude
      FROM listings l
      WHERE l.type = 'accommodation' AND l.deleted_at IS NULL
      LIMIT 20
    `);
    console.log('Hotel rows length:', hotelRows.length);

  } catch (err) {
    console.error('Error in test:', err);
  } finally {
    await conn.end();
  }
}

testGetNearby();

const mysql = require('mysql2/promise');

async function testGetNearby() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'bookingna',
  });

  const [rows] = await conn.execute(`
    SELECT 
      l.id AS id,
      l.name AS name,
      l.address AS address,
      l.type AS type,
      l.thumb AS thumb,
      l.images AS images,
      l.rating_avg AS rating_avg,
      l.rating_count AS rating_count,
      l.price_min AS price_min,
      l.latitude AS latitude,
      l.longitude AS longitude,
      l.is_featured AS is_featured,
      l.description AS description,
      m.path AS media_path
    FROM listings l
    LEFT JOIN media m ON CAST(l.thumb AS UNSIGNED) = m.id
    WHERE l.deleted_at IS NULL AND l.type IN ('food', 'restaurant', 'cafe') AND l.latitude IS NOT NULL
    LIMIT 20
  `);

  console.log('Sample rows from MySQL:');
  for (const r of rows.slice(0, 5)) {
    console.log({
      id: r.id,
      name: r.name,
      thumb: r.thumb,
      media_path: r.media_path,
      images: r.images ? r.images.substring(0, 30) : null
    });
  }

  const nullMedia = rows.filter(r => !r.media_path);
  console.log(`Rows with media_path: ${rows.length - nullMedia.length}, without media_path: ${nullMedia.length}`);
  if (nullMedia.length > 0) {
    console.log('Sample without media_path:', nullMedia.slice(0, 5));
  }

  await conn.end();
}

testGetNearby().catch(console.error);

const mysql = require('mysql2/promise');
async function test() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', user: 'root', password: '', database: 'bookingna'
  });
  const [rows] = await conn.execute(
    `SELECT l.id, l.name, l.thumb, l.images, m.path as media_path 
     FROM listings l 
     LEFT JOIN media m ON CAST(l.thumb AS UNSIGNED) = m.id 
     WHERE l.name LIKE '%Toocha%' OR l.name LIKE '%Góc Coffee%' OR l.name LIKE '%Wang BBQ%' OR l.name LIKE '%Biển Ngọc%'`
  );
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}
test();

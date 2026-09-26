const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'bookingna',
  });

  const [rows] = await conn.execute("SELECT id, name, thumb FROM listings WHERE thumb LIKE '%unsplash%'");
  console.log('Listings with unsplash:', rows);

  await conn.end();
}

main().catch(console.error);

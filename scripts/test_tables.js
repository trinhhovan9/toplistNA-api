const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const [wards] = await conn.query("SHOW TABLES LIKE '%ward%'");
    console.log('wards tables:', wards);

    const [listingCols] = await conn.query("SHOW COLUMNS FROM listings");
    console.log('listing columns:', listingCols.map(c => c.Field).join(', '));

    const [allTables] = await conn.query("SHOW TABLES");
    console.log('all tables count:', allTables.length);
    console.log('all tables:', allTables.map(t => Object.values(t)[0]).join(', '));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await conn.end();
  }
}

check();

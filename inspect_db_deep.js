const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bookingna',
  });

  // 1. Check distinct types in listings
  const [types] = await pool.query(
    'SELECT type, COUNT(*) as cnt FROM listings WHERE deleted_at IS NULL GROUP BY type',
  );
  console.log('LISTINGS TYPES:', types);

  // 2. Check which listings actually have menu_items
  const [menuListings] = await pool.query(
    'SELECT l.id, l.name, l.type, COUNT(m.id) as item_count FROM listings l JOIN menu_items m ON m.listing_id = l.id GROUP BY l.id, l.name, l.type',
  );
  console.log('LISTINGS WITH MENU ITEMS:', menuListings);

  // 3. Check databases to see FireGo db
  const [dbs] = await pool.query('SHOW DATABASES');
  console.log('DATABASES:', dbs.map((d) => Object.values(d)[0]));

  // 4. Tables with version, review, driver, promotion
  const [versionTables] = await pool.query("SHOW TABLES LIKE '%version%'");
  console.log('VERSION TABLES:', versionTables);

  const [reviewTables] = await pool.query("SHOW TABLES LIKE '%review%'");
  console.log('REVIEW TABLES:', reviewTables);

  const [driverTables] = await pool.query("SHOW TABLES LIKE '%driver%'");
  console.log('DRIVER TABLES IN bookingna:', driverTables);

  const [promotionTables] = await pool.query("SHOW TABLES LIKE '%promotion%'");
  console.log('PROMOTION TABLES:', promotionTables);

  const [flashSaleTables] = await pool.query("SHOW TABLES LIKE '%flash%'");
  console.log('FLASH TABLES:', flashSaleTables);

  await pool.end();
}

main().catch(console.error);

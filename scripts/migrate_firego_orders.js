const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'bookingna'
  });

  const [cols] = await conn.query('DESCRIBE orders');
  const colNames = cols.map(c => c.Field);
  console.log('Existing columns in orders:', colNames);

  const toAdd = [
    ['firego_delivery_id', 'VARCHAR(64) NULL'],
    ['firego_driver_id', 'VARCHAR(64) NULL'],
    ['driver_name', 'VARCHAR(100) NULL'],
    ['driver_phone', 'VARCHAR(30) NULL'],
    ['driver_plate', 'VARCHAR(30) NULL'],
    ['driver_vehicle', 'VARCHAR(50) NULL'],
    ['driver_avatar', 'VARCHAR(500) NULL'],
    ['driver_rating', 'DECIMAL(3,2) NULL']
  ];

  for (const [col, type] of toAdd) {
    if (!colNames.includes(col)) {
      console.log('Adding column:', col);
      await conn.query(`ALTER TABLE orders ADD COLUMN ${col} ${type}`);
    } else {
      console.log('Column already exists:', col);
    }
  }

  console.log('Migration completed successfully!');
  await conn.end();
}

migrate().catch(e => {
  console.error('Migration error:', e);
  process.exit(1);
});

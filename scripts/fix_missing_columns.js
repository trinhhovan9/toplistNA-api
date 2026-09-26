const mysql = require('mysql2/promise');

async function fixColumns() {
  const conn = await mysql.createConnection({
    host: '139.180.186.68',
    port: 3306,
    user: 'bookingna_user',
    password: 'dakjs128!@',
    database: 'bookingna'
  });
  console.log('Connected to DB');

  const addColumnIfNotExists = async (table, colName, colDef) => {
    try {
      const [existing] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${colName}'`);
      if (existing.length === 0) {
        console.log(`Adding ${colName} to ${table}...`);
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${colName}\` ${colDef}`);
        console.log(`✓ Added ${colName}`);
      } else {
        console.log(`- ${colName} already exists in ${table}`);
      }
    } catch (e) {
      console.error(`Error adding ${colName} to ${table}:`, e.message);
    }
  };

  // Check and add missing columns to hotel_reservations
  await addColumnIfNotExists('hotel_reservations', 'room_price', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'gross_amount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'discount_amount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'commission_rate', 'INT NOT NULL DEFAULT 15');
  await addColumnIfNotExists('hotel_reservations', 'commission_amount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'customer_payable', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'hotel_net_amount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('hotel_reservations', 'financial_breakdown', 'LONGTEXT NULL');

  // Check hotel_rooms
  await addColumnIfNotExists('hotel_rooms', 'original_price', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('hotel_rooms', 'total_rooms', 'INT NOT NULL DEFAULT 5');
  await addColumnIfNotExists('hotel_rooms', 'capacity', 'INT NOT NULL DEFAULT 2');
  await addColumnIfNotExists('hotel_rooms', 'bed_type', 'VARCHAR(100) NULL');
  await addColumnIfNotExists('hotel_rooms', 'amenities', 'TEXT NULL');
  await addColumnIfNotExists('hotel_rooms', 'is_available', 'TINYINT(1) NOT NULL DEFAULT 1');

  // Check menu_items
  await addColumnIfNotExists('menu_items', 'original_price', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('menu_items', 'is_available', 'TINYINT(1) NOT NULL DEFAULT 1');

  await conn.end();
  console.log('Done fixing columns!');
}

fixColumns().catch(console.error);

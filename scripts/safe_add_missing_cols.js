const mysql = require('mysql2/promise');

async function migrateSafe() {
  console.log('Connecting to remote DB 139.180.186.68...');
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

  // 1. Order items columns
  await addColumnIfNotExists('order_items', 'original_price', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('order_items', 'discount_amount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('order_items', 'promotion_id', 'BIGINT NULL DEFAULT NULL');
  await addColumnIfNotExists('order_items', 'promotion_type', 'VARCHAR(50) NULL DEFAULT NULL');

  // 2. Vouchers columns
  await addColumnIfNotExists('vouchers', 'listing_id', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('vouchers', 'funded_by', "VARCHAR(20) NOT NULL DEFAULT 'PLATFORM'");
  await addColumnIfNotExists('vouchers', 'store_share_pct', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('vouchers', 'platform_share_pct', 'INT NOT NULL DEFAULT 100');
  await addColumnIfNotExists('vouchers', 'description', 'TEXT NULL DEFAULT NULL');
  await addColumnIfNotExists('vouchers', 'usage_limit', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('vouchers', 'applicable_type', "VARCHAR(30) NOT NULL DEFAULT 'all'");
  await addColumnIfNotExists('vouchers', 'applicable_dish_ids', 'TEXT NULL DEFAULT NULL');
  await addColumnIfNotExists('vouchers', 'applicable_dish_names', 'TEXT NULL DEFAULT NULL');
  await addColumnIfNotExists('vouchers', 'used_count', 'INT NOT NULL DEFAULT 0');

  await conn.end();
  console.log('Migration completed safely without affecting existing data!');
}

migrateSafe().catch(console.error);

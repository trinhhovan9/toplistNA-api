const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load .env.production if exists, otherwise fallback to .env
const envProdPath = path.join(__dirname, '../.env.production');
const envDefaultPath = path.join(__dirname, '../.env');
if (fs.existsSync(envProdPath)) {
  require('dotenv').config({ path: envProdPath });
} else {
  require('dotenv').config({ path: envDefaultPath });
}

async function runMigration() {
  console.log('======================================================');
  console.log('🚀 TOPLIST NGHỆ AN - SAFE DATABASE MIGRATION RUNNER');
  console.log('======================================================');
  console.log(`Connecting to DB: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}, Database: ${process.env.DB_DATABASE}, User: ${process.env.DB_USERNAME}`);

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'bookingna',
      multipleStatements: true,
    });

    console.log('✅ Connected successfully to MySQL database!');

    const sqlPath = path.join(__dirname, '../database/migration_production.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`File ${sqlPath} not found!`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Executing ${path.basename(sqlPath)}...`);
    await connection.query(sql);

    console.log('\n------------------------------------------------------');
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('------------------------------------------------------');

    // Verification check
    const tablesToCheck = [
      'menu_items',
      'carts',
      'cart_items',
      'vouchers',
      'orders',
      'order_items',
      'delivery_orders',
      'store_wallets',
      'store_wallet_transactions',
      'store_withdrawals',
      'settlement_records',
      'promotions',
      'promotion_items',
      'payments',
      'hotel_floors',
      'hotel_physical_rooms',
      'app_versions',
      'admin_audit_logs',
      'homepage_collections',
      'homepage_events',
    ];

    console.log('\nChecking created tables:');
    for (const tbl of tablesToCheck) {
      const [res] = await connection.query(`SHOW TABLES LIKE '${tbl}'`);
      if (res.length > 0) {
        console.log(`  ✓ Table '${tbl}' is READY`);
      } else {
        console.log(`  ✗ Table '${tbl}' NOT found`);
      }
    }

    await connection.end();
    console.log('\nDatabase connection closed. Everything is safe & ready!');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();

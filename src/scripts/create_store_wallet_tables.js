const mysql = require('mysql2/promise');

async function setup() {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bookingna'
  });

  await c.query(`
    CREATE TABLE IF NOT EXISTS store_wallets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      store_id BIGINT UNSIGNED NOT NULL UNIQUE,
      balance INT NOT NULL DEFAULT 0,
      held_balance INT NOT NULL DEFAULT 0,
      bank_name VARCHAR(100) NULL,
      bank_account_number VARCHAR(50) NULL,
      bank_account_holder VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await c.query(`
    CREATE TABLE IF NOT EXISTS store_wallet_transactions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      wallet_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      order_id BIGINT UNSIGNED NULL,
      order_code VARCHAR(50) NULL,
      type ENUM('ORDER_REVENUE', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'ADJUSTMENT') NOT NULL,
      amount INT NOT NULL,
      balance_before INT NOT NULL,
      balance_after INT NOT NULL,
      idempotency_key VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_store (store_id),
      INDEX idx_wallet (wallet_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await c.query(`
    CREATE TABLE IF NOT EXISTS store_withdrawals (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      wallet_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      amount INT NOT NULL,
      bank_name VARCHAR(100) NOT NULL,
      bank_account_number VARCHAR(50) NOT NULL,
      bank_account_holder VARCHAR(100) NOT NULL,
      status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED') DEFAULT 'PENDING',
      rejection_reason VARCHAR(255) NULL,
      processed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_store_status (store_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('✅ Tables store_wallets, store_wallet_transactions, store_withdrawals created successfully!');
  await c.end();
}

setup().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

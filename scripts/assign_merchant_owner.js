const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('1. Updating user hovantrinh17 (id: 817) partner_status and role...');
  await connection.query(
    "UPDATE users SET partner_status = 'approved', role = 'Đối tác' WHERE id = 817"
  );

  console.log('2. Resetting owner_user_id for other listings...');
  await connection.query(
    "UPDATE listings SET owner_user_id = NULL WHERE owner_user_id = 817 AND id != 2046"
  );

  console.log('3. Assigning Tian Long (id: 2046) to user 817...');
  await connection.query(
    "UPDATE listings SET owner_user_id = 817 WHERE id = 2046"
  );

  console.log('4. Verifying assignment in database:');
  const [user] = await connection.query("SELECT id, username, email, role, partner_status FROM users WHERE id = 817");
  console.log('User status:', user);

  const [stores] = await connection.query("SELECT id, name, address, owner_user_id FROM listings WHERE owner_user_id = 817");
  console.log('Managed stores for user 817:', stores);

  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

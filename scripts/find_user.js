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

  const [tianLong] = await connection.query("SELECT id, name, address, owner_user_id FROM listings WHERE name LIKE '%Tian Long%' OR name LIKE '%Xanh Coffee%'");
  console.log('Stores found:', tianLong);

  await connection.end();
}

main().catch(console.error);

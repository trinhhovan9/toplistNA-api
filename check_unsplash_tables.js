const mysql = require('mysql2/promise');

async function checkAllTables() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'bookingna',
  });

  const [tables] = await conn.execute('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];

  for (const t of tables) {
    const tableName = t[tableKey];
    const [cols] = await conn.execute(`DESCRIBE \`${tableName}\``);
    const textCols = cols.filter(c => c.Type.includes('varchar') || c.Type.includes('text')).map(c => c.Field);
    
    for (const col of textCols) {
      try {
        const [res] = await conn.execute(`SELECT COUNT(*) as c FROM \`${tableName}\` WHERE \`${col}\` LIKE '%unsplash%'`);
        if (res[0].c > 0) {
          console.log(`Table ${tableName}, Column ${col}: ${res[0].c} unsplash rows`);
        }
      } catch (e) {}
    }
  }

  await conn.end();
}

checkAllTables().catch(console.error);

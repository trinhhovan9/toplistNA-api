const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function checkAll() {
  const conn = await mysql.createConnection({
    host: '139.180.186.68',
    port: 3306,
    user: 'bookingna_user',
    password: 'dakjs128!@',
    database: 'bookingna'
  });

  const dir = path.join(__dirname, '../src/entities');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.entity.ts'));

  const [dbTables] = await conn.query('SHOW TABLES');
  const tableNames = dbTables.map(t => Object.values(t)[0]);

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const tableMatch = content.match(/@Entity\s*\(\s*['"]([^'"]+)['"]/);
    if (!tableMatch) continue;
    const table = tableMatch[1];
    if (!tableNames.includes(table)) {
      console.log(`❌ TABLE MISSING in DB: ${table} (from ${file})`);
      continue;
    }

    const [cols] = await conn.query(`DESCRIBE \`${table}\``);
    const dbFields = cols.map(c => c.Field);

    const missing = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('@Column(')) {
        let nameMatch = line.match(/name:\s*['"]([^'"]+)['"]/);
        let colName = nameMatch ? nameMatch[1] : null;
        if (!colName) {
          const nextLine = lines[i + 1] || '';
          const propMatch = nextLine.match(/^\s*([a-zA-Z0-9_]+)\s*[:?]/);
          if (propMatch && !propMatch[1].startsWith('@')) {
            colName = propMatch[1];
          }
        }
        if (colName && !dbFields.includes(colName)) {
          missing.push(colName);
        }
      }
    }

    if (missing.length > 0) {
      console.log(`⚠️ Table ${table} is missing columns:`, missing);
    } else {
      console.log(`✓ Table ${table} OK`);
    }
  }

  await conn.end();
}

checkAll().catch(console.error);

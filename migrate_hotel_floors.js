const mysql = require('mysql2');
const conn = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'bookingna',
});

async function runMigration() {
  conn.connect();

  const createFloorsTable = `
    CREATE TABLE IF NOT EXISTS hotel_floors (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      listing_id BIGINT UNSIGNED NOT NULL,
      floor_number INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_listing_floor (listing_id, floor_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  const createPhysicalRoomsTable = `
    CREATE TABLE IF NOT EXISTS hotel_physical_rooms (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      listing_id BIGINT UNSIGNED NOT NULL,
      floor_id BIGINT UNSIGNED NOT NULL,
      room_type_id BIGINT UNSIGNED NOT NULL,
      room_number VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'available',
      clean_status VARCHAR(50) NOT NULL DEFAULT 'clean',
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_listing_rooms (listing_id),
      KEY idx_floor (floor_id),
      KEY idx_room_type (room_type_id),
      UNIQUE KEY uq_listing_room_number (listing_id, room_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await conn.promise().query(createFloorsTable);
  console.log('✅ Created table hotel_floors');

  await conn.promise().query(createPhysicalRoomsTable);
  console.log('✅ Created table hotel_physical_rooms');

  // Seed sample floors & rooms for Hotel 1599 (Khách sạn Trường Sơn Cửa Lò) if empty
  const [existingFloors] = await conn.promise().query(
    'SELECT * FROM hotel_floors WHERE listing_id = 1599',
  );

  if (existingFloors.length === 0) {
    // Insert 3 floors
    const [resF1] = await conn.promise().query(
      'INSERT INTO hotel_floors (listing_id, floor_number, name) VALUES (1599, 1, "Tầng 1")',
    );
    const [resF2] = await conn.promise().query(
      'INSERT INTO hotel_floors (listing_id, floor_number, name) VALUES (1599, 2, "Tầng 2")',
    );
    const [resF3] = await conn.promise().query(
      'INSERT INTO hotel_floors (listing_id, floor_number, name) VALUES (1599, 3, "Tầng 3")',
    );

    const f1Id = resF1.insertId;
    const f2Id = resF2.insertId;
    const f3Id = resF3.insertId;

    // Room types for 1599: 667 (Phòng 1 giường đôi), 668 (Phòng 2 giường), 941 (VIP)
    // Tầng 1: 101, 102, 103 (type 667), 104, 105 (type 668)
    const roomsToInsert = [
      [1599, f1Id, 667, '101', 'available'],
      [1599, f1Id, 667, '102', 'available'],
      [1599, f1Id, 667, '103', 'available'],
      [1599, f1Id, 668, '104', 'available'],
      [1599, f1Id, 668, '105', 'occupied'],
      // Tầng 2: 201, 202 (type 667), 203 (type 668), 204 (type 941)
      [1599, f2Id, 667, '201', 'available'],
      [1599, f2Id, 667, '202', 'booked'],
      [1599, f2Id, 668, '203', 'available'],
      [1599, f2Id, 941, '204', 'available'],
      // Tầng 3: 301 (type 941)
      [1599, f3Id, 941, '301', 'available'],
    ];

    await conn.promise().query(
      'INSERT INTO hotel_physical_rooms (listing_id, floor_id, room_type_id, room_number, status) VALUES ?',
      [roomsToInsert],
    );
    console.log('✅ Seeded 3 floors and 10 physical rooms for Hotel 1599');
  } else {
    console.log('ℹ️ Hotel 1599 already has floors');
  }

  // Also seed for 1559 (Dương Gia) if needed
  const [existing1559] = await conn.promise().query(
    'SELECT * FROM hotel_floors WHERE listing_id = 1559',
  );
  if (existing1559.length === 0) {
    const [resDG1] = await conn.promise().query(
      'INSERT INTO hotel_floors (listing_id, floor_number, name) VALUES (1559, 1, "Tầng 1")',
    );
    const [resDG2] = await conn.promise().query(
      'INSERT INTO hotel_floors (listing_id, floor_number, name) VALUES (1559, 2, "Tầng 2")',
    );
    const dg1Id = resDG1.insertId;
    const dg2Id = resDG2.insertId;

    // Room 511 is Phòng 2 giường đôi for 1559
    const dgRooms = [
      [1559, dg1Id, 511, '101', 'available'],
      [1559, dg1Id, 511, '102', 'available'],
      [1559, dg1Id, 511, '103', 'occupied'],
      [1559, dg2Id, 511, '201', 'available'],
      [1559, dg2Id, 511, '202', 'available'],
    ];
    await conn.promise().query(
      'INSERT INTO hotel_physical_rooms (listing_id, floor_id, room_type_id, room_number, status) VALUES ?',
      [dgRooms],
    );
    console.log('✅ Seeded floors and rooms for Hotel 1559');
  }

  conn.end();
}

runMigration().catch((err) => {
  console.error('Migration error:', err);
  conn.end();
});

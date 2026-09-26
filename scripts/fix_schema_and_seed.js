const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

async function addColumnIfNotExists(conn, table, column, definition) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (cols.length === 0) {
    try {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`✅ Added column \`${column}\` to table \`${table}\``);
    } catch (err) {
      console.warn(`⚠️ Error adding \`${column}\` to \`${table}\`:`, err.message);
    }
  } else {
    console.log(`ℹ️ Column \`${column}\` already exists in \`${table}\``);
  }
}

async function fixSchemaAndSeed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('Connected to DB:', process.env.DB_HOST);

  // 1. Add missing columns safely
  await addColumnIfNotExists(conn, 'menu_items', 'original_price', 'INT NULL DEFAULT NULL AFTER `price`');
  await addColumnIfNotExists(conn, 'hotel_rooms', 'total_rooms', 'INT NOT NULL DEFAULT 5 AFTER `capacity`');
  await addColumnIfNotExists(conn, 'hotel_rooms', 'original_price', 'INT NULL DEFAULT NULL AFTER `price`');
  await addColumnIfNotExists(conn, 'hotel_reservations', 'booking_code', 'VARCHAR(50) NULL AFTER `id`');
  await addColumnIfNotExists(conn, 'hotel_reservations', 'number_of_rooms', 'INT NOT NULL DEFAULT 1 AFTER `children`');
  await addColumnIfNotExists(conn, 'hotel_reservations', 'number_of_nights', 'INT NOT NULL DEFAULT 1 AFTER `checkin_time`');
  await addColumnIfNotExists(conn, 'hotel_reservations', 'physical_room_id', 'BIGINT NULL AFTER `room_type`');
  await addColumnIfNotExists(conn, 'hotel_reservations', 'room_number', 'VARCHAR(50) NULL AFTER `physical_room_id`');
  await addColumnIfNotExists(conn, 'listings', 'is_flash_sale_active', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfNotExists(conn, 'listings', 'active_discount_pct', 'INT NOT NULL DEFAULT 0');

  // 2. Check menu items count
  const [mCount] = await conn.query('SELECT COUNT(*) AS total FROM menu_items');
  console.log('Current menu_items count in DB:', mCount[0].total);

  if (mCount[0].total === 0) {
    console.log('Seeding initial menu items for all food and cafe listings...');
    const foodTemplates = [
      // Lươn
      { keywords: ['lươn'], items: [
        { name: 'Súp Lươn Niêu Đất Xứ Nghệ', price: 45000, orig: 55000, cat: 'Đặc sản Nghệ An', desc: 'Lươn đồng tươi xào cay nồng ăn kèm bánh mì giòn hoặc bánh mướt' },
        { name: 'Miến Lươn Xào Giòn Đặc Biệt', price: 55000, orig: 65000, cat: 'Đặc sản Nghệ An', desc: 'Miến xào lươn giòn rụm thơm nức mùi mộc nhĩ răm tía' },
        { name: 'Cháo Lươn Đồng Đậm Vị 37', price: 40000, orig: null, cat: 'Đặc sản Nghệ An', desc: 'Cháo sánh mịn thơm béo vị nghệ và lươn tươi' }
      ]},
      // Bánh mướt
      { keywords: ['bánh mướt', 'bánh cuốn'], items: [
        { name: 'Bánh Mướt Xáo Lòng Nóng Hổi', price: 35000, orig: 45000, cat: 'Bánh mướt', desc: 'Bánh mướt tráng tay mềm mướt ăn kèm xáo lòng heo đậm đà' },
        { name: 'Bánh Mướt Giò Lụa Chả Cuốn', price: 30000, orig: null, cat: 'Bánh mướt', desc: 'Bánh mướt nóng hành phi giòn tan chấm nước mắm ớt chanh' },
        { name: 'Bánh Mướt Thịt Nướng Than Hoa', price: 40000, orig: 50000, cat: 'Bánh mướt', desc: 'Thịt xiên nướng than hoa thơm lừng ăn cùng bánh mướt' }
      ]},
      // Phở
      { keywords: ['phở'], items: [
        { name: 'Phở Bò Tái Lăn Nạp Gầu', price: 50000, orig: 60000, cat: 'Phở truyền thống', desc: 'Nước dùng ninh xương 12 tiếng thơm ngậy hành hoa' },
        { name: 'Phở Đặc Biệt Bò Tái Nạm Trứng Chần', price: 60000, orig: 75000, cat: 'Phở truyền thống', desc: 'Bát phở bò đầy đặn kèm 2 trứng chần béo ngậy' },
        { name: 'Quẩy Giòn Nóng', price: 5000, orig: null, cat: 'Ăn kèm', desc: 'Quẩy chiên vàng giòn rụm' }
      ]},
      // Bún
      { keywords: ['bún'], items: [
        { name: 'Bún Bò Huế Đầy Đủ Giò Chả Cua', price: 55000, orig: 65000, cat: 'Bún ngon', desc: 'Bún bò chuẩn vị Huế, giò heo giòn ngậy, chả cua đậm đà' },
        { name: 'Bún Đậu Mắm Tôm Đặc Biệt', price: 50000, orig: 60000, cat: 'Bún ngon', desc: 'Đậu hũ chiên lướt ván, thịt chân giò luộc, dồi sụn rán' },
        { name: 'Bún Chả Hà Nội Nướng Than Hoa', price: 45000, orig: null, cat: 'Bún ngon', desc: 'Chả viên chả miếng nướng thơm phức ăn kèm đu đủ bóp' }
      ]},
      // Cơm
      { keywords: ['cơm'], items: [
        { name: 'Cơm Gà Xối Mỡ Giòn Rụm', price: 48000, orig: 60000, cat: 'Cơm ngon', desc: 'Đùi gà xối mỡ da giòn rụm kèm cơm dẻo hạt ngọc' },
        { name: 'Cơm Tấm Sườn Nướng Chả Trứng', price: 45000, orig: 55000, cat: 'Cơm ngon', desc: 'Sườn nướng tẩm ướp đậm đà, chả trứng hấp béo ngậy' },
        { name: 'Cơm Thố Chảo Xèo Bò Mỹ', price: 55000, orig: 70000, cat: 'Cơm ngon', desc: 'Cơm cháy thố gang xèo xèo bò Mỹ sốt tiêu đen' }
      ]},
      // Ốc & Ăn vặt
      { keywords: ['ốc', 'ăn vặt', 'chick', 'gà rán', 'nem', 'quán'], items: [
        { name: 'Ốc Bươu Xào Sả Ớt Cay Nồng', price: 45000, orig: 55000, cat: 'Ốc & Ăn vặt', desc: 'Ốc bươu đồng béo ngậy xào sả ớt lá chanh cay xuýt xoa' },
        { name: 'Ốc Mỡ Xào Bơ Tỏi Bánh Mì', price: 65000, orig: 75000, cat: 'Ốc & Ăn vặt', desc: 'Ốc mỡ tươi giòn béo sốt bơ tỏi ăn kèm bánh mì nóng' },
        { name: 'Gà Rán Sốt Cay Phủ Phô Mai', price: 45000, orig: 55000, cat: 'Ốc & Ăn vặt', desc: 'Gà rán giòn rụm sốt cay béo kéo sợi phô mai' },
        { name: 'Nem Chua Rán Hà Nội Phố', price: 35000, orig: null, cat: 'Ốc & Ăn vặt', desc: 'Nem chua rán nóng giòn chấm tương ớt cay ngọt' }
      ]},
      // Hải sản & Lẩu & Nhà hàng
      { keywords: ['hải sản', 'lẩu', 'khói', 'nhà hàng', 'garden', 'cáo', 'bất ổn'], items: [
        { name: 'Lẩu Hải Sản Chua Cay TP Vinh', price: 189000, orig: 220000, cat: 'Lẩu & Hải sản', desc: 'Nước lẩu Thái chua cay thơm nức tôm mực ngao tươi' },
        { name: 'Mực Trứng Nướng Sa Tế', price: 125000, orig: 150000, cat: 'Lẩu & Hải sản', desc: 'Mực trứng nướng thơm phức chấm muối ớt xanh' },
        { name: 'Bò Nhúng Dấm Nồi Đất', price: 150000, orig: 180000, cat: 'Lẩu & Hải sản', desc: 'Thịt bò tươi nhúng dấm chua thanh kèm bánh tráng rau sống' }
      ]},
    ];

    const cafeTemplates = [
      // Trà sữa / Trà
      { keywords: ['trà sữa', 'limi', 'lụa', 'zaocha', 'tea', 'trà'], items: [
        { name: 'Trà Sữa Trân Châu Ô Long Nướng', price: 38000, orig: 45000, cat: 'Trà sữa Signature', desc: 'Trân châu đen giòn dẻo, trà ô long nướng đậm đà' },
        { name: 'Trà Sữa Kem Trứng Nướng cháy', price: 42000, orig: 50000, cat: 'Trà sữa Signature', desc: 'Lớp kem trứng thơm ngậy khò đường dừa nướng' },
        { name: 'Trà Đào Cam Sả Tươi Mát', price: 35000, orig: null, cat: 'Trà trái cây', desc: 'Miếng đào giòn ngon hòa quyện hương sả và cam tươi' }
      ]},
      // Cafe / Coffee
      { keywords: ['coffee', 'cafe', 'cà phê', 'cozy', 'gấu', 'la mây', 'phúc', 'xanh', 'l.a.k'], items: [
        { name: 'Cà Phê Muối Kem Béo Xứ Nghệ', price: 29000, orig: 35000, cat: 'Cà phê đặc sản', desc: 'Cà phê phin truyền thống phủ lớp kem muối mặn béo ngậy' },
        { name: 'Bacxiu Sữa Dừa Đá Xay', price: 35000, orig: 42000, cat: 'Cà phê đặc sản', desc: 'Hương vị béo thơm cốt dừa kết hợp cà phê espresso' },
        { name: 'Matcha Latte Cream Cheese', price: 42000, orig: 48000, cat: 'Đồ uống hiện đại', desc: 'Trà xanh Uji Nhật Bản kết hợp màng kem phô mai béo ngậy' },
        { name: 'Bánh Tiramisu Ca Cao Pháp', price: 32000, orig: null, cat: 'Bánh ngọt', desc: 'Bánh kem mềm xốp đậm đà vị cacao espresso' }
      ]}
    ];

    const [listings] = await conn.query(
      "SELECT id, name, type FROM listings WHERE type IN ('food', 'cafe', 'restaurant')"
    );

    console.log(`Found ${listings.length} listings. Inserting menu items...`);
    let values = [];

    for (const l of listings) {
      const nameLower = (l.name || '').toLowerCase();
      const isCafe = l.type === 'cafe' || nameLower.includes('coffee') || nameLower.includes('cafe') || nameLower.includes('trà');

      let chosenTemplate = null;
      if (isCafe) {
        for (const t of cafeTemplates) {
          if (t.keywords.some((k) => nameLower.includes(k))) {
            chosenTemplate = t;
            break;
          }
        }
        if (!chosenTemplate) chosenTemplate = cafeTemplates[1];
      } else {
        for (const t of foodTemplates) {
          if (t.keywords.some((k) => nameLower.includes(k))) {
            chosenTemplate = t;
            break;
          }
        }
        if (!chosenTemplate) chosenTemplate = foodTemplates[4]; // Cơm default
      }

      const itemsToInsert = chosenTemplate.items;
      for (let i = 0; i < itemsToInsert.length; i++) {
        const it = itemsToInsert[i];
        values.push([l.id, it.name, it.desc, it.price, it.orig, it.cat, 1, i + 1]);
      }
    }

    // Batch insert 500 rows at a time
    const batchSize = 500;
    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      await conn.query(
        'INSERT INTO menu_items (listing_id, name, description, price, original_price, category_name, is_available, iorder) VALUES ?',
        [batch]
      );
      console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} items)...`);
    }
    console.log(`🎉 Successfully seeded ${values.length} menu items for ${listings.length} restaurants & cafes!`);
  }

  await conn.end();
}

fixSchemaAndSeed().catch(console.error);

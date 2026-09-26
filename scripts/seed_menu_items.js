const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function seedMenuItems() {
  if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production' || process.env.DB_HOST === 'db') {
    console.error('⛔ CẢNH BÁO AN TOÀN: Không chạy script seed mẫu trên môi trường PRODUCTION!');
    process.exit(1);
  }

  console.log('Seeding menu_items for food & cafe listings...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'bookingna',
  });

  try {
    const [listings] = await connection.query(
      "SELECT id, name, type FROM listings WHERE type IN ('food', 'cafe', 'restaurant')"
    );

    console.log(`Found ${listings.length} food & cafe listings.`);

    const sampleFoodMenus = [
      { cat: 'Món chính', name: 'Cơm tấm sườn chả đặc biệt', price: 45000, desc: 'Sườn nướng thảo mộc, chả trứng hấp, nước mắm kẹo' },
      { cat: 'Món chính', name: 'Phở bò tái lăn đặc sản', price: 50000, desc: 'Nước dùng ninh xương 12h, thịt bò tái mềm mọng' },
      { cat: 'Món chính', name: 'Bún bò Huế giò heo', price: 48000, desc: 'Bún sợi to, giò heo giòn béo, chả cua chuẩn vị' },
      { cat: 'Ăn kèm', name: 'Nem rán Hà Nội (5 cái)', price: 30000, desc: 'Chiên giòn rụm kèm rau sống chấm nước mắm chua ngọt' },
      { cat: 'Đồ uống', name: 'Trà tắc xí muội mát lạnh', price: 18000, desc: 'Giải nhiệt ngày hè, vị chua thanh ngọt hậu' },
    ];

    const sampleCafeMenus = [
      { cat: 'Đồ uống nổi bật', name: 'Trà sữa Trân Châu Hoàng Gia (Size L)', price: 38000, desc: 'Trân châu đường đen dai giòn, đậm đà vị trà' },
      { cat: 'Cà phê signature', name: 'Cà phê Muối Xứ Nghệ', price: 29000, desc: 'Lớp bọt kem muối béo ngậy kết hợp cà phê phin đậm' },
      { cat: 'Cà phê signature', name: 'Bacxiu Kem Béo', price: 32000, desc: 'Cà phê phin hòa quyện sữa tươi thanh trùng & sữa đặc' },
      { cat: 'Trà hoa quả', name: 'Trà Đào Cam Sả mát lạnh', price: 35000, desc: 'Miếng đào giòn sần sật thơm nức hương sả tươi' },
      { cat: 'Bánh ngọt', name: 'Bánh Tiramisu ca cao', price: 25000, desc: 'Bánh mềm xốp thơm mùi cà phê espresso' },
    ];

    let totalInserted = 0;
    for (const l of listings) {
      const [existing] = await connection.query('SELECT COUNT(*) as count FROM menu_items WHERE listing_id = ?', [l.id]);
      if (existing[0].count > 0) continue;

      const isCafe = l.type === 'cafe' || l.name.toLowerCase().includes('coffee') || l.name.toLowerCase().includes('trà');
      const menuList = isCafe ? sampleCafeMenus : sampleFoodMenus;

      for (let i = 0; i < menuList.length; i++) {
        const item = menuList[i];
        await connection.query(
          'INSERT INTO menu_items (listing_id, name, description, price, category_name, is_available, iorder) VALUES (?, ?, ?, ?, ?, 1, ?)',
          [l.id, `${item.name}`, item.desc, item.price, item.cat, i + 1]
        );
        totalInserted++;
      }
    }

    console.log(`Successfully seeded ${totalInserted} menu items for listings!`);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await connection.end();
  }
}

seedMenuItems();

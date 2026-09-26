const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const foodTemplates = [
  // Lươn
  { keywords: ['lươn'], items: [
    { name: 'Súp Lươn Niêu Đất Xứ Nghệ', price: 45000, cat: 'Đặc sản Nghệ An', desc: 'Lươn đồng tươi xào cay nồng ăn kèm bánh mì giòn hoặc bánh mướt' },
    { name: 'Miến Lươn Xào Giòn Đặc Biệt', price: 55000, cat: 'Đặc sản Nghệ An', desc: 'Miến xào lươn giòn rụm thơm nức mùi mộc nhĩ răm tía' },
    { name: 'Cháo Lươn Đồng Đậm Vị 37', price: 40000, cat: 'Đặc sản Nghệ An', desc: 'Cháo sánh mịn thơm béo vị nghệ và lươn tươi' }
  ]},
  // Phở
  { keywords: ['phở'], items: [
    { name: 'Phở Bò Tái Lăn Nạp Gầu', price: 50000, cat: 'Phở truyền thống', desc: 'Nước dùng ninh xương 12 tiếng thơm ngậy hành hoa' },
    { name: 'Phở Đặc Biệt Bò Tái Nạm Trứng Chần', price: 60000, cat: 'Phở truyền thống', desc: 'Bát phở bò đầy đặn kèm 2 trứng chần béo ngậy' },
    { name: 'Quẩy Giòn Nóng', price: 5000, cat: 'Ăn kèm', desc: 'Quẩy chiên vàng giòn rụm' }
  ]},
  // Bún
  { keywords: ['bún'], items: [
    { name: 'Bún Bò Huế Đầy Đủ Giò Chả Cua', price: 55000, cat: 'Bún ngon', desc: 'Bún bò chuẩn vị Huế, giò heo giòn ngậy, chả cua đậm đà' },
    { name: 'Bún Đậu Mắm Tôm Đặc Biệt', price: 50000, cat: 'Bún ngon', desc: 'Đậu hũ chiên lướt ván, thịt chân giò luộc, dồi sụn rán' },
    { name: 'Bún Chả Hà Nội Nướng Than Hoa', price: 45000, cat: 'Bún ngon', desc: 'Chả viên chả miếng nướng thơm phức ăn kèm đu đủ bóp' }
  ]},
  // Cơm
  { keywords: ['cơm'], items: [
    { name: 'Cơm Gà Xối Mỡ Giòn Rụm', price: 48000, cat: 'Cơm ngon', desc: 'Đùi gà xối mỡ da giòn rụm kèm cơm dẻo hạt ngọc' },
    { name: 'Cơm Tấm Sườn Nướng Chả Trứng', price: 45000, cat: 'Cơm ngon', desc: 'Sườn nướng tẩm ướp đậm đà, chả trứng hấp béo ngậy' },
    { name: 'Cơm Thố Chảo Xèo Bò Mỹ', price: 55000, cat: 'Cơm ngon', desc: 'Cơm cháy thố gang xèo xèo bò Mỹ sốt tiêu đen' }
  ]},
  // Ốc & Ăn vặt
  { keywords: ['ốc', 'ăn vặt', 'chick'], items: [
    { name: 'Ốc Mỡ Xào Bơ Tỏi Bánh Mì', price: 65000, cat: 'Món nhậu & Ăn vặt', desc: 'Ốc mỡ tươi giòn béo sốt bơ tỏi ăn kèm bánh mì nóng' },
    { name: 'Ốc Hương Sốt Trứng Muối', price: 85000, cat: 'Món nhậu & Ăn vặt', desc: 'Ốc hương giòn sần sật quyện sốt trứng muối béo béo' },
    { name: 'Gà Rán Sốp Cay Phủ Phô Mai', price: 45000, cat: 'Món nhậu & Ăn vặt', desc: 'Gà rán giòn rụm sốt cay béo kéo sợi phô mai' }
  ]},
  // Hải sản & Lẩu
  { keywords: ['hải sản', 'lẩu', 'khói', 'nhà hàng'], items: [
    { name: 'Lẩu Hải Sản Chua Cay TP Vinh', price: 189000, cat: 'Lẩu & Hải sản', desc: 'Nước lẩu Thái chua cay thơm nức tôm mực ngao tươi' },
    { name: 'Mực Trứng Nướng Sa Tế', price: 125000, cat: 'Lẩu & Hải sản', desc: 'Mực trứng nướng thơm phức chấm muối ớt xanh' },
    { name: 'Bò Nhúng Dấm Nồi Đất', price: 150000, cat: 'Lẩu & Hải sản', desc: 'Thịt bò tươi nhúng dấm chua thanh kèm bánh tráng rau sống' }
  ]},
];

const cafeTemplates = [
  // Trà sữa / Trà
  { keywords: ['trà sữa', 'limi', 'lụa', 'zaocha'], items: [
    { name: 'Trà Sữa Trân Châu Ô Long Nướng', price: 38000, cat: 'Trà sữa Signature', desc: 'Trân châu đen giòn dẻo, trà ô long nướng đậm đà' },
    { name: 'Trà Sữa Kem Trứng Nướng cháy', price: 42000, cat: 'Trà sữa Signature', desc: 'Lớp kem trứng thơm ngậy khò đường dừa nướng' },
    { name: 'Trà Đào Cam Sả Tươi Mát', price: 35000, cat: 'Trà trái cây', desc: 'Miếng đào giòn ngon hòa quyện hương sả và cam tươi' }
  ]},
  // Cafe / Coffee
  { keywords: ['coffee', 'cafe', 'cà phê', 'cozy', 'gấu', 'la mây', 'phúc', 'xanh', 'l.a.k'], items: [
    { name: 'Cà Phê Muối Kem Béo Xứ Nghệ', price: 29000, cat: 'Cà phê đặc sản', desc: 'Cà phê phin truyền thống phủ lớp kem muối mặn béo ngậy' },
    { name: 'Bacxiu Sữa Dừa Đá Xay', price: 35000, cat: 'Cà phê đặc sản', desc: 'Hương vị béo thơm cốt dừa kết hợp cà phê espresso' },
    { name: 'Matcha Latte Cream Cheese', price: 42000, cat: 'Đồ uống hiện đại', desc: 'Trà xanh Uji Nhật Bản kết hợp màng kem phô mai béo ngậy' },
    { name: 'Bánh Tiramisu Ca Cao Pháp', price: 32000, cat: 'Bánh ngọt', desc: 'Bánh kem mềm xốp đậm đà vị cacao espresso' }
  ]}
];

async function seedVariedMenuItems() {
  if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production' || process.env.DB_HOST === 'db') {
    console.error('⛔ CẢNH BÁO AN TOÀN: Không được phép chạy script seed/truncate trên môi trường PRODUCTION!');
    process.exit(1);
  }

  console.log('Seeding unique & varied menu items into MySQL...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'bookingna',
  });

  try {
    // Truncate menu_items table to refresh with unique dishes (local dev only)
    await connection.query('TRUNCATE TABLE menu_items');
    console.log('Cleared old menu_items table.');

    const [listings] = await connection.query(
      "SELECT id, name, type FROM listings WHERE type IN ('food', 'cafe', 'restaurant')"
    );

    console.log(`Found ${listings.length} food & cafe listings.`);

    let insertedCount = 0;

    for (const l of listings) {
      const nameLower = l.name.toLowerCase();
      const isCafe = l.type === 'cafe' || nameLower.includes('coffee') || nameLower.includes('cafe') || nameLower.includes('trà');

      let chosenTemplate = null;

      if (isCafe) {
        for (const t of cafeTemplates) {
          if (t.keywords.some((k) => nameLower.includes(k))) {
            chosenTemplate = t;
            break;
          }
        }
        if (!chosenTemplate) chosenTemplate = cafeTemplates[1]; // default cafe
      } else {
        for (const t of foodTemplates) {
          if (t.keywords.some((k) => nameLower.includes(k))) {
            chosenTemplate = t;
            break;
          }
        }
        if (!chosenTemplate) chosenTemplate = foodTemplates[3]; // default cơm
      }

      // Insert items for this listing
      const itemsToInsert = chosenTemplate.items;
      for (let i = 0; i < itemsToInsert.length; i++) {
        const item = itemsToInsert[i];
        await connection.query(
          'INSERT INTO menu_items (listing_id, name, description, price, category_name, is_available, iorder) VALUES (?, ?, ?, ?, ?, 1, ?)',
          [l.id, item.name, item.desc, item.price, item.cat, i + 1]
        );
        insertedCount++;
      }
    }

    console.log(`Successfully inserted ${insertedCount} unique & varied dishes across all ${listings.length} listings!`);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await connection.end();
  }
}

seedVariedMenuItems();

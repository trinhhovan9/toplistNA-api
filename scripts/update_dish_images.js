const mysql = require('mysql2/promise');

const dishImageMap = {
  // Cafe & Drinks
  'Cà Phê Muối Kem Béo Xứ Nghệ': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Cà Phê Muối Kem Béo 37': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Cà phê Muối Xứ Nghệ': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Cà Phê Muối Kem Béo Đậm Đà': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Cà Phê Muối Kem Béo': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Bacxiu Sữa Dừa Đá Xay': 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=500&q=80',
  'Matcha Latte Cream Cheese': 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=500&q=80',
  'Bánh Tiramisu Ca Cao Pháp': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=500&q=80',
  'Trà Sữa Trân Châu Ô Long Nướng': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
  'Trà Sữa Kem Trứng Nướng cháy': 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=500&q=80',
  'Trà Đào Cam Sả Tươi Mát': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Trà Sữa Ô Long Nướng Trân Châu Hoàng Kim': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
  'Trà Đào Cam Sả Thạch Nha Đam': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  'Sữa Tươi Trân Châu Đường Đen Kem Cheese': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
  'Trà Sen Vàng Macchiato Bùi Béo': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
  
  // Cơm
  'Cơm Gà Xối Mỡ Giòn Rụm': 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80',
  'Cơm Tấm Sườn Nướng Chả Trứng': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80',
  'Cơm Thố Chảo Xèo Bò Mỹ': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  
  // Lẩu & Hải sản & Bò
  'Lẩu Hải Sản Chua Cay TP Vinh': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80',
  'Mực Trứng Nướng Sa Tế': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bò Nhúng Dấm Nồi Đất': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Lẩu Riêu Cua Đồng Bắp Bò Sườn Sụn': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80',
  'Bò Né Sốt Tiêu Đen Trứng Ốp La': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Bò Né Thập Cẩm Pate Phô Mai Xíu Mại': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Bánh Mì Chảo Bò Lúc Lắc Khoai Tây': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Bê Chao Mộc Châu Sả Ớt Cay Nồng': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Gà Đồi Nướng Mọi Than Hoa': 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80',

  // Ốc & Fastfood & Ăn vặt
  'Ốc Mỡ Xào Bơ Tỏi Bánh Mì': 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=500&q=80',
  'Ốc Hương Sốt Trứng Muối': 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=500&q=80',
  'Gà Rán Sốp Cay Phủ Phô Mai': 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
  'Gà Rán Giòn Rụm Test': 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
  'Gà Rán Sốt Cay Ngọt Hàn Quốc': 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
  'Gà Giòn Phủ Phô Mai Tuyết': 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
  'Khoai Tây Chiên Giòn Test': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80',
  'Khoai Tây Lắc Phô Mai Giòn Tan': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80',

  // Bún & Phở
  'Bún Bò Huế Đầy Đủ Giò Chả Cua': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
  'Bún Đậu Mắm Tôm Đặc Biệt': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=500&q=80',
  'Bún Chả Hà Nội Nướng Than Hoa': 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=500&q=80',
  'Phở Bò Tái Lăn Nạp Gầu': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
  'Phở Đặc Biệt Bò Tái Nạm Trứng Chần': 'https://images.unsplash.com/photo-1576577445504-6af96477db52?auto=format&fit=crop&w=500&q=80',
  'Phở Bò Tái Nạm Gầu Giòn Lê Hồng Phong': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
  'Phở Tái Lăn Áp Chảo Thơm Lừng': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
  'Phở Sốt Vang Bò Mềm Đậm Vị': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80',
  'Quẩy Giòn Nóng': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80',
  'Nem nướng nha trang': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',

  // Đặc sản xứ Nghệ (Lươn & Bánh mướt)
  'Súp Lươn Niêu Đất Xứ Nghệ': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Miến Lươn Xào Giòn Đặc Biệt': 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80',
  'Cháo Lươn Đồng Đậm Vị 37': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=500&q=80',
  'Súp Lươn Cay Nghệ An Kèm Bánh Mướt': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Cháo Lươn Đồng Xào Nghệ Vàng': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=500&q=80',
  'Miến Lươn Xào Mộc Nhĩ Nấm Hương': 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80',
  'Lươn Xào Sả Ớt Xúc Bánh Đa Đô Lương': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Súp Lươn Cay Gia Truyền Bà Hường': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Miến Lươn Nước Ngọt Thanh Niêu Đất': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Lươn Om Chuối Đậu Niêu Đất': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Nóng Chấm Sốt Lươn Cay': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Súp Lươn Niêu Đất Mai Hắc Đế': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Cháo Lươn Gạo Tẻ Nấu Nhừ': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=500&q=80',
  'Miến Lươn Giòn Sốt Me Chua Ngọt': 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80',
  'Lươn Niêu Đất Tùng Lâm Đặc Biệt': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80',
  'Miến Lươn Trộn Sốt Tương Cay': 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80',
  'Cháo Lươn Hạt Sen Bổ Dưỡng': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Nóng Giò Lụa Hành Phi': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Ram Cuốn Giòn Rụm': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Xáo Lòng Heo Nóng Hổi': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Chả Cuốn Nóng Hổi': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Xáo Gà Ta Thả Vườn': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80',
  'Bánh Mướt Xáo Vịt Cỏ Nghệ An': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80'
};

function matchCulinaryImage(name, cat) {
  if (dishImageMap[name]) return dishImageMap[name];
  const n = (name || '').toLowerCase();
  const c = (cat || '').toLowerCase();

  if (n.includes('cà phê muối') || n.includes('cafe muối')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('bacxiu') || n.includes('bạc xỉu') || n.includes('sữa dừa')) {
    return 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('matcha') || n.includes('latte') || n.includes('cream cheese')) {
    return 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('tiramisu') || n.includes('bánh')) {
    return 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('trà sữa') || n.includes('boba') || n.includes('ô long')) {
    return 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('trà') || n.includes('tea') || n.includes('đào')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('cà phê') || n.includes('coffee') || c.includes('cà phê')) {
    return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('cơm gà') || n.includes('xối mỡ')) {
    return 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('cơm tấm') || n.includes('sườn')) {
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('cơm') || c.includes('cơm')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('lươn') || c.includes('lươn')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('bánh mướt') || n.includes('bánh cuốn')) {
    return 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('phở') || c.includes('phở')) {
    return 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('bún') || c.includes('bún')) {
    return 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('lẩu') || c.includes('lẩu')) {
    return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('ốc') || n.includes('mực') || c.includes('hải sản')) {
    return 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('gà rán') || n.includes('gà')) {
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80';
  }
  if (n.includes('khoai tây') || n.includes('ăn vặt')) {
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80';
  }
  return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=80';
}

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'bookingna'
  });

  console.log('Connected to bookingna database...');

  // Update specific dish names in batch
  for (const [name, imgUrl] of Object.entries(dishImageMap)) {
    const [res] = await conn.execute(
      'UPDATE menu_items SET image_url = ? WHERE name = ?',
      [imgUrl, name]
    );
    if (res.affectedRows > 0) {
      console.log(`Updated ${res.affectedRows} items for "${name}"`);
    }
  }

  // Update any remaining items with image_url IS NULL
  const [remaining] = await conn.execute(
    'SELECT id, name, category_name FROM menu_items WHERE image_url IS NULL OR image_url = ""'
  );
  console.log(`Remaining dishes without image: ${remaining.length}`);

  for (const item of remaining) {
    const img = matchCulinaryImage(item.name, item.category_name);
    await conn.execute(
      'UPDATE menu_items SET image_url = ? WHERE id = ?',
      [img, item.id]
    );
  }

  const [afterCheck] = await conn.execute(
    'SELECT COUNT(*) as total, SUM(CASE WHEN image_url IS NOT NULL AND image_url != "" THEN 1 ELSE 0 END) as with_image, SUM(CASE WHEN image_url IS NULL OR image_url = "" THEN 1 ELSE 0 END) as without_image FROM menu_items'
  );
  console.log('Final menu_items count:', afterCheck[0]);

  await conn.end();
})();

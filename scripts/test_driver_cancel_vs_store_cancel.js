/**
 * Kịch bản kiểm thử tự động xác minh toàn diện 3 Quy Tắc:
 * 1. Quy tắc 1: Quán hủy đơn (Merchant Cancel) -> Hủy toàn bộ đơn và delivery FireGo.
 * 2. Quy tắc 2: Tài xế hủy chuyến (Driver Cancel) -> Đơn và Delivery VẪN SỐNG, tìm xe máy khác.
 * 3. Quy tắc 3: Sau khi đã bàn giao cho tài xế (shipping/delivering) -> Chặn hủy từ cả Quán và Tài xế.
 */

const TOPLISTNA_URL = 'http://localhost:3001';
const FIREGO_URL = 'http://localhost:3002';
const SECRET = 'firego_toplistna_secret_2026';

async function runTest() {
  console.log('===============================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG 3 QUY TẮC ĐIỀU PHỐI VÀ HỦY ĐƠN');
  console.log('===============================================================\n');

  // Helper fetch with JSON
  async function api(url, options = {}) {
    const res = await fetch(url, options);
    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, data: body };
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // =========================================================================
  // TEST CASE 1: QUY TẮC 2 - TÀI XẾ HỦY LƯỢT NHẬN (ĐƠN & DELIVERY VẪN SỐNG)
  // =========================================================================
  console.log('--- [KỊCH BẢN 1] QUY TẮC 2: TÀI XẾ HỦY LƯỢT NHẬN KHI ĐANG TỚI QUÁN ---');

  // 1. Tạo đơn giao hàng external trên FireGo đại diện cho ToplistNA
  const testOrderCode = 'OD_TEST_' + Math.floor(Math.random() * 100000);
  console.log(`1. Tạo FireGo delivery cho đơn #${testOrderCode}...`);
  const createRes = await api(`${FIREGO_URL}/api/deliveries/external`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({
      externalOrderId: testOrderCode,
      goodsType: 'food',
      weight: '<20',
      vehicle: 'bike',
      pickupAddress: '45 Lê Hồng Phong, TP Vinh',
      pickupCoordinates: [105.6881, 18.6732],
      dropoffAddress: '12 Quang Trung, TP Vinh',
      dropoffCoordinates: [105.6834, 18.6668],
      senderName: 'Quán Cơm Niêu Vinh',
      senderPhone: '0988123456',
      recipientName: 'Anh Tuấn',
      recipientPhone: '0912345678',
      estimatedPrice: 25000,
    }),
  });

  assert(createRes.ok, `Tạo delivery FireGo thành công (ID: ${createRes.data?.deliveryId})`);
  const deliveryId = createRes.data?.deliveryId;

  // 2. Lấy thông tin delivery
  const getDelivery = await api(`${FIREGO_URL}/api/deliveries/${deliveryId}`, {
    headers: { 'X-FireGo-Secret': SECRET },
  });
  assert(getDelivery.ok, 'Lấy chi tiết delivery thành công');

  // 3. Giả lập một tài xế xe máy A nhận đơn
  // Tìm tài xế trong MongoDB
  console.log('2. Giả lập tài xế xe máy A nhận đơn...');
  const mongoose = require('../../FireGoApp/backend/node_modules/mongoose');
  await mongoose.connect('mongodb+srv://dungjpitfpt:PpNcu63IBcVu9Nfi@natech.yzz43.mongodb.net/fire_go?retryWrites=true&w=majority&appName=NATECH');
  const db = mongoose.connection.db;

  const sampleDriver = await db.collection('drivers').findOne({
    isOnline: true,
    vehicleType: { $in: ['motorcycle', 'motorbike', 'bike'] },
  });

  const driverAId = sampleDriver ? sampleDriver._id.toString() : new mongoose.Types.ObjectId().toString();

  // Gán tài xế A vào delivery ở trạng thái DRIVER_ASSIGNED
  await db.collection('deliveries').updateOne(
    { _id: new mongoose.Types.ObjectId(deliveryId) },
    {
      $set: {
        driverId: new mongoose.Types.ObjectId(driverAId),
        status: 'driver_assigned',
      },
    }
  );

  // Tạo assignment request của tài xế A
  await db.collection('deliveryassignmentrequests').insertOne({
    deliveryId: new mongoose.Types.ObjectId(deliveryId),
    driverId: new mongoose.Types.ObjectId(driverAId),
    status: 'accepted',
    respondedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`   Tài xế A (${driverAId}) đã nhận cuốc. Trạng thái: driver_assigned.`);

  // 4. Tài xế A bấm HỦY cuốc trước khi lấy món -> Gọi driver-cancel
  console.log('3. Tài xế A gọi POST /api/deliveries/:id/driver-cancel...');
  const driverCancelRes = await api(`${FIREGO_URL}/api/deliveries/${deliveryId}/driver-cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({
      driverId: driverAId,
      reason: 'Xe thủng lốp đột xuất',
    }),
  });

  assert(driverCancelRes.ok, `driver-cancel thành công: ${driverCancelRes.data?.message}`);
  assert(driverCancelRes.data?.status === 'finding_driver', 'Delivery chuyển về status: finding_driver');

  // 5. Kiểm tra trong DB:
  const updatedDelivery = await db.collection('deliveries').findOne({ _id: new mongoose.Types.ObjectId(deliveryId) });
  assert(updatedDelivery.status === 'finding_driver', 'FireGo Delivery VẪN SỐNG và ở trạng thái finding_driver');
  assert(updatedDelivery.driverId === null, 'FireGo Delivery đã xóa driverId cũ');
  const hasAInRejected = updatedDelivery.rejectedDriverIds?.some((id) => id.toString() === driverAId);
  assert(hasAInRejected, 'Tài xế A đã được thêm vào danh sách loại trừ rejectedDriverIds');

  const driverADoc = await db.collection('drivers').findOne({ _id: new mongoose.Types.ObjectId(driverAId) });
  if (driverADoc) {
    assert(driverADoc.isAvailable === true, 'Tài xế A đã được giải phóng (isAvailable: true)');
  }

  const assignmentA = await db.collection('deliveryassignmentrequests').findOne({
    deliveryId: new mongoose.Types.ObjectId(deliveryId),
    driverId: new mongoose.Types.ObjectId(driverAId),
  });
  assert(assignmentA.status === 'cancelled', 'Lượt assignment của tài xế A đã chuyển sang cancelled');

  // =========================================================================
  // TEST CASE 2: QUY TẮC 1 - QUÁN HỦY ĐƠN (MERCHANT CANCEL)
  // =========================================================================
  console.log('\n--- [KỊCH BẢN 2] QUY TẮC 1: QUÁN HỦY ĐƠN (MERCHANT CANCEL) ---');
  console.log('1. Quán gọi hủy delivery FireGo qua external/:id/cancel...');

  const storeCancelRes = await api(`${FIREGO_URL}/api/deliveries/external/${deliveryId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({ reason: 'Quán hết món, xin lỗi khách' }),
  });

  assert(storeCancelRes.ok, `Quán hủy delivery thành công: ${storeCancelRes.data?.message}`);
  assert(storeCancelRes.data?.status === 'cancelled', 'FireGo Delivery đã chuyển sang CANCELLED hoàn toàn');

  const cancelledDeliveryDoc = await db.collection('deliveries').findOne({ _id: new mongoose.Types.ObjectId(deliveryId) });
  assert(cancelledDeliveryDoc.status === 'cancelled', 'Delivery trong DB đã là cancelled');

  // =========================================================================
  // TEST CASE 3: QUY TẮC 3 - CHẶN HỦY KHI ĐÃ BÀN GIAO CHO TÀI XẾ (SHIPPING)
  // =========================================================================
  console.log('\n--- [KỊCH BẢN 3] QUY TẮC 3: CHẶN HỦY KHI ĐÃ GIAO MÓN (SHIPPING) ---');

  // Tạo delivery mới và set sang 'delivering'
  const deliv3 = await db.collection('deliveries').insertOne({
    externalOrderId: 'OD_SHIPPING_TEST',
    status: 'delivering',
    vehicle: 'bike',
    goodsType: 'food',
    pickupAddress: 'Vinh',
    pickupCoordinates: [105.6881, 18.6732],
    dropoffAddress: 'Vinh',
    dropoffCoordinates: [105.6834, 18.6668],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const deliv3Id = deliv3.insertedId.toString();

  console.log(`1. Thử gọi driver-cancel khi status = delivering...`);
  const tryDriverCancel = await api(`${FIREGO_URL}/api/deliveries/${deliv3Id}/driver-cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({ driverId: driverAId, reason: 'Muốn hủy' }),
  });
  assert(!tryDriverCancel.ok && tryDriverCancel.status === 400, 'Tài xế bị CHẶN không được hủy sau khi đã lấy món (400 Bad Request)');

  console.log(`2. Thử gọi quán hủy khi status = delivering...`);
  const tryStoreCancel = await api(`${FIREGO_URL}/api/deliveries/external/${deliv3Id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({ reason: 'Quán muốn hủy' }),
  });
  assert(!tryStoreCancel.ok && tryStoreCancel.status === 400, 'Quán bị CHẶN không được hủy sau khi đã bàn giao cho shipper (400 Bad Request)');

  // =========================================================================
  // TEST CASE 4: TOPLISTNA NHẬN WEBHOOK driver_cancelled (ĐƠN TOPLISTNA VẪN SỐNG)
  // =========================================================================
  console.log('\n--- [KỊCH BẢN 4] TOPLISTNA XỬ LÝ WEBHOOK driver_cancelled ---');
  // 1. Tạo đơn giả lập trong ToplistNA
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'bookingna',
  });

  const [orderInsert] = await pool.query(
    `INSERT INTO orders (order_code, user_id, listing_id, delivery_address, total_amount, order_status, firego_delivery_id, driver_name)
     VALUES (?, 817, 1, '45 Le Hong Phong, Vinh', 50000, 'preparing', ?, 'Tai Xe A')`,
    [testOrderCode, deliveryId]
  );
  const testOrderId = orderInsert.insertId;
  console.log(`1. Tạo đơn hàng ToplistNA #${testOrderId} (${testOrderCode}) với tài xế ban đầu là 'Tai Xe A'...`);

  // 2. Gửi webhook driver_cancelled từ FireGo sang ToplistNA
  console.log('2. Bắn webhook driver_cancelled sang ToplistNA API...');
  const webhookRes = await api(`${TOPLISTNA_URL}/api/firego/webhook/delivery-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({
      event: 'driver_cancelled',
      deliveryId: deliveryId,
      externalOrderId: testOrderCode,
      status: 'searching_driver',
      message: 'Tài xế trước đã hủy nhận cuốc, hệ thống đang điều phối tài xế xe máy khác...',
    }),
  });

  assert(webhookRes.ok, 'ToplistNA xử lý webhook driver_cancelled thành công');

  // 3. Kiểm tra trong MySQL: Đơn hàng ToplistNA VẪN SỐNG ở preparing và đã xóa driver_name cũ
  const [orderRows] = await pool.query(`SELECT order_status, driver_name, firego_driver_id FROM orders WHERE id = ?`, [testOrderId]);
  assert(orderRows[0].order_status === 'preparing', 'Đơn hàng ToplistNA VẪN SỐNG ở trạng thái preparing (TUYỆT ĐỐI KHÔNG BỊ HỦY)');
  assert(orderRows[0].driver_name === null, 'Đơn hàng ToplistNA đã xóa tên tài xế vừa hủy');

  // =========================================================================
  // TEST CASE 5: CHẶN QUÁN HỦY ĐƠN KHI ĐÃ BÀN GIAO CHO SHIPPER TRÊN TOPLISTNA
  // =========================================================================
  console.log('\n--- [KỊCH BẢN 5] CHẶN QUÁN HỦY ĐƠN TRÊN TOPLISTNA KHI ĐANG SHIPPING ---');
  // Chuyển đơn sang shipping
  await pool.query(`UPDATE orders SET order_status = 'shipping' WHERE id = ?`, [testOrderId]);

  // Thử Quán gọi PUT /api/v1/orders/:id/status thành 'cancelled'
  const tryCancelShipping = await api(`${TOPLISTNA_URL}/api/v1/orders/${testOrderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled', cancelReason: 'Quán muốn hủy khi đang giao' }),
  });

  assert(!tryCancelShipping.ok && tryCancelShipping.status === 400, 'ToplistNA API CHẶN KHÔNG CHO HỦY khi đơn đang ở trạng thái shipping (400 Bad Request)');

  // Dọn dẹp đơn ToplistNA test
  await pool.query(`DELETE FROM orders WHERE id = ?`, [testOrderId]);
  await pool.end();

  // Dọn dẹp test FireGo
  await db.collection('deliveries').deleteOne({ _id: new mongoose.Types.ObjectId(deliv3Id) });
  await db.collection('deliveries').deleteOne({ _id: new mongoose.Types.ObjectId(deliveryId) });
  await db.collection('deliveryassignmentrequests').deleteMany({ deliveryId: new mongoose.Types.ObjectId(deliveryId) });
  await mongoose.disconnect();

  console.log('\n===============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

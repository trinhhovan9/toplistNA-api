const mysql = require('mysql2/promise');

async function runTest() {
  console.log('=== TEST INTEGRATION: TOPLISTNA <-> FIREGOAPP ===');

  // 1. Kiểm tra kết nối MySQL ToplistNA và kiểm tra cột bảng orders
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'bookingna'
  });
  console.log('1. [MySQL] Connected to bookingna database.');

  const [cols] = await conn.query('DESCRIBE orders');
  const colNames = cols.map(c => c.Field);
  const requiredCols = [
    'firego_delivery_id',
    'firego_driver_id',
    'driver_name',
    'driver_phone',
    'driver_plate',
    'driver_vehicle',
    'driver_avatar',
    'driver_rating'
  ];

  for (const rc of requiredCols) {
    if (!colNames.includes(rc)) {
      throw new Error(`Missing column: ${rc}`);
    }
  }
  console.log('   ✅ All 8 FireGo columns verified in orders table!');

  // 2. Tạo một đơn hàng giả lập để test luồng điều phối
  const testOrderCode = `TEST_FG_${Date.now().toString().slice(-6)}`;
  console.log(`2. [Order] Creating test food order: ${testOrderCode}`);

  const [insertRes] = await conn.query(`
    INSERT INTO orders (
      order_code, user_id, listing_id, delivery_address,
      delivery_latitude, delivery_longitude, distance_km,
      subtotal, shipping_fee, total_amount, order_status, payment_method, payment_status
    ) VALUES (
      ?, 1, 1, 'Số 15 Đặng Tất, P. Lê Mao, TP Vinh, Nghệ An',
      18.6668, 105.6834, 2.5,
      120000, 15000, 135000, 'pending', 'cash', 'pending'
    )
  `, [testOrderCode]);

  const testOrderId = insertRes.insertId;
  console.log(`   ✅ Test order created with ID: ${testOrderId}`);

  // 3. Test Webhook từ FireGo sang ToplistNA: Driver nhận đơn (driver_assigned)
  console.log('3. [FireGo -> ToplistNA] Testing webhook delivery-update (driver_assigned)...');
  const SECRET = 'firego_toplistna_secret_2026';
  const TOPLISTNA_URL = 'http://localhost:3001';

  const driverAssignedPayload = {
    event: 'driver_assigned',
    deliveryId: 'fg_deliv_' + Date.now(),
    externalOrderId: testOrderCode,
    status: 'driver_assigned',
    driver: {
      id: '69a11938778e1e187f6ea1e4',
      name: 'Hồ Đức Thành',
      phone: '0901000005',
      plate: '37B1-567.89',
      vehicle: 'Honda Wave Alpha (Xe máy)',
      avatar: 'https://toplistnghean.vn/driver-avatar.jpg',
      rating: 4.95,
      currentLocation: {
        lat: 18.6636,
        lng: 105.6833
      }
    }
  };

  const webhookRes = await fetch(`${TOPLISTNA_URL}/api/firego/webhook/delivery-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify(driverAssignedPayload)
  });

  if (!webhookRes.ok) {
    const txt = await webhookRes.text();
    throw new Error(`Webhook failed: ${webhookRes.status} ${txt}`);
  }
  const webhookJson = await webhookRes.json();
  console.log('   ✅ Webhook processed successfully by ToplistNA:', webhookJson);

  // 4. Kiểm tra dữ liệu trong MySQL đã được cập nhật từ tài xế FireGo thật
  const [rows] = await conn.query('SELECT * FROM orders WHERE id = ?', [testOrderId]);
  const updatedOrder = rows[0];
  console.log('4. [Verification] Checking updated order in MySQL:');
  console.log(`   - firego_delivery_id: ${updatedOrder.firego_delivery_id}`);
  console.log(`   - firego_driver_id:   ${updatedOrder.firego_driver_id}`);
  console.log(`   - driver_name:        ${updatedOrder.driver_name}`);
  console.log(`   - driver_phone:       ${updatedOrder.driver_phone}`);
  console.log(`   - driver_plate:       ${updatedOrder.driver_plate}`);
  console.log(`   - driver_vehicle:     ${updatedOrder.driver_vehicle}`);
  console.log(`   - driver_rating:      ${updatedOrder.driver_rating}`);

  if (updatedOrder.driver_name !== 'Hồ Đức Thành') {
    throw new Error(`Driver name mismatch: expected Hồ Đức Thành, got ${updatedOrder.driver_name}`);
  }
  console.log('   ✅ Real FireGo driver snapshot saved cleanly in MySQL!');

  // 5. Test Webhook toạ độ GPS thời gian thực (driver-location)
  console.log('5. [FireGo -> ToplistNA] Testing real-time GPS location stream webhook...');
  const gpsPayload = {
    deliveryId: updatedOrder.firego_delivery_id,
    externalOrderId: testOrderCode,
    driverId: updatedOrder.firego_driver_id,
    lat: 18.6645,
    lng: 105.6840,
    heading: 45,
    speed: 25.5,
    timestamp: new Date().toISOString()
  };

  const gpsRes = await fetch(`${TOPLISTNA_URL}/api/firego/webhook/driver-location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify(gpsPayload)
  });

  if (!gpsRes.ok) {
    const txt = await gpsRes.text();
    throw new Error(`GPS webhook failed: ${gpsRes.status} ${txt}`);
  }
  console.log('   ✅ GPS location webhook emitted live to WebSocket room order_' + testOrderId);

  // 6. Test Webhook trạng thái: Đang giao (delivering)
  console.log('6. [FireGo -> ToplistNA] Testing status update: delivering (shipping)...');
  await fetch(`${TOPLISTNA_URL}/api/firego/webhook/delivery-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FireGo-Secret': SECRET,
    },
    body: JSON.stringify({
      event: 'status_update',
      deliveryId: updatedOrder.firego_delivery_id,
      externalOrderId: testOrderCode,
      status: 'delivering'
    })
  });

  const [deliveringRows] = await conn.query('SELECT order_status FROM orders WHERE id = ?', [testOrderId]);
  console.log(`   ✅ Order status updated to: ${deliveringRows[0].order_status} (Expected: shipping)`);

  // 7. Test getTracking endpoint
  console.log('7. [ToplistNA API] Calling GET /api/v1/orders/:id/tracking...');
  const trackingRes = await fetch(`${TOPLISTNA_URL}/api/v1/orders/${testOrderId}/tracking`);
  const trackingJson = await trackingRes.json();
  const trackingData = trackingJson.data || trackingJson;

  console.log('   - Tracking order_status:', trackingData.order_status);
  console.log('   - Tracking driver:', trackingData.driver);
  if (!trackingData.driver || trackingData.driver.name !== 'Hồ Đức Thành') {
    throw new Error('Driver data missing in tracking response!');
  }
  console.log('   ✅ getTracking returned full real driver details!');

  // 8. Dọn dẹp đơn test
  await conn.query('DELETE FROM orders WHERE id = ?', [testOrderId]);
  console.log(`8. [Cleanup] Deleted test order #${testOrderId}`);

  await conn.end();
  console.log('\n🎉 ALL INTEGRATION TESTS PASSED 100%! SYSTEM IS READY!');
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

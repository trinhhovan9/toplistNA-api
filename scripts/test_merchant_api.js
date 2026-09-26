const http = require('http');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:3001/api/v1${path}`,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (_) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function test() {
  console.log('--- TEST 1: Get stores for hovantrinh17 (userId: 817) ---');
  const res1 = await request('/restaurants/merchant/my-stores?userId=817');
  console.log('Status:', res1.statusCode);
  console.log('Data:', res1.body);

  console.log('\n--- TEST 2: Get stores for unauthorized user (userId: 999) ---');
  const res2 = await request('/restaurants/merchant/my-stores?userId=999');
  console.log('Status:', res2.statusCode);
  console.log('Data:', res2.body);

  console.log('\n--- TEST 3: Verify permission of user 817 for Tian Long (2046) ---');
  const res3 = await request('/restaurants/merchant/2046/verify?userId=817');
  console.log('Status:', res3.statusCode);
  console.log('Data:', res3.body);

  console.log('\n--- TEST 4: Verify permission of user 999 for Tian Long (2046) -> Should be 403 Forbidden ---');
  const res4 = await request('/restaurants/merchant/2046/verify?userId=999');
  console.log('Status:', res4.statusCode);
  console.log('Data:', res4.body);
}

test().catch(console.error);

async function testLogin() {
  const BASE_URL = 'http://localhost:3001/api/v1';

  async function post(data) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  console.log('--- TEST 1: Login with username ---');
  const res1 = await post({ username: 'hovantrinh17', password: 'password' });
  console.log('Status:', res1.status, 'Response:', res1.json);

  console.log('\n--- TEST 2: Login with identifier ---');
  const res2 = await post({ identifier: 'hovantrinh17', password: 'password' });
  console.log('Status:', res2.status, 'Response:', res2.json);

  console.log('\n--- TEST 3: Login with email ---');
  const res3 = await post({ email: 'trinhhovan9@gmail.com', password: 'password' });
  console.log('Status:', res3.status, 'Response:', res3.json);
}

testLogin();

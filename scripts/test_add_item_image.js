async function testAddMenuItem() {
  const BASE_URL = 'http://localhost:3001/api/v1';

  // Tiny 1x1 png base64
  const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  try {
    const res = await fetch(`${BASE_URL}/restaurants/merchant/items?userId=817`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_id: 2046,
        name: 'Nem nướng nha trang test image',
        category: 'Món chính',
        price: 45000,
        description: 'Nem nướng thơm ngon',
        image: sampleBase64
      })
    });
    const data = await res.json();
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

testAddMenuItem();

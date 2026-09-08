async function sendMsg(message) {
  const url = 'http://localhost:3000/api/whatsapp-incoming';
  const secret = 'ld-bridge-mP3rL8jQsX7yWz2k';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wa-bridge-secret': secret
    },
    body: JSON.stringify({
      phone: '56935264052', // Cristian (Administrador)
      message: message
    })
  });
  return await res.json();
}

async function runTest() {
  console.log('🚀 TEST 1: Creación de producto SIN especificar stock...');
  const res1 = await sendMsg('Jaime, agrega el producto Sprite Zero, formato botella 1.5L, costo 900, bebidas');
  console.log('Respuesta del bot para Test 1:', JSON.stringify(res1, null, 2));

  console.log('\n🚀 TEST 2: Creación de producto CON especificar stock...');
  const res2 = await sendMsg('Jaime, agrega el producto Sprite Zero, formato botella 1.5L, costo 900, stock 50, bebidas');
  console.log('Respuesta del bot para Test 2:', JSON.stringify(res2, null, 2));
}

runTest();

// Fetch es una función global en Node.js moderno (Node 18+)

async function runTest() {
  const url = 'http://localhost:3000/api/whatsapp-incoming';
  const secret = 'ld-bridge-mP3rL8jQsX7yWz2k';

  console.log('🚀 Iniciando simulación de consulta de Administrador...');
  console.log('Mensaje: "Jaime, dame el SKU de papas"');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wa-bridge-secret': secret
      },
      body: JSON.stringify({
        phone: '56935264052', // Cristian (Administrador)
        message: 'Jaime, dame el SKU de papas'
      })
    });

    console.log(`Status de respuesta: ${res.status}`);
    const data = await res.json();
    console.log('Respuesta recibida del bot:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error llamando al webhook local:', error.message);
    console.log('Asegúrate de que el servidor dev esté corriendo localmente con "npm run dev" en el puerto 3000.');
  }
}

runTest();

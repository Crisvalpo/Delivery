const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Leer .env.local a mano
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY'); // Usamos service role para consultar todo
const n8nUrl = getEnvVar('N8N_WEBHOOK_URL');

console.log('--- Configuración de Prueba ---');
console.log('Supabase URL:', supabaseUrl);
console.log('Webhook n8n:', n8nUrl);

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: No se pudieron cargar las variables de Supabase del archivo .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  try {
    // 2. Obtener un cliente real de la base de datos
    console.log('\nConsultando un cliente en Supabase...');
    const { data: clientes, error: cliErr } = await supabase
      .from('clientes')
      .select('id, nombre_tienda')
      .limit(1);

    if (cliErr) throw cliErr;
    if (!clientes || clientes.length === 0) {
      console.error('Error: No se encontraron clientes en la base de datos. Asegúrate de correr la semilla primero.');
      return;
    }

    const cliente = clientes[0];
    console.log(`Cliente seleccionado: ${cliente.nombre_tienda} (${cliente.id})`);

    // 3. Obtener productos reales de la base de datos (por ejemplo, papas y confites)
    console.log('\nConsultando productos en Supabase...');
    const { data: productos, error: prodErr } = await supabase
      .from('productos')
      .select('id, nombre, precio, categoria_logistica')
      .eq('disponible', true)
      .limit(3);

    if (prodErr) throw prodErr;
    if (!productos || productos.length === 0) {
      console.error('Error: No se encontraron productos disponibles en la base de datos.');
      return;
    }

    console.log(`Productos encontrados: ${productos.length}`);
    productos.forEach(p => console.log(`- [${p.categoria_logistica}] ${p.nombre}: $${p.precio}`));

    // 4. Armar el payload para la API de pedido
    // Necesitamos superar los $35.000 para cumplir la regla del furgón.
    // Ej: Malla de papas cuesta $12.000, si pedimos 3 son $36.000.
    const productosSeleccionados = productos.map((p, idx) => {
      // Pedimos 3 unidades del primero para superar el mínimo, 1 de los otros
      const cantidad = idx === 0 ? 3 : 1;
      return {
        id: p.id,
        cantidad: cantidad
      };
    });

    const payload = {
      cliente_id: cliente.id,
      productos_seleccionados: productosSeleccionados
    };

    console.log('\nPayload preparado para enviar a la API:', JSON.stringify(payload, null, 2));

    // 5. Enviar POST al servidor local
    console.log('\nEnviando petición POST a http://localhost:3000/api/pedido ...');
    const response = await fetch('http://localhost:3000/api/pedido', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('\n--- Respuesta de la API ---');
    console.log('Status Code:', response.status);
    console.log('Resultado:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Prueba completada con éxito!');
      console.log(`Pedido ID creado: ${result.pedido_id}`);
      console.log(`Total a pagar: $${result.totalPagar.toLocaleString('es-CL')} (Flete: $${result.flete.toLocaleString('es-CL')})`);
    } else {
      console.error('\n❌ La API devolvió un error:', result.message);
    }

  } catch (err) {
    console.error('\n❌ Error durante la ejecución de la prueba:', err.message);
  }
}

runTest();

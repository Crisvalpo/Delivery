const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runE2ETest() {
  console.log("========== INICIANDO PRUEBA DE FLUJO COMPLETO E2E ==========");
  
  // 1. Cargar variables de entorno desde .env.local
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error("No se encontró el archivo .env.local en la raíz del proyecto.");
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      env[match[1]] = value;
    }
  });

  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_SECRET = env.ADMIN_SECRET;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ADMIN_SECRET) {
    throw new Error("Variables de entorno incompletas en .env.local (URL, Service Key o Admin Secret).");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("Cliente Supabase inicializado correctamente.");

  let creadaTemporal = false;
  let ventana = null;
  let cliente = null;
  let pedidoId = null;
  let otrasVentanas = [];

  try {
    // 2. Validar o crear Ventana de Pedidos Activa
    const now = new Date();
    const cierre = new Date(now.getTime() + 60 * 60 * 1000); // 1 hora a futuro
    const entrega = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 horas a futuro

    const { data: ventanaActiva, error: ventErr } = await supabase
      .from('ventanas_pedido')
      .select('*')
      .eq('activa', true)
      .gt('fecha_cierre', now.toISOString())
      .order('fecha_cierre', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ventErr) throw ventErr;

    if (!ventanaActiva) {
      console.log("No hay una ventana de pedidos activa. Creando ventana de pruebas temporal...");
      const { data: nuevaVentana, error: insVentErr } = await supabase
        .from('ventanas_pedido')
        .insert({
          nombre: "Ventana de Pruebas E2E",
          fecha_cierre: cierre.toISOString(),
          fecha_entrega: entrega.toISOString(),
          activa: true
        })
        .select('*')
        .single();
      if (insVentErr) throw insVentErr;
      ventana = nuevaVentana;
      creadaTemporal = true;
      console.log(`Ventana de pruebas creada con ID: ${ventana.id}`);
    } else {
      ventana = ventanaActiva;
      console.log(`Usando ventana activa existente: ${ventana.nombre} (ID: ${ventana.id})`);
    }

    // Aislamos la ventana activa: desactivamos temporalmente las otras para evitar colisiones en la API de ruta
    console.log("Aislando la ventana de prueba (desactivando temporalmente otras ventanas activas)...");
    const { data: tempOtras, error: updOtrasErr } = await supabase
      .from('ventanas_pedido')
      .update({ activa: false })
      .eq('activa', true)
      .neq('id', ventana.id)
      .select('id');

    if (updOtrasErr) throw updOtrasErr;
    otrasVentanas = tempOtras || [];
    console.log(`Se desactivaron temporalmente ${otrasVentanas.length} ventanas.`);

    // 3. Registrar un cliente de prueba
    const whatsappPrueba = "+56999999999";
    console.log(`Eliminando cliente anterior con WhatsApp ${whatsappPrueba} si existe...`);
    await supabase.from('clientes').delete().eq('whatsapp', whatsappPrueba);

    console.log("Insertando nuevo cliente de prueba...");
    const { data: nuevoCliente, error: cliErr } = await supabase
      .from('clientes')
      .insert({
        nombre_tienda: "Almacén E2E Prueba",
        nombre_contacto: "Test Bot",
        whatsapp: whatsappPrueba,
        sector: "Placilla Oriente",
        latitud: -33.095,
        longitud: -71.555,
        prioridad_territorial: "Media",
        tipo_negocio: "Almacén",
        registro_completo: true
      })
      .select('*')
      .single();

    if (cliErr) throw cliErr;
    cliente = nuevoCliente;
    console.log(`Cliente de prueba registrado: ${cliente.nombre_tienda} (ID: ${cliente.id})`);

    // 4. Seleccionar dos productos disponibles
    console.log("Consultando productos activos y disponibles...");
    const { data: productos, error: prodErr } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .eq('disponible', true)
      .limit(3);

    if (prodErr) throw prodErr;
    if (!productos || productos.length < 2) {
      throw new Error("No hay suficientes productos activos/disponibles para la prueba.");
    }

    const prod1 = productos[0];
    const prod2 = productos[1];
    console.log(`Productos seleccionados:`);
    console.log(`  - P1: ${prod1.nombre} | Precio: $${prod1.precio}`);
    console.log(`  - P2: ${prod2.nombre} | Precio: $${prod2.precio}`);

    // 5. Enviar pedido inicial que supere el mínimo de $35.000
    const cantProd1 = Math.ceil(36000 / prod1.precio);
    const totalEsperado1 = prod1.precio * cantProd1;
    console.log(`\n--- FASE 1: Enviando pedido inicial ---`);
    console.log(`Comprando ${cantProd1} unidades de '${prod1.nombre}' (Neto: $${totalEsperado1.toLocaleString("es-CL")})`);

    const response1 = await fetch('http://localhost:3000/api/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        productos_seleccionados: [
          { id: prod1.id, cantidad: cantProd1 }
        ]
      })
    });

    const data1 = await response1.json();
    if (!response1.ok) {
      throw new Error(`Fallo en el pedido inicial: ${data1.message}`);
    }
    pedidoId = data1.pedido_id;
    console.log(`✅ Pedido inicial creado con éxito. ID: ${pedidoId}`);
    console.log(`   Neto consolidado: $${data1.totalNeto?.toLocaleString("es-CL")}`);

    // 6. Enviar segundo pedido (fusión) por un monto menor a $35.000 (ej: 1 unidad de prod2)
    console.log(`\n--- FASE 2: Enviando pedido de fusión (Bypass del Mínimo) ---`);
    console.log(`Comprando 1 unidad de '${prod2.nombre}' (Neto: $${prod2.precio.toLocaleString("es-CL")})`);

    const response2 = await fetch('http://localhost:3000/api/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        productos_seleccionados: [
          { id: prod2.id, cantidad: 1 }
        ]
      })
    });

    const data2 = await response2.json();
    if (!response2.ok) {
      throw new Error(`Fallo en el pedido de fusión: ${data2.message}`);
    }
    
    console.log(`✅ Pedido de fusión procesado con éxito.`);
    console.log(`   ¿Es Fusión?: ${data2.fusionado}`);
    console.log(`   ID Retornado: ${data2.pedido_id}`);
    
    if (data2.pedido_id !== pedidoId) {
      throw new Error(`ERROR: La fusión debió mantener el ID ${pedidoId}, pero creó o usó ${data2.pedido_id}`);
    }
    console.log(`✅ Confirmación de Fusión: Ambos pedidos comparten el ID ${pedidoId}`);

    // 7. Marcar ítems de la lista de compras como conseguido y agotado
    console.log(`\n--- FASE 3: Marcación de artículos de la lista de compras ---`);
    console.log(`Marcando ${prod1.nombre} como Conseguido...`);
    const resConsolidar1 = await fetch('http://localhost:3000/api/admin-consolidar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        producto_id: prod1.id,
        accion: 'conseguido'
      })
    });
    const dataCons1 = await resConsolidar1.json();
    if (!resConsolidar1.ok) throw new Error(`Fallo al marcar conseguido: ${dataCons1.message}`);
    console.log(`✅ Producto 1 marcado como conseguido.`);

    console.log(`Marcando ${prod2.nombre} como Agotado (no disponible)...`);
    const resConsolidar2 = await fetch('http://localhost:3000/api/admin-consolidar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        producto_id: prod2.id,
        accion: 'no_disponible'
      })
    });
    const dataCons2 = await resConsolidar2.json();
    if (!resConsolidar2.ok) throw new Error(`Fallo al marcar agotado: ${dataCons2.message}`);
    console.log(`✅ Producto 2 marcado como no disponible.`);

    // 8. Cambiar estado de pedidos a "Preparado" para iniciar ruta
    console.log(`\n--- FASE 4: Preparación del pedido para la ruta ---`);
    const resPreparar = await fetch('http://localhost:3000/api/admin-consolidar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        accion: 'preparar_todos'
      })
    });
    const dataPrep = await resPreparar.json();
    if (!resPreparar.ok) throw new Error(`Fallo al preparar pedidos: ${dataPrep.message}`);
    console.log("✅ Pedidos de la ventana marcados como 'Preparado'.");

    // 9. Validar ruta de despacho
    console.log(`\n--- FASE 5: Ruta de Despacho ---`);
    console.log("Consultando lista de ruta de despacho...");
    const resRutaGet = await fetch('http://localhost:3000/api/ruta-despacho', {
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const dataRutaGet = await resRutaGet.json();
    if (!resRutaGet.ok) throw new Error(`Fallo al consultar ruta: ${dataRutaGet.message}`);

    console.log(`[Diagnóstico Ruta] Ventana retornada: ${dataRutaGet.ventana ? `${dataRutaGet.ventana.nombre} (ID: ${dataRutaGet.ventana.id})` : 'Ninguna'}`);
    console.log(`[Diagnóstico Ruta] Pedidos en la ruta retornada:`, dataRutaGet.pedidos.map(p => ({ id: p.id, estado: p.estado, cliente: p.clientes?.nombre_tienda })));

    const pedRuta = dataRutaGet.pedidos.find(p => p.id === pedidoId);
    if (!pedRuta) {
      throw new Error(`ERROR: El pedido ${pedidoId} no aparece en la lista de ruta.`);
    }
    console.log(`✅ Pedido de prueba encontrado en la ruta. Estado inicial: ${pedRuta.estado}`);

    // Pasar a "En Ruta"
    console.log("Cambiando estado a 'En Ruta'...");
    const resEnRuta = await fetch('http://localhost:3000/api/ruta-despacho', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        pedido_id: pedidoId,
        nuevo_estado: 'En Ruta'
      })
    });
    const dataEnRuta = await resEnRuta.json();
    if (!resEnRuta.ok) throw new Error(`Fallo al cambiar a En Ruta: ${dataEnRuta.message}`);
    console.log(`✅ Estado cambiado a 'En Ruta'. Notificación WA: ${dataEnRuta.wa_enviado}`);

    // Pasar a "Entregado"
    console.log("Cambiando estado a 'Entregado'...");
    const resEntregado = await fetch('http://localhost:3000/api/ruta-despacho', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        pedido_id: pedidoId,
        nuevo_estado: 'Entregado'
      })
    });
    const dataEntregado = await resEntregado.json();
    if (!resEntregado.ok) throw new Error(`Fallo al cambiar a Entregado: ${dataEntregado.message}`);
    console.log(`✅ Estado cambiado a 'Entregado'. Notificación WA: ${dataEntregado.wa_enviado}`);

    console.log(`\n🎉 🎉 🎉 ¡TODAS LAS FASES COMPLETADAS CON ÉXITO! 🎉 🎉 🎉`);

  } catch (error) {
    console.error("\n❌ ERROR DURANTE LA EJECUCIÓN DE LA PRUEBA E2E:", error.message);
  } finally {
    // 10. Limpieza total de la base de datos
    console.log(`\n--- FASE 6: Limpieza de Base de Datos ---`);
    if (pedidoId) {
      console.log(`Eliminando ítems de pedido para pedido ${pedidoId}...`);
      await supabase.from('items_pedido').delete().eq('pedido_id', pedidoId);
      console.log(`Eliminando pedido ${pedidoId}...`);
      await supabase.from('pedidos').delete().eq('id', pedidoId);
    }
    if (cliente) {
      console.log(`Eliminando cliente de prueba ${cliente.id}...`);
      await supabase.from('clientes').delete().eq('id', cliente.id);
    }
    if (otrasVentanas && otrasVentanas.length > 0) {
      console.log("Restaurando las ventanas desactivadas...");
      const idsReactivar = otrasVentanas.map(v => v.id);
      await supabase
        .from('ventanas_pedido')
        .update({ activa: true })
        .in('id', idsReactivar);
    }

    if (creadaTemporal && ventana) {
      console.log(`Eliminando ventana de prueba temporal ${ventana.id}...`);
      await supabase.from('ventanas_pedido').delete().eq('id', ventana.id);
    }
    console.log("✅ Limpieza completada. Base de datos libre de residuos de prueba.");
  }
}

runE2ETest();

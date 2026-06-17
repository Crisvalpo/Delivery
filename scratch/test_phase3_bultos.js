const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log("========== INICIANDO PRUEBAS DE INTEGRACIÓN FASE 3: trazabilidad DE BULTOS ==========");

  // 1. Cargar variables
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error("No se encontró el archivo .env.local");
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Usaremos el servidor local (ejecutado en puerto 3000 por defecto en npm run dev o build local)
  const baseUrl = "http://localhost:3000";
  
  let clienteTemp = null;
  let pedidoTemp = null;
  
  try {
    // 2. Crear un cliente temporal
    console.log("1. Creando cliente de pruebas...");
    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .insert({
        nombre_tienda: "Tienda Test Bultos",
        nombre_contacto: "Test Repartidor",
        whatsapp: "56999998888",
        sector: "Curauma Centro",
        latitud: -33.102,
        longitud: -71.559,
        prioridad_territorial: "Media",
        tipo_negocio: "Almacén",
        registro_completo: true
      })
      .select()
      .single();
      
    if (cliErr) throw cliErr;
    clienteTemp = cli;
    console.log(`✅ Cliente creado: ID ${clienteTemp.id}`);

    // 3. Crear un pedido temporal en estado "En Ruta"
    console.log("\n2. Creando pedido de pruebas...");
    const { data: ped, error: pedErr } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteTemp.id,
        total_neto: 10000,
        flete: 1000,
        total_pagar: 11000,
        total_costo: 8000,
        estado: "En Ruta"
      })
      .select()
      .single();
      
    if (pedErr) throw pedErr;
    pedidoTemp = ped;
    console.log(`✅ Pedido creado: ID ${pedidoTemp.id} | Estado: ${pedidoTemp.estado}`);

    // 4. Crear 2 bultos vía la API local
    console.log("\n3. Creando 2 bultos en Supabase llamando a la API /api/bultos (accion: crear)...");
    const resCrear = await fetch(`${baseUrl}/api/bultos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": ADMIN_SECRET
      },
      body: JSON.stringify({
        accion: "crear",
        pedido_id: pedidoTemp.id,
        cantidad_bultos: 2
      })
    });
    
    const dataCrear = await resCrear.json();
    if (!resCrear.ok || !dataCrear.success) {
      throw new Error(`Error al crear bultos: ${JSON.stringify(dataCrear)}`);
    }
    console.log(`✅ Bultos creados exitosamente:`, dataCrear.bultos.map(b => b.codigo_bulto));
    const bultos = dataCrear.bultos;

    // 5. Consultar los bultos vía GET de la API
    console.log("\n4. Consultando los bultos creados vía GET...");
    const resGet = await fetch(`${baseUrl}/api/bultos?pedido_id=${pedidoTemp.id}`, {
      headers: { "x-admin-secret": ADMIN_SECRET }
    });
    const dataGet = await resGet.json();
    if (!resGet.ok || !dataGet.success) {
      throw new Error(`Error en GET bultos: ${JSON.stringify(dataGet)}`);
    }
    console.log(`✅ GET bultos exitoso. Se obtuvieron ${dataGet.bultos.length} bultos.`);

    // 6. Escanear el primer bulto (B1)
    const b1 = bultos[0];
    console.log(`\n5. Simulando escaneo del primer bulto: ${b1.codigo_bulto}...`);
    const resEscaneo1 = await fetch(`${baseUrl}/api/bultos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": ADMIN_SECRET
      },
      body: JSON.stringify({
        accion: "escanear",
        codigo_bulto: b1.codigo_bulto
      })
    });
    const dataEscaneo1 = await resEscaneo1.json();
    if (!resEscaneo1.ok || !dataEscaneo1.success) {
      throw new Error(`Error en escaneo 1: ${JSON.stringify(dataEscaneo1)}`);
    }
    console.log(`✅ Bulto 1 procesado:`, dataEscaneo1.message);
    console.log(`   ¿Pedido Completado?: ${dataEscaneo1.pedido_completado} (Esperado: false)`);
    console.log(`   Bultos pendientes: ${dataEscaneo1.bultos_pendientes} (Esperado: 1)`);
    
    // Validar estado del pedido en DB
    const { data: pedEnDb1 } = await supabase
      .from("pedidos")
      .select("estado")
      .eq("id", pedidoTemp.id)
      .single();
    console.log(`   Estado del pedido en base de datos: '${pedEnDb1.estado}' (Esperado: 'En Ruta')`);
    
    if (pedEnDb1.estado !== "En Ruta") {
      throw new Error("El pedido cambió a Entregado antes de tiempo.");
    }

    // 7. Escanear el segundo bulto (B2)
    const b2 = bultos[1];
    console.log(`\n6. Simulando escaneo del segundo y último bulto: ${b2.codigo_bulto}...`);
    const resEscaneo2 = await fetch(`${baseUrl}/api/bultos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": ADMIN_SECRET
      },
      body: JSON.stringify({
        accion: "escanear",
        codigo_bulto: b2.codigo_bulto
      })
    });
    const dataEscaneo2 = await resEscaneo2.json();
    if (!resEscaneo2.ok || !dataEscaneo2.success) {
      throw new Error(`Error en escaneo 2: ${JSON.stringify(dataEscaneo2)}`);
    }
    console.log(`✅ Bulto 2 procesado:`, dataEscaneo2.message);
    console.log(`   ¿Pedido Completado?: ${dataEscaneo2.pedido_completado} (Esperado: true)`);
    console.log(`   Bultos pendientes: ${dataEscaneo2.bultos_pendientes} (Esperado: 0)`);
    
    // Validar estado del pedido final en DB
    const { data: pedEnDb2 } = await supabase
      .from("pedidos")
      .select("estado")
      .eq("id", pedidoTemp.id)
      .single();
    console.log(`   Estado del pedido final en base de datos: '${pedEnDb2.estado}' (Esperado: 'Entregado')`);
    
    if (pedEnDb2.estado !== "Entregado") {
      throw new Error("El pedido no cambió a Entregado después de escanear todos los bultos.");
    }

    console.log(`\n🎉 🎉 🎉 ¡TODAS LAS PRUEBAS DE LA FASE 3 PASARON CON ÉXITO! 🎉 🎉 🎉`);

  } catch (err) {
    console.error("\n❌ ERROR DURANTE LA EJECUCIÓN DE LAS PRUEBAS:", err.message);
  } finally {
    // 8. Limpieza
    console.log("\n7. Iniciando limpieza de base de datos...");
    if (pedidoTemp) {
      console.log(`   Eliminando bultos asociados al pedido ${pedidoTemp.id}...`);
      await supabase.from("bultos_despacho").delete().eq("pedido_id", pedidoTemp.id);
      console.log(`   Eliminando pedido ${pedidoTemp.id}...`);
      await supabase.from("pedidos").delete().eq("id", pedidoTemp.id);
    }
    if (clienteTemp) {
      console.log(`   Eliminando cliente ${clienteTemp.id}...`);
      await supabase.from("clientes").delete().eq("id", clienteTemp.id);
    }
    console.log("✅ Limpieza completada. Base de datos libre de residuos.");
  }
}

runTest();

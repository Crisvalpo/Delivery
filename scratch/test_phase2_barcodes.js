const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log("========== INICIANDO PRUEBAS DE FASE 2: CÓDIGOS DE BARRA ==========");
  
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
  const BRIDGE_SECRET = env.WA_BRIDGE_SECRET;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const testBarcode = "7801234567890";
  const testSku = "LD-VER01";
  
  try {
    // 2. Asociar código de barras de prueba a Tomate Larga Vida (LD-VER01)
    console.log(`\n1. Asociando código de barras '${testBarcode}' a SKU '${testSku}' en la base de datos...`);
    const { data: updatedProd, error: updErr } = await supabase
      .from('productos')
      .update({ codigo_barras: testBarcode })
      .eq('sku', testSku)
      .select()
      .single();
      
    if (updErr) throw updErr;
    console.log(`✅ Producto actualizado: ${updatedProd.nombre} | Código Barras: ${updatedProd.codigo_barras}`);

    // 3. Simular webhook de WhatsApp enviando el código de barras
    console.log(`\n2. Simulando mensaje de WhatsApp con el código de barras: "${testBarcode}"...`);
    
    // Usaremos el webhook de producción ya que los cambios ya se desplegaron exitosamente
    const webhookUrl = "https://lukeapp.me/api/whatsapp-incoming";
    
    const payloadBarcode = {
      phone: "56999999999",
      jid: "56999999999@s.whatsapp.net",
      message: testBarcode
    };
    
    const responseBarcode = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wa-bridge-secret": BRIDGE_SECRET
      },
      body: JSON.stringify(payloadBarcode)
    });
    
    const dataBarcode = await responseBarcode.json();
    console.log(`Status respuesta: ${responseBarcode.status}`);
    console.log(`Respuesta JSON:`, JSON.stringify(dataBarcode, null, 2));
    
    if (dataBarcode.responseText && dataBarcode.responseText.includes("Tomate Larga Vida")) {
      console.log("✅ ÉXITO: El webhook interceptó el código de barras y retornó la ficha técnica.");
    } else {
      console.log("❌ ERROR: El webhook no retornó la información del producto.");
    }

    // 4. Simular webhook de WhatsApp enviando el SKU
    console.log(`\n3. Simulando mensaje de WhatsApp con el SKU: "${testSku}"...`);
    
    const payloadSku = {
      phone: "56999999999",
      jid: "56999999999@s.whatsapp.net",
      message: testSku
    };
    
    const responseSku = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wa-bridge-secret": BRIDGE_SECRET
      },
      body: JSON.stringify(payloadSku)
    });
    
    const dataSku = await responseSku.json();
    console.log(`Status respuesta: ${responseSku.status}`);
    console.log(`Respuesta JSON:`, JSON.stringify(dataSku, null, 2));
    
    if (dataSku.responseText && dataSku.responseText.includes("Tomate Larga Vida")) {
      console.log("✅ ÉXITO: El webhook interceptó el SKU y retornó la ficha técnica.");
    } else {
      console.log("❌ ERROR: El webhook no retornó la información del producto.");
    }

  } catch (err) {
    console.error("❌ Ocurrió un error en las pruebas:", err.message);
  } finally {
    // 5. Limpieza: quitar código de barras de prueba
    console.log(`\n4. Limpiando base de datos: removiendo código de barras de '${testSku}'...`);
    const { error: resetErr } = await supabase
      .from('productos')
      .update({ codigo_barras: null })
      .eq('sku', testSku);
      
    if (resetErr) {
      console.error("Error al limpiar código de barras:", resetErr.message);
    } else {
      console.log("✅ Base de datos limpia de datos de prueba.");
    }
  }
}

runTest();

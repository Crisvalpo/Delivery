const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function checkVerduleria() {
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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log("Consultando productos de Verdulería...");
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, sku, precio, categoria, codigo_barras')
    .eq('categoria', 'Verdulería')
    .eq('activo', true);

  if (error) {
    console.error("Error consultando productos:", error);
    return;
  }

  console.log(`Se encontraron ${data.length} productos de Verdulería:`);
  data.forEach(p => {
    console.log(`- ${p.nombre} (${p.sku}) | Precio: $${p.precio} | Código Barras: ${p.codigo_barras || 'Ninguno'}`);
  });
}

checkVerduleria();

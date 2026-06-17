import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Lee variables de entorno
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) env[key.trim()] = val.trim();
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function run() {
  const { data, error } = await supabase.from('productos').select('*');
  if (error) { console.error(error); return; }

  const map = {};
  data.forEach(p => {
    const key = `${p.nombre.toLowerCase()}-${p.formato_venta.toLowerCase()}`;
    if (!map[key]) map[key] = [];
    map[key].push(p);
  });

  const duplicates = Object.keys(map).filter(k => map[k].length > 1);
  console.log(`Encontrados ${duplicates.length} productos duplicados (mismo nombre y formato).`);
  
  duplicates.forEach(k => {
    console.log(`\nDUPLICADO: ${k}`);
    map[k].forEach(p => console.log(`  - ID: ${p.id} | Activo: ${p.activo} | Disponible: ${p.disponible} | Creado: ${p.created_at} | SKU: ${p.sku}`));
  });
}

run();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: products, error } = await supabase
    .from('productos')
    .select('id, nombre, disponible, control_stock, stock, categoria, activo');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Total products: ${products.length}`);
  const activeProducts = products.filter(p => p.activo);
  console.log(`Active products: ${activeProducts.length}`);
  
  // Count by control_stock
  const withControl = activeProducts.filter(p => p.control_stock).length;
  const withoutControl = activeProducts.filter(p => !p.control_stock).length;
  console.log(`Active with control_stock=true: ${withControl}`);
  console.log(`Active with control_stock=false: ${withoutControl}`);
  
  // Count by disponible
  const disponibleCount = activeProducts.filter(p => p.disponible).length;
  const noDisponibleCount = activeProducts.filter(p => !p.disponible).length;
  console.log(`Active with disponible=true: ${disponibleCount}`);
  console.log(`Active with disponible=false: ${noDisponibleCount}`);
  
  console.log('\nSample active products with control_stock=true:');
  console.log(JSON.stringify(activeProducts.filter(p => p.control_stock).slice(0, 5), null, 2));

  console.log('\nSample active products with control_stock=false:');
  console.log(JSON.stringify(activeProducts.filter(p => !p.control_stock).slice(0, 5), null, 2));
}

run();

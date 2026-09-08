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

async function test() {
  console.log('--- Iniciando prueba de categorías comerciales ---');

  // 1. Consultar categorías existentes
  const { data: cats, error: errSelect } = await supabase
    .from('categorias_comerciales')
    .select('*');
  
  if (errSelect) {
    console.error('❌ Error al consultar categorías:', errSelect.message);
    process.exit(1);
  }
  console.log(`✅ Consulta exitosa. Se encontraron ${cats.length} categorías comerciales.`);
  console.log(JSON.stringify(cats, null, 2));

  // 2. Insertar categoría de prueba
  console.log('\n--- Creando categoría de prueba "TestCategoria" ---');
  const { data: newCat, error: errInsert } = await supabase
    .from('categorias_comerciales')
    .insert([{
      nombre: 'TestCategoria',
      tipos_negocio: ['Minimarket', 'Botillería']
    }])
    .select();

  if (errInsert) {
    console.error('❌ Error al insertar categoría:', errInsert.message);
  } else {
    console.log('✅ Categoría creada exitosamente:', JSON.stringify(newCat, null, 2));
  }

  // 3. Modificar categoría de prueba
  console.log('\n--- Modificando categoría "TestCategoria" ---');
  const { data: updatedCat, error: errUpdate } = await supabase
    .from('categorias_comerciales')
    .update({
      nombre: 'TestCategoriaModificada',
      tipos_negocio: ['Minimarket', 'Botillería', 'Comerciante']
    })
    .eq('nombre', 'TestCategoria')
    .select();

  if (errUpdate) {
    console.error('❌ Error al modificar categoría:', errUpdate.message);
  } else {
    console.log('✅ Categoría modificada exitosamente:', JSON.stringify(updatedCat, null, 2));
  }

  // 4. Eliminar categoría de prueba
  console.log('\n--- Eliminando categoría "TestCategoriaModificada" ---');
  const { error: errDelete } = await supabase
    .from('categorias_comerciales')
    .delete()
    .eq('nombre', 'TestCategoriaModificada');

  if (errDelete) {
    console.error('❌ Error al eliminar categoría:', errDelete.message);
  } else {
    console.log('✅ Categoría eliminada exitosamente. DB limpia.');
  }

  console.log('\n--- Prueba finalizada ---');
}

test();

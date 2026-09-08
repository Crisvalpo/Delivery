const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log('Corrigiendo codificación de tipos de negocio en categorias_comerciales...');
  
  const updates = [
    { nombre: 'Abarrotes', tipos_negocio: ['Almacén', 'Minimarket', 'Fiambrería', 'Comerciante'] },
    { nombre: 'Confites', tipos_negocio: ['Almacén', 'Minimarket', 'Botillería', 'Comerciante'] },
    { nombre: 'Limpieza', tipos_negocio: ['Almacén', 'Minimarket', 'Fiambrería', 'Comerciante'] },
    { nombre: 'Verdulería', tipos_negocio: ['Almacén', 'Minimarket', 'Comerciante'] },
    { nombre: 'Bebidas', tipos_negocio: ['Almacén', 'Minimarket', 'Botillería', 'Comerciante'] },
    { nombre: 'Juguetería', tipos_negocio: ['Almacén', 'Minimarket', 'Botillería', 'Fiambrería', 'Comerciante'] }
  ];

  for (const item of updates) {
    const { error } = await supabase
      .from('categorias_comerciales')
      .update({ tipos_negocio: item.tipos_negocio })
      .eq('nombre', item.nombre);
    
    if (error) {
      console.error(`Error actualizando ${item.nombre}:`, error.message);
    } else {
      console.log(`✅ ${item.nombre} corregida con éxito.`);
    }
  }

  console.log('Finalizado.');
}

fix();

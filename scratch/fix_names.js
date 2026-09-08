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
  console.log('Corrigiendo nombres de categorías comerciales...');
  
  const updates = [
    { id: '2d31517f-10d5-4858-b4cf-9fc859b6e032', nombre: 'Verdulería', tipos_negocio: ['Almacén', 'Minimarket', 'Comerciante'] },
    { id: 'f9de62e4-bd17-4585-b893-b441e569c958', nombre: 'Juguetería', tipos_negocio: ['Almacén', 'Minimarket', 'Botillería', 'Fiambrería', 'Comerciante'] }
  ];

  for (const item of updates) {
    const { error } = await supabase
      .from('categorias_comerciales')
      .update({ nombre: item.nombre, tipos_negocio: item.tipos_negocio })
      .eq('id', item.id);
    
    if (error) {
      console.error(`Error actualizando ID ${item.id}:`, error.message);
    } else {
      console.log(`✅ ID ${item.id} corregida con nombre: ${item.nombre}.`);
    }
  }

  console.log('Finalizado.');
}

fix();

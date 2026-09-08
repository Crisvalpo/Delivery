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
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('whatsapp', '56935264052');
  
  if (error) {
    console.error('Error fetching client:', error);
  } else {
    console.log('Client info for Cristian:');
    console.log(JSON.stringify(cliente, null, 2));
  }
}

run();

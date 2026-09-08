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

const updatedTools = [
  {
    "nombre_funcion": "obtener_productos_pesados_sin_stock",
    "descripcion": "Obtiene un listado de productos activos clasificados como 'Pesado' que no están disponibles para la venta (sin stock).",
    "codigo_javascript": "const { data, error } = await supabase.from(\"productos\").select(\"nombre, formato_venta, precio, precio_costo, categoria, sku\").eq(\"tipo_bulto\", \"Pesado\").eq(\"disponible\", false).eq(\"activo\", true); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "properties": {}
    }
  },
  {
    "nombre_funcion": "obtener_sku_producto",
    "descripcion": "Obtiene el SKU de un producto activo dado su nombre.",
    "codigo_javascript": "const { nombre_producto } = args; const { data, error } = await supabase.from(\"productos\").select(\"sku\").eq(\"activo\", true).ilike(\"nombre\", `%${nombre_producto}%`); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "required": [
        "nombre_producto"
      ],
      "properties": {
        "nombre_producto": {
          "type": "string"
        }
      }
    }
  },
  {
    "nombre_funcion": "obtener_productos_pesados_verduras",
    "descripcion": "Obtiene un listado de productos activos clasificados como 'Pesado' y que pertenecen a la categoría 'Verdulería'.",
    "codigo_javascript": "const { data, error } = await supabase.from(\"productos\").select(\"nombre, formato_venta, precio, precio_costo, categoria, tipo_bulto, sku, disponible\").eq(\"tipo_bulto\", \"Pesado\").eq(\"categoria\", \"Verdulería\").eq(\"activo\", true); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "properties": {}
    }
  },
  {
    "nombre_funcion": "obtener_productos_sin_imagen",
    "descripcion": "Obtiene un listado de productos activos que no tienen una URL de imagen asociada o tienen la imagen placeholder por defecto.",
    "codigo_javascript": "const { data, error } = await supabase.from(\"productos\").select(\"nombre, formato_venta, sku\").eq(\"activo\", true).or(\"url_imagen_retail.is.null,url_imagen_retail.eq.,url_imagen_retail.eq.https://cdn.pesco.cl/wp-content/uploads/2021/03/producto_sin_imagen.png\"); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "properties": {}
    }
  },
  {
    "nombre_funcion": "obtener_productos_jugueteria",
    "descripcion": "Obtiene un listado de productos activos de la categoría 'Juguetería' o que pueden ser clasificados como juguetería basándose en su nombre.",
    "codigo_javascript": "const { data, error } = await supabase.from(\"productos\").select(\"nombre, formato_venta, precio, sku, categoria\").eq(\"activo\", true).or(\"categoria.eq.Juguetería,nombre.ilike.%pelota%,nombre.ilike.%juego%,nombre.ilike.%futbol%,nombre.ilike.%basquetbol%\"); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "properties": {}
    }
  },
  {
    "nombre_funcion": "obtener_detalles_producto_por_nombre",
    "descripcion": "Obtiene los detalles de un producto activo (nombre, formato de venta, precio de venta y precio de costo) dado su nombre.",
    "codigo_javascript": "const { nombre_producto } = args; const { data, error } = await supabase.from(\"productos\").select(\"nombre, formato_venta, precio, precio_costo\").eq(\"activo\", true).ilike(\"nombre\", `%${nombre_producto}%`); if (error) throw error; return data;",
    "esquema_json": {
      "type": "OBJECT",
      "required": [
        "nombre_producto"
      ],
      "properties": {
        "nombre_producto": {
          "type": "string"
        }
      }
    }
  }
];

async function run() {
  console.log('🚀 Iniciando actualización de herramientas dinámicas...');
  
  for (const tool of updatedTools) {
    const { data, error } = await supabase
      .from('bot_tools_dinamicas')
      .upsert([tool], { onConflict: 'nombre_funcion' })
      .select();
      
    if (error) {
      console.error(`❌ Error actualizando ${tool.nombre_funcion}:`, error.message);
    } else {
      console.log(`✅ Herramienta ${tool.nombre_funcion} actualizada correctamente.`);
    }
  }
  
  console.log('🎉 Finalizada la actualización de herramientas.');
}

run();

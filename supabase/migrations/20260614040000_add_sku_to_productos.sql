-- =========================================================
-- LukeDelivery B2B - Agregar campo SKU a Productos
-- =========================================================

-- 1. Agregar la columna sku a la tabla productos si no existe
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS sku TEXT;

-- 2. Crear una secuencia temporal para generar SKU correlativos
CREATE SEQUENCE IF NOT EXISTS productos_sku_seq START 1;

-- 3. Asignar SKU correlativos en formato 'LD-00001', 'LD-00002', etc., a los productos existentes
UPDATE public.productos 
SET sku = 'LD-' || LPAD(nextval('productos_sku_seq')::text, 5, '0')
WHERE sku IS NULL;

-- 4. Eliminar la secuencia temporal (opcional, pero la dejaremos por si se requiere generar automáticamente)
-- DROP SEQUENCE productos_sku_seq;

-- 5. Agregar la restricción de unicidad para la columna sku
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_sku_key;
ALTER TABLE public.productos ADD CONSTRAINT productos_sku_key UNIQUE (sku);

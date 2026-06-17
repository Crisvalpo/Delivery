-- =========================================================
-- LukeDelivery B2B - Agregar columnas de Precios y Formatos por Cantidad
-- =========================================================

-- 1. Agregar las nuevas columnas a la tabla de productos si no existen
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS venta_multiplo INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS unidades_embalaje INTEGER,
ADD COLUMN IF NOT EXISTS precio_embalaje_unidad INTEGER;

-- 2. Eliminar restricciones si existen para evitar errores de duplicación
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS check_venta_multiplo;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS check_unidades_embalaje;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS check_precio_embalaje_unidad;

-- 3. Crear restricciones para garantizar la consistencia de los datos
ALTER TABLE public.productos 
    ADD CONSTRAINT check_venta_multiplo CHECK (venta_multiplo >= 1),
    ADD CONSTRAINT check_unidades_embalaje CHECK (unidades_embalaje IS NULL OR unidades_embalaje > 0),
    ADD CONSTRAINT check_precio_embalaje_unidad CHECK (precio_embalaje_unidad IS NULL OR (precio_embalaje_unidad >= 0 AND precio_embalaje_unidad <= precio));

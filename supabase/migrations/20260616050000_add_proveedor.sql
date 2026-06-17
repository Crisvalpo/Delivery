-- =========================================================
-- LukeDelivery B2B - Agregar columna Proveedor a Productos
-- =========================================================

-- 1. Agregar la columna proveedor a la tabla productos si no existe
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS proveedor TEXT;

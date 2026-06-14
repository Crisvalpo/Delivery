-- =========================================================
-- LukeDelivery B2B - Prevención de Duplicidad de Productos
-- =========================================================

-- 1. Limpiar duplicados activos preexistentes
-- Deja activo solo el registro de producto más reciente (con ID más alto)
-- y desactiva (activo = false) los duplicados más antiguos de cada grupo
UPDATE public.productos p1
SET activo = false
WHERE p1.activo = true
  AND p1.id != (
    SELECT p2.id
    FROM public.productos p2
    WHERE LOWER(TRIM(p2.nombre)) = LOWER(TRIM(p1.nombre))
      AND LOWER(TRIM(p2.formato_venta)) = LOWER(TRIM(p1.formato_venta))
      AND p2.activo = true
    ORDER BY p2.created_at DESC
    LIMIT 1
  );

-- 2. Crear un índice único parcial para asegurar que no se creen duplicados activos
-- El índice compuesto aplica sobre LOWER(nombre) y LOWER(formato_venta) sólo si activo = true
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_product_name_format 
ON public.productos (LOWER(TRIM(nombre)), LOWER(TRIM(formato_venta))) 
WHERE (activo = true);

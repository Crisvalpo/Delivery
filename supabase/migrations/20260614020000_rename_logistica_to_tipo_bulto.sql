-- =========================================================
-- LukeDelivery B2B - Renombrar categoria_logistica a tipo_bulto
-- =========================================================

-- 1. Eliminar la restricción de verificación anterior de la columna categoria_logistica
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_categoria_logistica_check;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_tipo_bulto_check;

-- 2. Renombrar la columna de categoria_logistica a tipo_bulto si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productos' AND column_name='categoria_logistica') THEN
    ALTER TABLE public.productos RENAME COLUMN categoria_logistica TO tipo_bulto;
  END IF;
END $$;

-- 3. Crear la nueva restricción en la columna tipo_bulto
ALTER TABLE public.productos ADD CONSTRAINT productos_tipo_bulto_check CHECK (tipo_bulto IN ('Pesado', 'Estándar'));

-- 4. Recrear la función del trigger para calcular el flete en base al nuevo campo tipo_bulto
CREATE OR REPLACE FUNCTION public.recalcular_totales_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_total_neto INTEGER;
    v_total_costo INTEGER;
    v_flete_nuevo INTEGER;
    v_bultos_pesados INTEGER;
    v_flete_base CONSTANT INTEGER := 3000;
    v_recargo_pesado CONSTANT INTEGER := 500;
    v_pedido_id UUID;
BEGIN
    -- Obtener el pedido ID
    v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);

    -- A. Calcular el total neto sumando el precio_unitario * cantidad de los items activos
    SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
    INTO v_total_neto
    FROM public.items_pedido
    WHERE pedido_id = v_pedido_id AND estado != 'no_disponible';

    -- B. Calcular el total costo consultando el precio_costo de la tabla productos
    SELECT COALESCE(SUM(p.precio_costo * ip.cantidad), 0)
    INTO v_total_costo
    FROM public.items_pedido ip
    JOIN public.productos p ON ip.producto_id = p.id
    WHERE ip.pedido_id = v_pedido_id AND ip.estado != 'no_disponible';

    -- C. Calcular la cantidad de bultos pesados para recalcular el flete
    SELECT COALESCE(SUM(ip.cantidad), 0)
    INTO v_bultos_pesados
    FROM public.items_pedido ip
    JOIN public.productos p ON ip.producto_id = p.id
    WHERE ip.pedido_id = v_pedido_id 
      AND p.tipo_bulto = 'Pesado' 
      AND ip.estado != 'no_disponible';

    -- D. Recalcular el flete con la regla de negocio
    v_flete_nuevo := v_flete_base + (v_recargo_pesado * v_bultos_pesados);

    -- E. Actualizar la cabecera del pedido
    UPDATE public.pedidos
    SET 
        total_neto = v_total_neto,
        flete = v_flete_nuevo,
        total_pagar = v_total_neto + v_flete_nuevo,
        total_costo = v_total_costo
    WHERE id = v_pedido_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

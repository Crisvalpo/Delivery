-- =============================================
-- LukeDelivery B2B - Estados por Item y Trigger de Recálculo de Totales
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Agregar columna de estado a la tabla items_pedido
ALTER TABLE public.items_pedido 
ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente' 
CONSTRAINT check_estado_item CHECK (estado IN ('pendiente', 'conseguido', 'no_disponible'));

-- 2. Crear función de recálculo de totales del pedido
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
      AND p.categoria_logistica = 'Pesado' 
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

-- 3. Crear trigger para la actualización y eliminación de items
DROP TRIGGER IF EXISTS trigger_recalcular_totales_pedido ON public.items_pedido;

CREATE TRIGGER trigger_recalcular_totales_pedido
AFTER INSERT OR UPDATE OF estado, cantidad OR DELETE ON public.items_pedido
FOR EACH ROW
EXECUTE FUNCTION public.recalcular_totales_pedido();

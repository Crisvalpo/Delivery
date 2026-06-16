-- Triggers para el control automatizado de stock y disponibilidad

-- 1. Función para descontar stock al crear/modificar/borrar items de pedido
CREATE OR REPLACE FUNCTION public.controlar_stock_items_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_diff INTEGER;
    v_control_stock BOOLEAN;
    v_producto_id UUID;
    v_pedido_id UUID;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_producto_id := NEW.producto_id;
        v_pedido_id := NEW.pedido_id;
        v_diff := NEW.cantidad;
        
        -- Verificar si requiere control de stock
        SELECT control_stock INTO v_control_stock FROM public.productos WHERE id = v_producto_id;
        
        IF (v_control_stock = true) THEN
            -- Restar stock
            UPDATE public.productos 
            SET stock = stock - v_diff
            WHERE id = v_producto_id;
            
            -- Registrar movimiento de salida
            INSERT INTO public.movimientos_stock (producto_id, cantidad, tipo_movimiento, referencia_id, usuario_creador)
            VALUES (v_producto_id, -v_diff, 'venta', v_pedido_id::text, 'sistema_pedidos');
        END IF;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        v_producto_id := NEW.producto_id;
        v_pedido_id := NEW.pedido_id;
        v_diff := NEW.cantidad - OLD.cantidad;
        
        -- Verificar si requiere control de stock
        SELECT control_stock INTO v_control_stock FROM public.productos WHERE id = v_producto_id;
        
        IF (v_control_stock = true AND v_diff <> 0) THEN
            -- Actualizar stock
            UPDATE public.productos 
            SET stock = stock - v_diff
            WHERE id = v_producto_id;
            
            -- Registrar movimiento
            INSERT INTO public.movimientos_stock (producto_id, cantidad, tipo_movimiento, referencia_id, usuario_creador)
            VALUES (v_producto_id, -v_diff, 'venta', v_pedido_id::text, 'sistema_pedidos_update');
        END IF;
        
    ELSIF (TG_OP = 'DELETE') THEN
        v_producto_id := OLD.producto_id;
        v_pedido_id := OLD.pedido_id;
        v_diff := OLD.cantidad;
        
        -- Verificar si requiere control de stock
        SELECT control_stock INTO v_control_stock FROM public.productos WHERE id = v_producto_id;
        
        IF (v_control_stock = true) THEN
            -- Devolver stock
            UPDATE public.productos 
            SET stock = stock + v_diff
            WHERE id = v_producto_id;
            
            -- Registrar movimiento de devolución
            INSERT INTO public.movimientos_stock (producto_id, cantidad, tipo_movimiento, referencia_id, usuario_creador)
            VALUES (v_producto_id, v_diff, 'devolucion', v_pedido_id::text, 'sistema_pedidos_delete');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Crear trigger sobre la tabla items_pedido
DROP TRIGGER IF EXISTS trigger_controlar_stock_items_pedido ON public.items_pedido;

CREATE TRIGGER trigger_controlar_stock_items_pedido
AFTER INSERT OR UPDATE OF cantidad OR DELETE ON public.items_pedido
FOR EACH ROW
EXECUTE FUNCTION public.controlar_stock_items_pedido();


-- 3. Función para actualizar automáticamente disponible = true/false basado en stock
CREATE OR REPLACE FUNCTION public.actualizar_disponibilidad_por_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.control_stock = true) THEN
        IF (NEW.stock <= 0) THEN
            NEW.disponible := false;
        ELSE
            NEW.disponible := true;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear trigger sobre la tabla productos
DROP TRIGGER IF EXISTS trigger_actualizar_disponibilidad_por_stock ON public.productos;

CREATE TRIGGER trigger_actualizar_disponibilidad_por_stock
BEFORE INSERT OR UPDATE OF stock, control_stock ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_disponibilidad_por_stock();

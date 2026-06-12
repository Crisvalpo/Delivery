-- =============================================
-- LukeDelivery B2B - Agregar Ventanas de Pedido
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Crear tabla ventanas_pedido
CREATE TABLE IF NOT EXISTS public.ventanas_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    fecha_cierre TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_entrega TIMESTAMP WITH TIME ZONE NOT NULL,
    activa BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Habilitar RLS en ventanas_pedido
ALTER TABLE public.ventanas_pedido ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas para ventanas_pedido
DROP POLICY IF EXISTS lectura_publica_ventanas_pedido ON public.ventanas_pedido;
CREATE POLICY lectura_publica_ventanas_pedido ON public.ventanas_pedido
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS modificacion_ventanas_pedido ON public.ventanas_pedido;
CREATE POLICY modificacion_ventanas_pedido ON public.ventanas_pedido
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Agregar columna ventana_id a pedidos
ALTER TABLE public.pedidos 
ADD COLUMN IF NOT EXISTS ventana_id UUID REFERENCES public.ventanas_pedido(id);

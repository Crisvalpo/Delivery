-- =============================================
-- LukeDelivery B2B - Tablas de Pedidos
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    total_neto INTEGER NOT NULL CHECK (total_neto >= 0),
    flete INTEGER NOT NULL CHECK (flete >= 0),
    total_pagar INTEGER NOT NULL CHECK (total_pagar >= 0),
    total_costo INTEGER NOT NULL CHECK (total_costo >= 0),
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Preparado', 'En Ruta', 'Entregado', 'Cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de pedidos" ON public.pedidos
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de pedidos" ON public.pedidos
    FOR INSERT TO public WITH CHECK (true);

-- Tabla de ítems de pedidos
CREATE TABLE IF NOT EXISTS public.items_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
    total_item INTEGER NOT NULL CHECK (total_item >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de items_pedido" ON public.items_pedido
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de items_pedido" ON public.items_pedido
    FOR INSERT TO public WITH CHECK (true);

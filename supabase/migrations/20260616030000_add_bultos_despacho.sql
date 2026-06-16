-- =============================================
-- LukeDelivery B2B - Tabla de Bultos de Despacho
-- Honestidad Radical · Placilla & Curauma
-- =============================================

CREATE TABLE IF NOT EXISTS public.bultos_despacho (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
    codigo_bulto TEXT UNIQUE NOT NULL, -- Ej: LDP-10024-B1 (Pedido ID corto - Bulto 1)
    estado TEXT DEFAULT 'preparado' NOT NULL CHECK (estado IN ('preparado', 'en_ruta', 'entregado', 'incidencia')),
    repartidor_id UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,
    entregado_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS y políticas
ALTER TABLE public.bultos_despacho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de bultos_despacho" ON public.bultos_despacho
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de bultos_despacho" ON public.bultos_despacho
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de bultos_despacho" ON public.bultos_despacho
    FOR UPDATE TO public USING (true);

CREATE POLICY "Eliminación pública de bultos_despacho" ON public.bultos_despacho
    FOR DELETE TO public USING (true);

GRANT ALL ON TABLE public.bultos_despacho TO anon, authenticated, service_role;

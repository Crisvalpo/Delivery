-- =========================================================
-- LukeDelivery B2B - Crear Tabla de Proveedores y RLS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    contacto TEXT,
    telefono TEXT,
    contacto_whatsapp TEXT,
    direccion TEXT,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS públicas para simplificación del MVP
CREATE POLICY "Lectura pública de proveedores" ON public.proveedores
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de proveedores" ON public.proveedores
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de proveedores" ON public.proveedores
    FOR UPDATE TO public USING (true);

CREATE POLICY "Borrado público de proveedores" ON public.proveedores
    FOR DELETE TO public USING (true);

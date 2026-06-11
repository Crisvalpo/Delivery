-- =============================================
-- LukeDelivery B2B - Tabla de Trabajadores
-- Honestidad Radical · Placilla & Curauma
-- =============================================

CREATE TABLE IF NOT EXISTS public.trabajadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    whatsapp TEXT NOT NULL UNIQUE,
    rol TEXT NOT NULL CHECK (rol IN ('Administrador', 'Vendedor', 'Repartidor')),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;

-- Lectura, inserción, actualización y eliminación pública (para la integración con el cliente de prueba/API)
CREATE POLICY "Lectura pública de trabajadores" ON public.trabajadores
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de trabajadores" ON public.trabajadores
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de trabajadores" ON public.trabajadores
    FOR UPDATE TO public USING (true);

CREATE POLICY "Eliminación pública de trabajadores" ON public.trabajadores
    FOR DELETE TO public USING (true);

-- Semilla de Trabajadores de prueba
INSERT INTO public.trabajadores (nombre, whatsapp, rol, activo)
VALUES
('Héctor Gómez (Admin)', '56912345678', 'Administrador', true),
('María Flores (Vendedor)', '56987654321', 'Vendedor', true),
('Juan Pérez (Repartidor)', '56955566677', 'Repartidor', true)
ON CONFLICT (whatsapp) DO NOTHING;

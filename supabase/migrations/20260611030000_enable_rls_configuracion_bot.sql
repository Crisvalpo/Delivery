-- =============================================
-- LukeDelivery B2B - Habilitar RLS en configuracion_bot
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Habilitar Row Level Security
ALTER TABLE public.configuracion_bot ENABLE ROW LEVEL SECURITY;

-- 2. Crear políticas de acceso para lectura y modificación
CREATE POLICY lectura_publica_configuracion_bot ON public.configuracion_bot
    FOR SELECT TO public USING (true);

CREATE POLICY modificacion_configuracion_bot ON public.configuracion_bot
    FOR ALL TO public USING (true) WITH CHECK (true);

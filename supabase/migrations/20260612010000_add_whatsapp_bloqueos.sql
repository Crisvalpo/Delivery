-- =============================================
-- LukeDelivery B2B - Tabla de Bloqueos de WhatsApp (Centralizado)
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Crear tabla de bloqueos/silencios de WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_bloqueos (
    whatsapp TEXT PRIMARY KEY,
    silenciado_hasta TIMESTAMP WITH TIME ZONE NOT NULL,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.whatsapp_bloqueos ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas RLS
CREATE POLICY lectura_publica_whatsapp_bloqueos ON public.whatsapp_bloqueos
    FOR SELECT TO public USING (true);

CREATE POLICY modificacion_whatsapp_bloqueos ON public.whatsapp_bloqueos
    FOR ALL TO public USING (true) WITH CHECK (true);

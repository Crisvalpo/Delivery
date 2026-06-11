-- =============================================
-- LukeDelivery B2B - Historial de Chats y Silenciado
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Agregar columna de silenciado a la tabla de clientes si no existe
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS bot_silenciado_hasta TIMESTAMP WITH TIME ZONE NULL;

-- 2. Crear tabla de historial de chats
CREATE TABLE IF NOT EXISTS public.mensajes_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp TEXT NOT NULL,
    remitente TEXT NOT NULL CHECK (remitente IN ('usuario', 'asistente')),
    contenido TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Habilitar RLS en la tabla mensajes_chat
ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;

-- 4. Definir políticas de RLS para lectura y escritura pública
CREATE POLICY "Lectura pública de mensajes_chat" ON public.mensajes_chat
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de mensajes_chat" ON public.mensajes_chat
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de mensajes_chat" ON public.mensajes_chat
    FOR UPDATE TO public USING (true);

CREATE POLICY "Eliminación pública de mensajes_chat" ON public.mensajes_chat
    FOR DELETE TO public USING (true);

-- 5. Otorgar permisos explicitos a los roles de Supabase API
GRANT ALL ON TABLE public.mensajes_chat TO anon, authenticated, service_role;

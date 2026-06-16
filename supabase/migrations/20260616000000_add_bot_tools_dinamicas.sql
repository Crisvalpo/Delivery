-- Crear tabla para persistir las herramientas dinámicas del bot
CREATE TABLE IF NOT EXISTS public.bot_tools_dinamicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_funcion TEXT UNIQUE NOT NULL,
    descripcion TEXT NOT NULL,
    codigo_javascript TEXT NOT NULL,
    esquema_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS y políticas
ALTER TABLE public.bot_tools_dinamicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de bot_tools_dinamicas" ON public.bot_tools_dinamicas
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de bot_tools_dinamicas" ON public.bot_tools_dinamicas
    FOR INSERT TO public WITH CHECK (true);

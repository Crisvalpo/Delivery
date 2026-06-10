-- =============================================
-- LukeDelivery B2B - Sesiones de Formulario (WhatsApp Webview Tokens)
-- Honestidad Radical · Placilla & Curauma
-- =============================================

CREATE TABLE IF NOT EXISTS public.sesiones_formulario (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    usado BOOLEAN NOT NULL DEFAULT false,
    expira_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.sesiones_formulario ENABLE ROW LEVEL SECURITY;

-- Permite lectura pública si es necesario, pero las consultas se harán preferentemente vía Service Role del servidor
CREATE POLICY "Lectura pública de sesiones_formulario" ON public.sesiones_formulario
    FOR SELECT TO public USING (true);

-- Permite inserción/modificación para que n8n o la API puedan insertar/actualizar
CREATE POLICY "Inserción pública de sesiones_formulario" ON public.sesiones_formulario
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de sesiones_formulario" ON public.sesiones_formulario
    FOR UPDATE TO public USING (true);

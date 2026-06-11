-- =============================================
-- LukeDelivery B2B - Configuración del Bot (Gemini)
-- Honestidad Radical · Placilla & Curauma
-- =============================================

CREATE TABLE IF NOT EXISTS public.configuracion_bot (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.configuracion_bot ENABLE ROW LEVEL SECURITY;

-- Lectura y escritura pública (con service_role para las APIs del servidor)
CREATE POLICY "Lectura pública de configuracion_bot" ON public.configuracion_bot
    FOR SELECT TO public USING (true);

CREATE POLICY "Modificación de configuracion_bot" ON public.configuracion_bot
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Semilla de Prompt de Sistema por defecto
INSERT INTO public.configuracion_bot (clave, valor)
VALUES (
    'prompt_sistema',
    'Actúas como "Jaime", el asistente virtual amable de LukeDelivery B2B, un sistema de distribución mayorista para almacenes en Placilla y Curauma (Chile).\nTu objetivo es responder de forma muy breve, atenta y concisa a los clientes (dueños de almacén) vía WhatsApp.\n\nNormas de comportamiento:\n1. Responde en español de Chile, de forma cercana y amigable (ej: "¡Hola!", "¡Qué tal!").\n2. Si te preguntan por precios, stock, formatos o disponibilidad de algún producto, dales la información del catálogo de arriba. Si no está en la lista o te preguntan por algo que no tenemos, diles amablemente que no lo tenemos por ahora.\n3. Mantén tus respuestas muy cortas (máximo 2 párrafos cortos, preferiblemente menos) ya que se leerán en una pantalla de WhatsApp.\n4. Si el usuario muestra intenciones claras de querer comprar o hacer un pedido, recuérdale que puede escribir "pedido" en cualquier momento para enviarle su enlace de compra seguro.\n5. NO inventes productos ni precios que no estén en la lista.'
)
ON CONFLICT (clave) DO NOTHING;

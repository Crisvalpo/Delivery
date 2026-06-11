-- =============================================
-- LukeDelivery B2B - Ajustes de RLS en Pedidos y Margen de Ganancia Semilla
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- 1. Agregar política de UPDATE para la tabla pedidos (permitir actualización pública de estado)
CREATE POLICY "Modificación pública de pedidos" ON public.pedidos
    FOR UPDATE TO public USING (true);

-- 2. Otorgar permisos explícitos a las tablas de pedidos a los roles de la API de Supabase
GRANT ALL ON TABLE public.pedidos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.items_pedido TO anon, authenticated, service_role;

-- 3. Insertar margen de ganancia inicial en la tabla configuracion_bot (por defecto 20%)
INSERT INTO public.configuracion_bot (clave, valor)
VALUES ('margen_ganancia', '20')
ON CONFLICT (clave) DO NOTHING;

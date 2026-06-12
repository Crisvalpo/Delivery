-- =============================================
-- LukeDelivery B2B — Restringir RLS trabajadores
-- Solo service_role puede escribir; lectura pública OK
-- =============================================

-- 1. Eliminar las políticas permisivas actuales de escritura
DROP POLICY IF EXISTS "Inserción pública de trabajadores" ON public.trabajadores;
DROP POLICY IF EXISTS "Modificación pública de trabajadores" ON public.trabajadores;
DROP POLICY IF EXISTS "Eliminación pública de trabajadores" ON public.trabajadores;

-- 2. Crear políticas restrictivas: solo service_role puede escribir
CREATE POLICY "Inserción solo service_role de trabajadores" ON public.trabajadores
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Modificación solo service_role de trabajadores" ON public.trabajadores
    FOR UPDATE TO service_role USING (true);

CREATE POLICY "Eliminación solo service_role de trabajadores" ON public.trabajadores
    FOR DELETE TO service_role USING (true);

-- 3. La lectura pública se mantiene para que el bot Jaime consulte roles
-- "Lectura pública de trabajadores" ya existe y no se toca.

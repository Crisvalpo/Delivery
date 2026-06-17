-- =========================================================
-- LukeDelivery B2B - Agregar Geolocalización a Proveedores y Permisos
-- =========================================================

-- 1. Agregar columnas de geolocalización
ALTER TABLE public.proveedores 
ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;

-- 2. Conceder privilegios explícitos para resolver el error de permisos en Supabase autoalojado
GRANT ALL PRIVILEGES ON public.proveedores TO postgres, service_role, anon, authenticated;

-- =======================================================
-- SQL Migration: Hacer columnas de registro de clientes anulables
-- e introducir el campo registro_completo.
-- =======================================================

-- 1. Alterar columnas para permitir NULL (registro temporal previo)
ALTER TABLE public.clientes ALTER COLUMN sector DROP NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN latitud DROP NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN longitud DROP NOT NULL;

-- 2. Agregar columna registro_completo
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS registro_completo BOOLEAN NOT NULL DEFAULT false;

-- 3. Marcar clientes existentes con registro completo
UPDATE public.clientes SET registro_completo = true 
WHERE latitud IS NOT NULL AND longitud IS NOT NULL AND sector IS NOT NULL;

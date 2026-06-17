-- =======================================================
-- SQL Migration: Agregar tipo de negocio 'Comerciante'
-- =======================================================

-- 1. Eliminar la restricción CHECK anterior
ALTER TABLE public.clientes 
DROP CONSTRAINT IF EXISTS clientes_tipo_negocio_check;

-- 2. Agregar la nueva restricción CHECK con 'Comerciante' incluido
ALTER TABLE public.clientes 
ADD CONSTRAINT clientes_tipo_negocio_check 
CHECK (tipo_negocio IN ('Almacén', 'Minimarket', 'Botillería', 'Fiambrería', 'Comerciante'));

-- Migración para añadir la columna whatsapp_lid a la tabla clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;

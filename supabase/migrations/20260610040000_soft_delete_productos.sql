-- =======================================================
-- SQL Migration: Soft Delete para Productos
-- =======================================================

ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

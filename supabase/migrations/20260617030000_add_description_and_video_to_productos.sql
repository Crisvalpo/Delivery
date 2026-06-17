-- =======================================================
-- SQL Migration: Agregar columnas descripcion y url_video a productos
-- =======================================================

ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS descripcion TEXT,
ADD COLUMN IF NOT EXISTS url_video TEXT;

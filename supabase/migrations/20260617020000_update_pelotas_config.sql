-- =======================================================
-- SQL Migration: Configurar venta por pack de 12 para Pelotas Plásticas
-- =======================================================

UPDATE public.productos 
SET venta_multiplo = 12 
WHERE nombre = 'Pelotas Plásticas';

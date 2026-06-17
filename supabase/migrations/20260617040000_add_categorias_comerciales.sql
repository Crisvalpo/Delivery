-- =======================================================
-- SQL Migration: Desacoplar categorías comerciales
-- =======================================================

-- 1. Crear tabla para categorías comerciales
CREATE TABLE IF NOT EXISTS public.categorias_comerciales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL,
    tipos_negocio TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Habilitar seguridad a nivel de fila (RLS)
ALTER TABLE public.categorias_comerciales ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas públicas de lectura e inserción/modificación
CREATE POLICY "Lectura pública de categorias_comerciales" ON public.categorias_comerciales
    FOR SELECT TO public USING (true);

CREATE POLICY "Modificación de categorias_comerciales" ON public.categorias_comerciales
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Insertar datos semilla iniciales de compatibilidad
INSERT INTO public.categorias_comerciales (nombre, tipos_negocio)
VALUES
  ('Abarrotes', ARRAY['Almacén', 'Minimarket', 'Fiambrería', 'Comerciante']),
  ('Confites', ARRAY['Almacén', 'Minimarket', 'Botillería', 'Comerciante']),
  ('Limpieza', ARRAY['Almacén', 'Minimarket', 'Fiambrería', 'Comerciante']),
  ('Verdulería', ARRAY['Almacén', 'Minimarket', 'Comerciante']),
  ('Bebidas', ARRAY['Almacén', 'Minimarket', 'Botillería', 'Comerciante']),
  ('Juguetería', ARRAY['Almacén', 'Minimarket', 'Botillería', 'Fiambrería', 'Comerciante'])
ON CONFLICT (nombre) DO UPDATE 
SET tipos_negocio = EXCLUDED.tipos_negocio;

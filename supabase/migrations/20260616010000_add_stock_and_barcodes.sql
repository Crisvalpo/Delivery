-- Migración para la Fase 1 del plan de mejoras: Control de Stock y Códigos de barra.

-- 1. Añadir columnas a public.productos
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS control_stock BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS codigo_barras TEXT UNIQUE;

-- 2. Crear tabla public.movimientos_stock
CREATE TABLE IF NOT EXISTS public.movimientos_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    referencia_id TEXT,
    usuario_creador TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Habilitar RLS en public.movimientos_stock
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de movimientos_stock" ON public.movimientos_stock
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de movimientos_stock" ON public.movimientos_stock
    FOR INSERT TO public WITH CHECK (true);

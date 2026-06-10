-- =======================================================
-- SQL Migration: Categorización de Negocios y Productos
-- =======================================================

-- 1. Agregar tipo_negocio a la tabla de clientes
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS tipo_negocio TEXT NOT NULL DEFAULT 'Almacén'
CHECK (tipo_negocio IN ('Almacén', 'Minimarket', 'Botillería', 'Fiambrería'));

-- 2. Agregar categoria a la tabla de productos
ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Abarrotes';

-- 3. Actualizar categorías de los productos existentes
UPDATE public.productos SET categoria = 'Verdulería' WHERE nombre = 'Malla de Papas 25kg';
UPDATE public.productos SET categoria = 'Limpieza' WHERE nombre = 'Detergente Bidón 5L';
UPDATE public.productos SET categoria = 'Confites' WHERE nombre = 'Confites Surtidos Fruna 1kg';
UPDATE public.productos SET categoria = 'Abarrotes' WHERE nombre IN ('Aceite Vegetal 900ml', 'Arroz Grano Largo 1kg', 'Harina sin Polvos 1kg');

-- 4. Insertar productos del área "Bebidas y Alcoholes" para pruebas de Botillería
INSERT INTO public.productos (nombre, formato_venta, precio, precio_costo, categoria_logistica, url_imagen_retail, disponible, categoria)
VALUES
('Cerveza Corona Pack 6u', 'Pack 6u (355ml)', 6500, 5200, 'Estándar', 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=200&auto=format&fit=crop&q=60', true, 'Bebidas'),
('Pisco Alto del Carmen 35º', 'Botella 750ml', 7200, 5800, 'Estándar', 'https://images.unsplash.com/photo-1516600171743-264178aa80b7?w=200&auto=format&fit=crop&q=60', true, 'Bebidas'),
('Coca-Cola Original 1.5L', 'Botella 1.5L', 1800, 1400, 'Estándar', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&auto=format&fit=crop&q=60', true, 'Bebidas')
ON CONFLICT DO NOTHING;

-- 5. Actualizar tipos de negocio para los clientes semilla existentes
UPDATE public.clientes SET tipo_negocio = 'Almacén' WHERE nombre_tienda = 'Almacén Don Tito';
UPDATE public.clientes SET tipo_negocio = 'Minimarket' WHERE nombre_tienda = 'Minimarket Curauma';
UPDATE public.clientes SET tipo_negocio = 'Botillería' WHERE nombre_tienda = 'Botillería El Bosque';

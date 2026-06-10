-- =============================================
-- LukeDelivery B2B - Tablas del MVP
-- Honestidad Radical · Placilla & Curauma
-- =============================================

-- Tabla de productos (catálogo de mercadería)
CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    formato_venta TEXT NOT NULL,
    precio INTEGER NOT NULL,
    precio_costo INTEGER NOT NULL,
    categoria_logistica TEXT NOT NULL CHECK (categoria_logistica IN ('Pesado', 'Estándar')),
    url_imagen_retail TEXT,
    disponible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de productos" ON public.productos
    FOR SELECT TO public USING (true);

-- Tabla de clientes (almacenes mapeados)
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_tienda TEXT NOT NULL,
    nombre_contacto TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    sector TEXT NOT NULL,
    notas_campo TEXT,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    prioridad_territorial TEXT NOT NULL CHECK (prioridad_territorial IN ('Alta', 'Media', 'Baja')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de clientes" ON public.clientes
    FOR SELECT TO public USING (true);

CREATE POLICY "Inserción pública de clientes" ON public.clientes
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Modificación pública de clientes" ON public.clientes
    FOR UPDATE TO public USING (true);

-- =============================================
-- Datos semilla para pruebas
-- =============================================

-- Productos del mayorista
INSERT INTO public.productos (nombre, formato_venta, precio, precio_costo, categoria_logistica, url_imagen_retail, disponible)
VALUES
('Malla de Papas 25kg', 'Saco 25kg', 12000, 10000, 'Pesado', 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200&auto=format&fit=crop&q=60', true),
('Aceite Vegetal 900ml', 'Botella 1u', 1500, 1300, 'Estándar', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=200&auto=format&fit=crop&q=60', true),
('Arroz Grano Largo 1kg', 'Bolsa 1u', 1200, 1000, 'Estándar', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200&auto=format&fit=crop&q=60', true),
('Detergente Bidón 5L', 'Bidón 5L', 6500, 5000, 'Pesado', 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=200&auto=format&fit=crop&q=60', true),
('Confites Surtidos Fruna 1kg', 'Bolsa 1u', 4500, 4000, 'Estándar', 'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=200&auto=format&fit=crop&q=60', true),
('Harina sin Polvos 1kg', 'Bolsa 1u', 900, 800, 'Estándar', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&auto=format&fit=crop&q=60', true)
ON CONFLICT DO NOTHING;

-- Clientes almacenes en Placilla / Curauma
INSERT INTO public.clientes (nombre_tienda, nombre_contacto, whatsapp, sector, notas_campo, latitud, longitud, prioridad_territorial)
VALUES
('Almacén Don Tito', 'Héctor Gómez', '+56912345678', 'Placilla Oriente', 'Cliente histórico, prefiere entrega temprano', -33.1042, -71.5543, 'Alta'),
('Minimarket Curauma', 'María Flores', '+56987654321', 'Curauma Norte', 'Ubicado frente a plaza de juegos', -33.0298, -71.5821, 'Media'),
('Botillería El Bosque', 'Juan Pérez', '+56955566677', 'Placilla Poniente', 'Solo pide confites de Fruna', -33.1005, -71.5612, 'Baja')
ON CONFLICT DO NOTHING;

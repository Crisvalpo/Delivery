INSERT INTO public.productos (nombre, formato_venta, precio_costo, precio, categoria, tipo_bulto, sku, disponible, activo, url_imagen_retail)
VALUES
('Tomate Larga Vida', 'Caja 10kg', 8000, 9600, 'Verdulería', 'Pesado', 'LD-VER01', true, true, 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=200&q=60'),
('Lechuga Costina', 'Unidad 1u', 800, 1000, 'Verdulería', 'Estándar', 'LD-VER02', true, true, 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=200&q=60'),
('Zanahoria Selección', 'Bolsa 5kg', 3000, 3600, 'Verdulería', 'Estándar', 'LD-VER03', true, true, 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=200&q=60'),
('Cebolla Guarda', 'Malla 20kg', 9000, 10800, 'Verdulería', 'Pesado', 'LD-VER04', true, true, 'https://images.unsplash.com/photo-1508747705729-e0b85702154b?w=200&q=60'),
('Limón Sutil', 'Malla 5kg', 4000, 4800, 'Verdulería', 'Estándar', 'LD-VER05', true, true, 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=200&q=60'),
('Manzana Royal Gala', 'Caja 15kg', 12000, 14400, 'Verdulería', 'Pesado', 'LD-VER06', true, true, 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200&q=60'),
('Plátano Granel', 'Caja 18kg', 15000, 18000, 'Verdulería', 'Pesado', 'LD-VER07', true, true, 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200&q=60'),
('Naranja Valencia', 'Malla 10kg', 7000, 8400, 'Verdulería', 'Pesado', 'LD-VER08', true, true, 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=200&q=60'),
('Zapallo Italiano', 'Unidad 1u', 500, 600, 'Verdulería', 'Estándar', 'LD-VER09', true, true, 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&q=60'),
('Palta Hass Extra', 'Caja 10kg', 25000, 30000, 'Verdulería', 'Pesado', 'LD-VER10', true, true, 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=200&q=60'),
('Pimentón Rojo', 'Bolsa 3u', 1500, 1800, 'Verdulería', 'Estándar', 'LD-VER11', true, true, 'https://images.unsplash.com/photo-1563565088985-f1a0876ee603?w=200&q=60'),
('Papa Roja Planchón', 'Malla 25kg', 11000, 13200, 'Verdulería', 'Pesado', 'LD-VER12', true, true, 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200&q=60'),
('Choclo Dulce', 'Bolsa 5u', 2000, 2400, 'Verdulería', 'Estándar', 'LD-VER13', true, true, 'https://images.unsplash.com/photo-1551754655-cd27e38d20f6?w=200&q=60'),
('Ajo Trenzado', 'Trenza 5u', 1500, 1800, 'Verdulería', 'Estándar', 'LD-VER14', true, true, 'https://images.unsplash.com/photo-1540120084882-749e75525547?w=200&q=60'),
('Acelga Fresca', 'Mata 1u', 700, 900, 'Verdulería', 'Estándar', 'LD-VER15', true, true, 'https://images.unsplash.com/photo-1506806732259-39c2d0268443?w=200&q=60')
ON CONFLICT (sku) DO UPDATE 
SET 
  nombre = EXCLUDED.nombre,
  formato_venta = EXCLUDED.formato_venta,
  precio_costo = EXCLUDED.precio_costo,
  precio = EXCLUDED.precio,
  categoria = EXCLUDED.categoria,
  tipo_bulto = EXCLUDED.tipo_bulto,
  disponible = EXCLUDED.disponible,
  activo = EXCLUDED.activo,
  url_imagen_retail = EXCLUDED.url_imagen_retail;

-- =============================================================
-- SETUP: Preparar la tabla static_stops para almacenar paradas
-- Ejecutar en Supabase → SQL Editor ANTES del script de importación
-- =============================================================

-- 1. Añadir columnas necesarias
ALTER TABLE public.static_stops ADD COLUMN IF NOT EXISTS cod_mode integer NOT NULL DEFAULT 8;
ALTER TABLE public.static_stops ADD COLUMN IF NOT EXISTS cod_estacion text;
ALTER TABLE public.static_stops ADD COLUMN IF NOT EXISTS lines text;

-- 2. Índice para búsquedas por viewport (lat/lng bounding box)
CREATE INDEX IF NOT EXISTS idx_stops_lat ON public.static_stops (lat);
CREATE INDEX IF NOT EXISTS idx_stops_lng ON public.static_stops (lng);

-- 3. Políticas RLS (static_stops es una tabla de referencia pública)
CREATE POLICY "Lectura publica de paradas"
  ON public.static_stops FOR SELECT USING (true);

CREATE POLICY "Insercion de paradas"
  ON public.static_stops FOR INSERT WITH CHECK (true);

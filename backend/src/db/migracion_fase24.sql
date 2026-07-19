-- ══════════════════════════════════════════════════════════════
-- FASE 24 — ENCUESTAS CON UBICACIÓN (para la capa del mapa)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE encuesta_respuestas ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE encuesta_respuestas ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE encuesta_respuestas ADD COLUMN IF NOT EXISTS seccion_id INTEGER REFERENCES secciones(id);

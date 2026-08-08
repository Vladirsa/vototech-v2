-- ══════════════════════════════════════════════════════════════
-- FASE 35 — SEGMENTACIÓN DE PROMOVIDOS (género, rango de edad)
-- ══════════════════════════════════════════════════════════════
-- No usamos datos del INE (no se puede legalmente, y tampoco vienen
-- desglosados así) — esto se llena con lo que el propio promotor
-- captura en campo, opcional, mientras registra a alguien. Con el
-- tiempo esto se vuelve una base real de segmentación propia.
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS genero VARCHAR(20);
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS rango_edad VARCHAR(20);

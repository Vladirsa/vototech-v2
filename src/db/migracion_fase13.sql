-- ══════════════════════════════════════════════════════════════
-- FASE 13 — ENCUESTA RÁPIDA Y SITUACIONES GRAVES
-- ══════════════════════════════════════════════════════════════
-- Para que el candidato llegue informado y empático a cada
-- reunión: qué necesidades declaran los vecinos de esa sección,
-- y si hay algo grave que deba saber antes de hablar con la gente.
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS situacion_grave VARCHAR(500);

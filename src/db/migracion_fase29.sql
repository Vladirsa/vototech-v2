-- ══════════════════════════════════════════════════════════════
-- FASE 29 — ACEPTACIÓN DE TÉRMINOS Y GENERACIÓN DE CONTRATO
-- ══════════════════════════════════════════════════════════════
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS terminos_aceptados_en TIMESTAMPTZ;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS terminos_version VARCHAR(20);

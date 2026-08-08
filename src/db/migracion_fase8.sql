-- ══════════════════════════════════════════════════════════════
-- FASE 8 — MARCA DE CUENTA DEMO
-- ══════════════════════════════════════════════════════════════
-- Identifica la campaña de ejemplo para presentaciones de venta,
-- separada de las campañas reales de candidatos.

ALTER TABLE campanas ADD COLUMN IF NOT EXISTS es_demo BOOLEAN DEFAULT false;

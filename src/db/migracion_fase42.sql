-- ══════════════════════════════════════════════════════════════
-- FASE 42 — GASTOS: evidencia y ubicación obligatorias, y varios
-- gastos ligados al mismo evento (un evento puede tener renta de
-- sillas, sonido, comida, transporte, todos por separado).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS evento_id UUID REFERENCES agenda(id) ON DELETE SET NULL;
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7);
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7);
CREATE INDEX IF NOT EXISTS idx_gastos_evento ON gastos_campana(evento_id) WHERE evento_id IS NOT NULL;

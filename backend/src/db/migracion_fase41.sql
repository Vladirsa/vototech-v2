-- ══════════════════════════════════════════════════════════════
-- FASE 41 — ESTRUCTURA JERÁRQUICA COMPLETA + APROBACIÓN EN CASCADA
-- ══════════════════════════════════════════════════════════════
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado BOOLEAN DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ;

-- Los que ya existen quedan aprobados automático (no se les va a
-- pedir aprobación retroactiva) — solo lo nuevo pasa por el flujo.
UPDATE usuarios SET aprobado = true, aprobado_en = creado_en WHERE aprobado IS NULL;

-- ══════════════════════════════════════════════════════════════
-- FASE 10 — PANEL DE MANDO COMPLETO (candidato / coordinador)
-- ══════════════════════════════════════════════════════════════

-- Meta de votos configurable por el candidato (para el avance hacia
-- la meta electoral) — si no se configura, se usa un valor derivado.
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS meta_votos INTEGER;

-- Activos: soporte para material promocional (playeras, gorras...)
-- que se maneja por CANTIDAD, no por ubicación única como una barda.
ALTER TABLE activos ADD COLUMN IF NOT EXISTS cantidad INTEGER;
ALTER TABLE activos ADD COLUMN IF NOT EXISTS subtipo VARCHAR(50);

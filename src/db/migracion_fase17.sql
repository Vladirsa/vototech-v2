-- ══════════════════════════════════════════════════════════════
-- FASE 17 — ORGANIGRAMA REAL DE CAMPAÑA
-- ══════════════════════════════════════════════════════════════
-- "puesto" es el título real y específico de la persona (Secretario
-- Particular, Coordinador Territorial, Coordinador de Jóvenes...) —
-- separado de "rol", que sigue controlando permisos y el semáforo
-- de salud organizacional (rangos sanos de gente a cargo).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puesto VARCHAR(100);

-- ══════════════════════════════════════════════════════════════
-- FASE 33 — AUTENTICACIÓN DE DOS FACTORES (2FA)
-- ══════════════════════════════════════════════════════════════
-- Recomendado, NO forzado — para candidato, jefe_campana y
-- coord_general (los roles con más poder en el sistema). El secreto
-- se guarda cifrado en la práctica por estar en una base ya cifrada
-- en reposo por Supabase; aquí solo se marca si está activo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dos_factores_secreto VARCHAR(64);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dos_factores_activo BOOLEAN DEFAULT false;

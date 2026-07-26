-- ══════════════════════════════════════════════════════════════
-- FASE 45 — CORRECCIÓN: nombres de coalición más largos que 20
-- caracteres (ej. "coalicion_morena_pvem_rsp_fxm_panalt") truncaban
-- con error al cargar resultados reales del PREP.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE resultados_historicos ALTER COLUMN partido TYPE VARCHAR(60);
ALTER TABLE resultados_agregados ALTER COLUMN partido TYPE VARCHAR(60);

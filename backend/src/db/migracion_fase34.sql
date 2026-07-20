-- ══════════════════════════════════════════════════════════════
-- FASE 34 — FICHA COMPLETA DE REUNIONES EN AGENDA
-- ══════════════════════════════════════════════════════════════
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS anfitrion_nombre VARCHAR(200);
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS anfitrion_telefono VARCHAR(20);
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS estructura_relacionada VARCHAR(150);
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS grupo_social VARCHAR(150);
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS ofrece_aperitivo BOOLEAN DEFAULT false;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS detalle_aperitivo VARCHAR(200);
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS personas_esperadas INTEGER;

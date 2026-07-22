-- ══════════════════════════════════════════════════════════════
-- FASE 38 — SEGUIMIENTO A PERSUADIBLES
-- ══════════════════════════════════════════════════════════════
-- La brecha real que resuelve esto: un promotor marca a alguien como
-- "persuadible" y ahí se queda — nadie regresa por esa persona a
-- menos que alguien decida hacerlo por su cuenta. Esto le pone
-- fecha y responsable al seguimiento, para que no se pierda.
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS proximo_seguimiento DATE;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS asignado_seguimiento_a UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS notas_seguimiento TEXT;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS veces_contactado INTEGER DEFAULT 0;

CREATE INDEX idx_promovidos_seguimiento ON promovidos(campana_id, proximo_seguimiento) WHERE clasificacion = 'persuadible';

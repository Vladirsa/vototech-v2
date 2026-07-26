-- ══════════════════════════════════════════════════════════════
-- FASE 43 — PERMISOS PERSONALIZABLES DESDE EL PANEL
-- ══════════════════════════════════════════════════════════════
-- La matriz de permisos por rol vivía fija en el código — ahora el
-- candidato/jefe de campaña puede AJUSTAR excepciones desde la
-- interfaz, sin tocar código. Solo se guardan las EXCEPCIONES a la
-- regla por default — si no hay fila aquí, se usa el default normal.
CREATE TABLE IF NOT EXISTS permisos_personalizados (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id  UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  rol         VARCHAR(40) NOT NULL,
  modulo      VARCHAR(30) NOT NULL,
  permitido   BOOLEAN NOT NULL,
  actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campana_id, rol, modulo)
);
CREATE INDEX IF NOT EXISTS idx_permisos_personalizados ON permisos_personalizados(campana_id);

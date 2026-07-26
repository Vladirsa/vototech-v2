-- ══════════════════════════════════════════════════════════════
-- FASE 44 — CARGA DE DATOS DESDE EL PANEL (afiliados + presidencial)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS afiliados (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estado_id     SMALLINT NOT NULL REFERENCES estados(id),
  nombre        VARCHAR(200) NOT NULL,
  seccion_id    INTEGER REFERENCES secciones(id),
  telefono      VARCHAR(20),
  direccion     VARCHAR(300),
  partido       VARCHAR(20),
  fuente_archivo VARCHAR(200), -- nombre del archivo de donde vino, para rastrear origen
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_afiliados_estado ON afiliados(estado_id);
CREATE INDEX IF NOT EXISTS idx_afiliados_seccion ON afiliados(seccion_id);

-- ══════════════════════════════════════════════════════════════
-- FASE 3 — AGENDA DE CAMPAÑA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE agenda (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  titulo          VARCHAR(200) NOT NULL,
  tipo            VARCHAR(30) DEFAULT 'evento',   -- 'evento','reunion','recorrido','entrevista'
  fecha_inicio    TIMESTAMPTZ NOT NULL,
  fecha_fin       TIMESTAMPTZ,
  lugar           VARCHAR(255),
  seccion_id      INTEGER REFERENCES secciones(id),
  descripcion     TEXT,
  creado_por      UUID NOT NULL REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agenda_campana_fecha ON agenda(campana_id, fecha_inicio);

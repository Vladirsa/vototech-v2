-- ══════════════════════════════════════════════════════════════
-- FASE 7 — EVIDENCIA FOTOGRÁFICA
-- ══════════════════════════════════════════════════════════════
-- Una sola tabla para todas las fotos del sistema, ligadas por
-- contexto ('incidencia', 'acta', 'casa') + el id del registro.
-- Los archivos físicos viven en Supabase Storage (mismo proyecto
-- que la base de datos); aquí solo se guarda la referencia.

CREATE TABLE IF NOT EXISTS fotos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  contexto        VARCHAR(20) NOT NULL,     -- 'incidencia', 'acta', 'casa'
  referencia_id   UUID NOT NULL,            -- id de la incidencia/resultado/casa
  url             TEXT NOT NULL,
  peso_kb         INTEGER,
  subido_por      UUID NOT NULL REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fotos_referencia ON fotos(campana_id, contexto, referencia_id);

-- ══════════════════════════════════════════════════════════════
-- FASE 32 — CENTRO DE DOCUMENTOS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE documentos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id    UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  categoria     VARCHAR(30) NOT NULL, -- ine, nombramiento, acta, contrato, oficio, otro
  nombre        VARCHAR(255) NOT NULL,
  nombre_archivo_original VARCHAR(255),
  url           TEXT NOT NULL,
  tamano_kb     INTEGER,
  subido_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_documentos_campana ON documentos(campana_id, categoria);

-- ══════════════════════════════════════════════════════════════
-- FASE 39 — RESULTADOS AGREGADOS (Senadurías, Dip. Federal, Dip.
-- Local, Ayuntamientos) POR DISTRITO/ESTADO — distinto de
-- resultados_historicos que es por SECCIÓN. Aquí van resultados a
-- nivel distrito federal, distrito local, o estado completo, cuando
-- no existe (o no aplica) el desglose sección por sección.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS resultados_agregados (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estado_id       INTEGER NOT NULL DEFAULT 29,
  tipo_eleccion   VARCHAR(30) NOT NULL, -- senaduria, dip_federal, dip_local, ayuntamiento
  anio            INTEGER NOT NULL,
  nivel           VARCHAR(20) NOT NULL, -- 'distrito_federal', 'distrito_local', 'estado'
  distrito_numero INTEGER, -- NULL cuando nivel='estado'
  distrito_cabecera VARCHAR(100),
  partido         VARCHAR(20) NOT NULL,
  candidato       VARCHAR(200),
  votos           INTEGER,
  porcentaje      NUMERIC(5,2),
  gano            BOOLEAN DEFAULT false,
  alcaldias_ganadas INTEGER, -- solo aplica a ayuntamiento nivel=estado
  notas           TEXT,
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resultados_agregados ON resultados_agregados(estado_id, tipo_eleccion, anio, nivel);

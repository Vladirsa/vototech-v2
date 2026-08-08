-- ══════════════════════════════════════════════════════════════
-- FASE 5b — CASAS SIMULADAS (control de casa por casa)
-- ══════════════════════════════════════════════════════════════
-- No existe un catastro público de lotes/casas individuales, así
-- que se SIMULAN puntos distribuidos a lo largo del perímetro de
-- cada manzana (aproximando dónde estarían las fachadas de las
-- casas viendo hacia la calle). No son domicilios reales exactos,
-- pero sirven perfecto para que el equipo marque manzana por
-- manzana qué tanto se ha cubierto — igual que tocar puertas real.

CREATE TABLE casas_simuladas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  seccion_id      INTEGER NOT NULL REFERENCES secciones(id),
  manzana_num     INTEGER NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'sin_visitar',
    -- 'sin_visitar', 'visitado', 'promovido', 'competencia', 'no_toco'
  partido_competencia VARCHAR(20),   -- solo si estado='competencia'
  promovido_id    UUID REFERENCES promovidos(id) ON DELETE SET NULL,
  notas           VARCHAR(300),
  actualizado_por UUID REFERENCES usuarios(id),
  actualizado_en  TIMESTAMPTZ DEFAULT now(),
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_casas_campana_seccion ON casas_simuladas(campana_id, seccion_id);
CREATE INDEX idx_casas_manzana ON casas_simuladas(campana_id, seccion_id, manzana_num);

-- ══════════════════════════════════════════════════════════════
-- FASE 19 — DÍA DE LA ELECCIÓN: PREP, CASILLAS, CIERRE, CONFIRMAR VOTO
-- ══════════════════════════════════════════════════════════════

-- Ubicación de casillas (registrada por el equipo, no viene del INE
-- automáticamente) — para verla en el mapa y saber cobertura real.
CREATE TABLE casillas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id            UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  seccion_id            INTEGER NOT NULL REFERENCES secciones(id),
  numero                VARCHAR(20) NOT NULL DEFAULT 'B',
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  direccion             VARCHAR(255),
  representante_id      UUID REFERENCES usuarios(id),
  confirmado_asistencia BOOLEAN DEFAULT false,
  creado_en             TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campana_id, seccion_id, numero)
);
CREATE INDEX idx_casillas_campana ON casillas(campana_id);

-- Control de cierre de captura — automático por hora, o manual con
-- un botón, para que solo altos mandos puedan seguir capturando
-- después de que cierran las urnas.
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS fecha_cierre_casillas TIMESTAMPTZ;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS captura_cerrada BOOLEAN DEFAULT false;

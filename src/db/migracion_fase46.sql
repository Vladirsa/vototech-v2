-- ══════════════════════════════════════════════════════════════
-- FASE 46 — PRECISIÓN HISTÓRICA (auto-guardado, sin datos personales)
-- ══════════════════════════════════════════════════════════════
-- Guarda automáticamente, todos los días, "qué está prediciendo el
-- sistema" por sección para cada campaña activa (solo números
-- agregados: cuántos promovidos, qué prioridad — NUNCA nombres ni
-- datos personales). Cuando llegan resultados oficiales reales de
-- esa elección, se compara la última "foto" tomada ANTES de la
-- elección contra lo que de verdad pasó, y se guarda el resultado
-- permanentemente — así se mide, elección tras elección, qué tan
-- bueno es el Motor de Priorización sin tocar un solo dato sensible.

CREATE TABLE IF NOT EXISTS predicciones_snapshot (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  seccion_id        INTEGER NOT NULL REFERENCES secciones(id),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_eleccion     VARCHAR(20) NOT NULL,
  prioridad         VARCHAR(20),  -- critica/recuperable/disputa/consolidar/perdida
  promovidos_base         INTEGER DEFAULT 0,
  promovidos_persuadible  INTEGER DEFAULT 0,
  promovidos_adversario   INTEGER DEFAULT 0,
  UNIQUE(campana_id, seccion_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_campana_fecha ON predicciones_snapshot(campana_id, fecha);

CREATE TABLE IF NOT EXISTS precision_electoral (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id            UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  tipo_eleccion         VARCHAR(20) NOT NULL,
  anio                  INTEGER NOT NULL,
  fecha_snapshot_usado  DATE NOT NULL,
  total_secciones_comparadas  INTEGER NOT NULL,
  secciones_acertadas         INTEGER NOT NULL,
  precision_pct               NUMERIC(5,2) NOT NULL,
  calculado_en          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campana_id, tipo_eleccion, anio)
);

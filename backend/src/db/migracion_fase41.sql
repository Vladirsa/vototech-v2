-- ══════════════════════════════════════════════════════════════
-- FASE 41 — RESTAURACIÓN DE RESPALDOS CON DOBLE PERMISO
-- ══════════════════════════════════════════════════════════════
-- Cualquiera de los 2 (candidato o Vladir/admin) puede SOLICITAR
-- restaurar una fecha — pero se necesita que AMBOS aprueben antes de
-- que se ejecute. Restaurar reemplaza datos reales, por eso el
-- doble candado.
CREATE TABLE IF NOT EXISTS solicitudes_restauracion (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id          UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  fecha_respaldo      DATE NOT NULL, -- qué día del respaldo se quiere restaurar
  solicitado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  solicitado_por_admin BOOLEAN DEFAULT false, -- true si quien pidió fue Vladir, no el candidato
  aprobado_candidato  BOOLEAN DEFAULT false,
  aprobado_admin      BOOLEAN DEFAULT false,
  estado              VARCHAR(15) DEFAULT 'pendiente', -- pendiente, ejecutada, cancelada
  respaldo_previo     TEXT, -- ruta del respaldo de "justo antes de restaurar", por si hay que deshacer
  creado_en           TIMESTAMPTZ DEFAULT now(),
  ejecutado_en        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_restauracion_campana ON solicitudes_restauracion(campana_id);

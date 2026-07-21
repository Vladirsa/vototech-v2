-- ══════════════════════════════════════════════════════════════
-- FASE 37 — MÓDULO ADMINISTRATIVO COMPLETO (ingresos + comprobantes)
-- ══════════════════════════════════════════════════════════════

-- Gastos ahora también lleva tipo de comprobante (factura/nota/recibo)
-- y evidencia fotográfica — lo que de verdad pide el INE al fiscalizar.
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS tipo_comprobante VARCHAR(20);
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(100);
ALTER TABLE gastos_campana ADD COLUMN IF NOT EXISTS evidencia_url TEXT;

-- Ingresos/aportaciones — hasta ahora el sistema solo llevaba gastos,
-- pero el INE exige reportar TAMBIÉN de dónde viene el dinero, con
-- el registro del aportante (nombre, identificación) y el recibo de
-- aportación correspondiente.
CREATE TABLE ingresos_campana (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id          UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  tipo_ingreso        VARCHAR(40) NOT NULL, -- aportacion_efectivo, aportacion_especie, autofinanciamiento, financiamiento_publico, rendimientos_financieros
  aportante_nombre    VARCHAR(200),
  aportante_identificacion VARCHAR(30), -- CURP o RFC del aportante, cuando aplica
  monto               NUMERIC(12,2) NOT NULL,
  fecha               DATE NOT NULL,
  forma_recepcion     VARCHAR(20) DEFAULT 'transferencia', -- efectivo, transferencia, cheque, especie
  descripcion_especie VARCHAR(300), -- si es aportación en especie, qué es
  numero_recibo       VARCHAR(100), -- folio del recibo de aportación entregado
  evidencia_url       TEXT,
  registrado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ingresos_campana ON ingresos_campana(campana_id, fecha);

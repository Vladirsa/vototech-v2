-- ══════════════════════════════════════════════════════════════
-- FASE 18 — MEJORAS AL ORGANIGRAMA (historial, reasignación en bloque)
-- ══════════════════════════════════════════════════════════════
-- Trazabilidad: quién movió a quién, de dónde a dónde, y cuándo —
-- para resolver dudas tipo "¿por qué me cambiaron de coordinador?"
CREATE TABLE estructura_historial (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  parent_anterior UUID,
  parent_nuevo    UUID,
  motivo          VARCHAR(200),
  cambiado_por    UUID REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_estructura_historial_campana ON estructura_historial(campana_id, creado_en DESC);

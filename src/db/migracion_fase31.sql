-- ══════════════════════════════════════════════════════════════
-- FASE 31 — BITÁCORA DE AUDITORÍA GENERAL
-- ══════════════════════════════════════════════════════════════
-- Ya existían bitácoras parciales (admin_bitacora para el admin de
-- la plataforma, estructura_historial para reasignaciones). Esta es
-- la general, para las acciones más sensibles de TODO el sistema:
-- quién hizo qué, cuándo, y qué cambió.
CREATE TABLE auditoria (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id    UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre VARCHAR(200), -- se guarda aparte por si el usuario se borra después
  accion        VARCHAR(20) NOT NULL, -- crear, editar, eliminar
  tabla         VARCHAR(50) NOT NULL, -- resultados_casilla, gastos_campana, usuarios, promovidos, etc.
  registro_id   VARCHAR(100),
  detalle       JSONB, -- snapshot de qué cambió, cuando aplica
  ip            VARCHAR(45),
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_auditoria_campana_fecha ON auditoria(campana_id, creado_en DESC);
CREATE INDEX idx_auditoria_tabla ON auditoria(campana_id, tabla);

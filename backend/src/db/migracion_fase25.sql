-- ══════════════════════════════════════════════════════════════
-- FASE 25 — BITÁCORA DE ACCIONES DEL ADMINISTRADOR DE LA PLATAFORMA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE admin_bitacora (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id    UUID REFERENCES campanas(id) ON DELETE SET NULL,
  nombre_campana VARCHAR(200), -- se guarda aparte por si la campaña se borra después
  accion        VARCHAR(30) NOT NULL, -- aprobada, rechazada, renovada, borrada
  detalle       VARCHAR(300),
  creado_en     TIMESTAMPTZ DEFAULT now()
);

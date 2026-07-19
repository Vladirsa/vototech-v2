-- ══════════════════════════════════════════════════════════════
-- FASE 26 — NOTIFICACIONES PUSH REALES (funcionan con la app cerrada)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE push_suscripciones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  creado_en   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, endpoint)
);
CREATE INDEX idx_push_usuario ON push_suscripciones(usuario_id);

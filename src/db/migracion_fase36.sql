-- ══════════════════════════════════════════════════════════════
-- FASE 36 — RECUPERAR CONTRASEÑA POR WHATSAPP
-- ══════════════════════════════════════════════════════════════
CREATE TABLE codigos_recuperacion (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash   VARCHAR(64) NOT NULL,
  usado         BOOLEAN DEFAULT false,
  expira_en     TIMESTAMPTZ NOT NULL,
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_codigos_recuperacion_usuario ON codigos_recuperacion(usuario_id);

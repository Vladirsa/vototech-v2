-- ══════════════════════════════════════════════════════════════
-- FASE 22 — CHAT INTERNO
-- ══════════════════════════════════════════════════════════════
CREATE TABLE chat_mensajes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id  UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  canal       VARCHAR(30) NOT NULL DEFAULT 'general', -- 'general' | 'coordinadores'
  autor_id    UUID NOT NULL REFERENCES usuarios(id),
  texto       VARCHAR(2000) NOT NULL,
  creado_en   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chat_campana_canal ON chat_mensajes(campana_id, canal, creado_en);

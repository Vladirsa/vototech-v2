-- ══════════════════════════════════════════════════════════════
-- FASE 30 — REFRESH TOKENS CON ROTACIÓN
-- ══════════════════════════════════════════════════════════════
-- Antes: un solo JWT de 12h, sin forma de revocar una sesión antes
-- de que expire sola. Ahora: token de acceso CORTO (30 min) + un
-- refresh token de larga duración guardado en la base (con su hash,
-- nunca el valor real) que permite renovar sin volver a pedir
-- contraseña, Y revocar sesiones específicas cuando haga falta
-- (cerrar sesión, o que un admin invalide un dispositivo robado).
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 del token real, nunca se guarda en claro
  creado_en     TIMESTAMPTZ DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL,
  revocado_en   TIMESTAMPTZ
);
CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

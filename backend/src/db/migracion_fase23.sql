-- ══════════════════════════════════════════════════════════════
-- FASE 23 — CORRECCIÓN: canal de chat muy corto para mensajes directos
-- ══════════════════════════════════════════════════════════════
-- "dm-{uuid}-{uuid}" mide ~76 caracteres, pero la columna se creó
-- como VARCHAR(30) (pensada solo para 'general'/'coordinadores') —
-- se cortaba silenciosamente y tumbaba el guardado del mensaje.
ALTER TABLE chat_mensajes ALTER COLUMN canal TYPE VARCHAR(100);

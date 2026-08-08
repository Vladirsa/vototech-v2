-- ══════════════════════════════════════════════════════════════
-- FASE 14 — CONTROL DE SUSCRIPCIÓN Y PAGOS
-- ══════════════════════════════════════════════════════════════
-- Si una campaña no renueva, pierde acceso automáticamente al
-- vencer su fecha — sin que tengas que estar revisando manualmente
-- quién pagó y quién no.
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS fecha_activacion TIMESTAMPTZ;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ;

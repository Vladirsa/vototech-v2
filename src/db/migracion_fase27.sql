-- ══════════════════════════════════════════════════════════════
-- FASE 27 — ALERTA LEGAL: ACTOS ANTICIPADOS DE CAMPAÑA
-- ══════════════════════════════════════════════════════════════
-- Fecha oficial de inicio de campaña, para poder avisar si un activo
-- (barda, espectacular, manta) se registra con fecha ANTERIOR a ese
-- arranque legal — justo lo que el ITE está sancionando en Tlaxcala
-- ahora mismo (junio-julio 2026): actos anticipados de campaña.
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS fecha_inicio_campana_oficial DATE;

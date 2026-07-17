-- ══════════════════════════════════════════════════════════════
-- FASE 12 — AGENDA MEJORADA
-- ══════════════════════════════════════════════════════════════
-- Marca si un evento ya se llevó a cabo — esto es lo que convierte
-- la agenda de "lo que va a pasar" a también medir "lo que ya
-- pasó" (reuniones realizadas, recorridos completados).
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS realizado BOOLEAN DEFAULT false;

-- ══════════════════════════════════════════════════════════════
-- FASE 5c — CONTROL DE ACCESO A LA PLATAFORMA
-- ══════════════════════════════════════════════════════════════
-- Controla quién puede crear una campaña nueva, y exige tu
-- aprobación manual antes de que quede realmente activa.

CREATE TABLE IF NOT EXISTS codigos_acceso_campana (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo                VARCHAR(30) UNIQUE NOT NULL,
  nota                  VARCHAR(200),
  usado                 BOOLEAN DEFAULT false,
  usado_por_campana_id  UUID REFERENCES campanas(id),
  usado_en              TIMESTAMPTZ,
  creado_en             TIMESTAMPTZ DEFAULT now()
);

-- Estado de aprobación de cada campaña: 'pendiente' (recién
-- registrada, esperando tu revisión), 'aprobada' (ya puede operar),
-- 'rechazada' (la cerraste).
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS estado_aprobacion VARCHAR(15) DEFAULT 'pendiente';
ALTER TABLE campanas ALTER COLUMN activa SET DEFAULT false;

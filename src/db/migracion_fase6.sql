-- ══════════════════════════════════════════════════════════════
-- FASE 6 — CONTROL DE ACCESO A NIVEL PLATAFORMA
-- ══════════════════════════════════════════════════════════════
-- A diferencia de codigos_invitacion (que son POR campaña, para
-- meter promotores), estos códigos son a nivel de TODA la
-- plataforma — los generas tú (el dueño de VotoTech) para decidir
-- quién puede siquiera registrar una campaña nueva.

CREATE TABLE codigos_acceso_campana (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo          VARCHAR(20) UNIQUE NOT NULL,
  nota            VARCHAR(200),          -- ej: "Para Andrea - Apizaco 2027"
  usado           BOOLEAN DEFAULT false,
  usado_por_campana_id UUID REFERENCES campanas(id),
  creado_en       TIMESTAMPTZ DEFAULT now(),
  usado_en        TIMESTAMPTZ
);

-- Toda campaña nace "pendiente" — no puede usarse hasta que el
-- dueño de la plataforma la apruebe manualmente.
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS estado_aprobacion VARCHAR(15) NOT NULL DEFAULT 'pendiente';
  -- 'pendiente', 'aprobada', 'rechazada'

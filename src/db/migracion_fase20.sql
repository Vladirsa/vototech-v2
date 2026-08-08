-- ══════════════════════════════════════════════════════════════
-- FASE 20 — MÓDULO DE MARKETING (envíos masivos, 2 modos)
-- ══════════════════════════════════════════════════════════════

-- Varios números de WhatsApp Business (antes solo se guardaba uno
-- por campaña) — cada uno con su propio límite diario, para repartir
-- la carga y no arriesgar que Meta bloquee un solo número por volumen.
CREATE TABLE whatsapp_numeros (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  alias             VARCHAR(100) NOT NULL,
  numero_whatsapp   VARCHAR(30) NOT NULL,
  account_sid       VARCHAR(100),
  auth_token        VARCHAR(100),
  activo            BOOLEAN DEFAULT true,
  limite_diario     INTEGER DEFAULT 250,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_whatsapp_numeros_campana ON whatsapp_numeros(campana_id);

-- Bitácora simple, un renglón por mensaje enviado por un número —
-- así se calcula cuántos lleva HOY sin mantener un contador que haya
-- que resetear a medianoche (más simple, más confiable).
CREATE TABLE whatsapp_envios_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_id   UUID NOT NULL REFERENCES whatsapp_numeros(id) ON DELETE CASCADE,
  enviado_en  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_whatsapp_log_numero_fecha ON whatsapp_envios_log(numero_id, enviado_en);

-- Plantillas reutilizables por categoría, con variables tipo {nombre}
CREATE TABLE marketing_plantillas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id  UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  categoria   VARCHAR(20) NOT NULL DEFAULT 'informativo', -- motivacional, informativo, recordatorio, urgente
  titulo      VARCHAR(150) NOT NULL,
  mensaje     TEXT NOT NULL,
  creado_en   TIMESTAMPTZ DEFAULT now()
);

-- Cada envío masivo, con TODOS sus destinatarios y el estado de
-- cada uno guardado junto (evita una tabla aparte para algo que
-- siempre se consulta en bloque).
CREATE TABLE marketing_envios (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  titulo            VARCHAR(150) NOT NULL,
  modo              VARCHAR(10) NOT NULL, -- 'twilio' | 'enlace'
  plantilla_id      UUID REFERENCES marketing_plantillas(id),
  mensaje_base      TEXT NOT NULL,
  audiencia_tipo    VARCHAR(20) NOT NULL, -- 'promovidos' | 'estructura'
  audiencia_filtro  JSONB DEFAULT '{}',
  destinatarios     JSONB NOT NULL DEFAULT '[]', -- [{id,nombre,telefono,mensaje,estado,enviado_en,enviado_por,numero_usado}]
  total             INTEGER NOT NULL DEFAULT 0,
  enviados          INTEGER NOT NULL DEFAULT 0,
  fallidos          INTEGER NOT NULL DEFAULT 0,
  estado            VARCHAR(15) DEFAULT 'pendiente', -- pendiente, en_progreso, completado
  creado_por        UUID REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_marketing_envios_campana ON marketing_envios(campana_id, creado_en DESC);

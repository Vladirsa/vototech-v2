-- ══════════════════════════════════════════════════════════════
-- FASE 4 — DÍA DE LA ELECCIÓN + INCIDENCIAS + FINANZAS
-- ══════════════════════════════════════════════════════════════

-- ── RESULTADOS POR CASILLA (Día de la Elección, tiempo real) ──
CREATE TABLE resultados_casilla (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  seccion_id        INTEGER NOT NULL REFERENCES secciones(id),
  casilla           VARCHAR(20) NOT NULL DEFAULT 'B',
  votos             JSONB NOT NULL DEFAULT '{}',   -- {"morena":120,"pan":80,...}
  nulos             INTEGER DEFAULT 0,
  lista_nominal     INTEGER,
  foto_acta_url     TEXT,
  capturado_por     UUID NOT NULL REFERENCES usuarios(id),
  capturado_en      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campana_id, seccion_id, casilla)
);
CREATE INDEX idx_resultados_casilla_campana ON resultados_casilla(campana_id);

-- ── LISTA DE CACERÍA: seguimiento de "ya votó" el día D ──
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS ya_voto BOOLEAN DEFAULT false;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS hora_voto TIMESTAMPTZ;

-- ── INCIDENCIAS ──────────────────────────────────────────────
CREATE TABLE incidencias (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  tipo              VARCHAR(30) NOT NULL,   -- 'compra_votos','violencia','irregularidad','logistica','representante','propaganda','otro'
  urgencia          VARCHAR(10) NOT NULL DEFAULT 'media',  -- 'urgente','alta','media','baja'
  descripcion       TEXT NOT NULL,
  seccion_id        INTEGER REFERENCES secciones(id),
  casilla           VARCHAR(20),
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  foto_url          TEXT,
  testigos          TEXT,
  notificado_ople   BOOLEAN DEFAULT false,
  estado            VARCHAR(15) DEFAULT 'activa',  -- 'activa','resuelta'
  reportado_por     UUID NOT NULL REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_incidencias_campana ON incidencias(campana_id, estado);

-- ── CONTROL FINANCIERO ───────────────────────────────────────
CREATE TABLE gastos_campana (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  categoria         VARCHAR(40) NOT NULL,
  descripcion       VARCHAR(300) NOT NULL,
  monto             NUMERIC(12,2) NOT NULL,
  fecha             DATE NOT NULL,
  proveedor         VARCHAR(200),
  rfc               VARCHAR(20),
  factura_uuid      VARCHAR(100),
  forma_pago        VARCHAR(20) DEFAULT 'transferencia',
  registrado_por    UUID NOT NULL REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_gastos_campana ON gastos_campana(campana_id, fecha);

-- Tope de gasto autorizado por el OPLE — se guarda en la propia campaña
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS tope_gasto_ople NUMERIC(14,2);

-- ── CONFIGURACIÓN DE WHATSAPP BUSINESS API (Twilio, opcional) ──
CREATE TABLE whatsapp_config (
  campana_id      UUID PRIMARY KEY REFERENCES campanas(id) ON DELETE CASCADE,
  account_sid     VARCHAR(100),
  auth_token      VARCHAR(100),
  numero_whatsapp VARCHAR(30),
  actualizado_en  TIMESTAMPTZ DEFAULT now()
);


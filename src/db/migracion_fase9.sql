-- ══════════════════════════════════════════════════════════════
-- FASE 9 — ACTIVOS DE CAMPAÑA + SECTORIZACIÓN
-- ══════════════════════════════════════════════════════════════

-- ── ACTIVOS: bardas, espectaculares, mantas, representantes INE ──
CREATE TABLE activos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  tipo              VARCHAR(20) NOT NULL,   -- 'espectacular','barda','manta','ine_representante'
  seccion_id        INTEGER REFERENCES secciones(id),
  direccion         VARCHAR(255),
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  empresa           VARCHAR(200),
  costo             NUMERIC(12,2),
  fecha_ini         DATE,
  fecha_vence       DATE,
  nombre_rep        VARCHAR(200),   -- solo si tipo='ine_representante'
  telefono_rep      VARCHAR(20),
  estado            VARCHAR(15) DEFAULT 'activo',  -- 'activo','vencido','retirado'
  notas             VARCHAR(300),
  registrado_por    UUID NOT NULL REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activos_campana ON activos(campana_id, tipo);

-- ── AGENDA: agregar ubicación para poder mostrar reuniones en el mapa ──
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- ── SECTORIZACIÓN: varias secciones asignadas a un mismo coordinador ──
-- (antes solo se podía asignar UNA sección por usuario vía territorio_id;
-- esto permite trazar zonas completas de varias secciones de un jalón)
CREATE TABLE zonas_asignadas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  seccion_id      INTEGER NOT NULL REFERENCES secciones(id),
  asignado_por    UUID REFERENCES usuarios(id),
  creado_en       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campana_id, usuario_id, seccion_id)
);
CREATE INDEX idx_zonas_campana ON zonas_asignadas(campana_id);

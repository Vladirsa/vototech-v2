-- ══════════════════════════════════════════════════════════════
-- VOTOTECH V2 — ESQUEMA DE BASE DE DATOS (PostgreSQL, multi-tenant)
-- ══════════════════════════════════════════════════════════════
-- Filosofía de aislamiento: cada tabla que contiene datos de una
-- campaña lleva una columna campana_id. TODAS las consultas del
-- backend deben filtrar por campana_id — nunca se confía en que
-- el frontend lo mande correctamente, siempre se saca del token
-- de sesión (JWT) del usuario autenticado.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ESTADOS Y CATÁLOGO GEOGRÁFICO (compartido entre todas las campañas) ──
CREATE TABLE estados (
  id            SMALLINT PRIMARY KEY,          -- clave INE (1-32)
  nombre        VARCHAR(100) NOT NULL,
  activo        BOOLEAN DEFAULT true            -- ¿ya tenemos datos cargados de este estado?
);

CREATE TABLE municipios (
  id            SERIAL PRIMARY KEY,
  estado_id     SMALLINT NOT NULL REFERENCES estados(id),
  clave_ine     INTEGER NOT NULL,               -- id_municipio del catálogo INE
  nombre        VARCHAR(150) NOT NULL,
  UNIQUE(estado_id, clave_ine)
);

CREATE TABLE secciones (
  id                SERIAL PRIMARY KEY,
  estado_id         SMALLINT NOT NULL REFERENCES estados(id),
  municipio_id      INTEGER NOT NULL REFERENCES municipios(id),
  numero            INTEGER NOT NULL,            -- número de sección INE
  distrito_federal  SMALLINT,
  distrito_local    SMALLINT,
  lista_nominal     INTEGER DEFAULT 0,
  geom              JSONB,                       -- polígono (GeoJSON) para el mapa
  centroide_lat     DOUBLE PRECISION,
  centroide_lng     DOUBLE PRECISION,
  UNIQUE(estado_id, numero)
);
CREATE INDEX idx_secciones_municipio ON secciones(municipio_id);
CREATE INDEX idx_secciones_estado ON secciones(estado_id);

CREATE TABLE localidades (
  id            SERIAL PRIMARY KEY,
  seccion_id    INTEGER NOT NULL REFERENCES secciones(id),
  municipio_id  INTEGER NOT NULL REFERENCES municipios(id),
  nombre        VARCHAR(200) NOT NULL,
  es_cabecera   BOOLEAN DEFAULT false,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION
);
CREATE INDEX idx_localidades_nombre ON localidades USING gin (to_tsvector('spanish', nombre));

-- ── RESULTADOS HISTÓRICOS (compartidos, referencia para todas las campañas) ──
CREATE TABLE resultados_historicos (
  id              SERIAL PRIMARY KEY,
  seccion_id      INTEGER NOT NULL REFERENCES secciones(id),
  tipo_eleccion   VARCHAR(30) NOT NULL,          -- 'ayuntamiento','dip_local','dip_federal','gobernador','pres_comunidad'
  anio            SMALLINT NOT NULL,
  partido         VARCHAR(20) NOT NULL,
  votos           INTEGER NOT NULL DEFAULT 0,
  lista_nominal   INTEGER,
  total_votos     INTEGER,
  casillas        SMALLINT,
  UNIQUE(seccion_id, tipo_eleccion, anio, partido)
);
CREATE INDEX idx_hist_seccion ON resultados_historicos(seccion_id, tipo_eleccion, anio);

-- ══════════════════════════════════════════════════════════════
-- A PARTIR DE AQUÍ: TODO lleva campana_id — el corazón del
-- aislamiento multi-tenant.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE campanas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_candidato  VARCHAR(200) NOT NULL,
  eslogan           VARCHAR(300),
  partido           VARCHAR(50),
  color_primario    VARCHAR(20) DEFAULT '#7c3aed',
  tipo_eleccion     VARCHAR(30) NOT NULL,        -- 'ayuntamiento','dip_local', etc.
  estado_id         SMALLINT NOT NULL REFERENCES estados(id),
  territorio_tipo   VARCHAR(20),                 -- 'municipio','seccion','distrito','estatal'
  territorio_id     INTEGER,                     -- id de municipio/sección/distrito según el tipo
  subdominio        VARCHAR(63) UNIQUE NOT NULL,  -- ej: 'andrea' -> andrea.vototech.mx
  dominio_propio    VARCHAR(255) UNIQUE,          -- ej: 'andreacandidata.com' (opcional)
  plan              VARCHAR(20) DEFAULT 'basico', -- 'basico','estandar','premium'
  activa            BOOLEAN DEFAULT true,
  fecha_eleccion    DATE,
  creado_en         TIMESTAMPTZ DEFAULT now(),
  actualizado_en    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_campanas_subdominio ON campanas(subdominio);
CREATE INDEX idx_campanas_dominio ON campanas(dominio_propio) WHERE dominio_propio IS NOT NULL;

-- ── USUARIOS Y ROLES ──
CREATE TABLE usuarios (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  nombre            VARCHAR(200) NOT NULL,
  email             VARCHAR(255),
  telefono          VARCHAR(20),
  password_hash     VARCHAR(255) NOT NULL,       -- bcrypt, nunca texto plano
  rol               VARCHAR(30) NOT NULL,        -- 'masteradmin','candidato','jefe_campana','coord_general','coord_distrital','coord_municipal','coord_seccional','promotor','observador'
  parent_id         UUID REFERENCES usuarios(id), -- jerarquía (a quién le reporta)
  territorio_tipo   VARCHAR(20),                  -- territorio que le corresponde a ESTE usuario
  territorio_id     INTEGER,
  meta_diaria       INTEGER DEFAULT 0,
  activo            BOOLEAN DEFAULT true,
  ultimo_acceso     TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_usuarios_campana ON usuarios(campana_id);
CREATE INDEX idx_usuarios_email ON usuarios(campana_id, email);
CREATE INDEX idx_usuarios_parent ON usuarios(parent_id);

-- ── CÓDIGOS DE INVITACIÓN (para que promotores se registren solos) ──
CREATE TABLE codigos_invitacion (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  codigo            VARCHAR(20) UNIQUE NOT NULL,
  rol_asignado      VARCHAR(30) NOT NULL DEFAULT 'promotor',
  creado_por        UUID REFERENCES usuarios(id),
  usos_maximos      INTEGER DEFAULT 1,
  usos_actuales     INTEGER DEFAULT 0,
  expira_en         TIMESTAMPTZ,
  activo            BOOLEAN DEFAULT true,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_codigos_campana ON codigos_invitacion(campana_id);

-- ── PROMOVIDOS (CRM electoral) ──
CREATE TABLE promovidos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  nombre            VARCHAR(200) NOT NULL,
  curp              VARCHAR(18),
  telefono          VARCHAR(20),
  seccion_id        INTEGER REFERENCES secciones(id),
  calle             VARCHAR(255),
  partido           VARCHAR(20),
  comprometido      BOOLEAN DEFAULT false,
  temperatura       VARCHAR(10) DEFAULT 'tibio',  -- 'frio','tibio','caliente'
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  encuesta          JSONB,
  registrado_por    UUID NOT NULL REFERENCES usuarios(id),
  consentimiento    BOOLEAN NOT NULL DEFAULT false,  -- LFPDPPP: obligatorio
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_promovidos_campana ON promovidos(campana_id);
CREATE INDEX idx_promovidos_seccion ON promovidos(campana_id, seccion_id);
CREATE INDEX idx_promovidos_registrador ON promovidos(registrado_por);
CREATE INDEX idx_promovidos_fecha ON promovidos(campana_id, creado_en);

-- ── AUDITORÍA DE ACCESOS (quién entró, cuándo, qué visitó) ──
CREATE TABLE registro_accesos (
  id                BIGSERIAL PRIMARY KEY,
  campana_id        UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  usuario_id        UUID REFERENCES usuarios(id),
  ip                VARCHAR(45),
  pagina            VARCHAR(255),
  user_agent        TEXT,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_accesos_campana_fecha ON registro_accesos(campana_id, creado_en DESC);
CREATE INDEX idx_accesos_usuario ON registro_accesos(usuario_id, creado_en DESC);

-- ── TRIGGER: mantener actualizado_en al día en campañas ──
CREATE OR REPLACE FUNCTION actualizar_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campanas_actualizado
  BEFORE UPDATE ON campanas
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ══════════════════════════════════════════════════════════════
-- FASE 21 — ENCUESTAS + ÁREA JURÍDICA + AGENDA (calendario/avisos)
-- ══════════════════════════════════════════════════════════════

-- ── ENCUESTAS ──
CREATE TABLE encuestas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id    UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  titulo        VARCHAR(200) NOT NULL,
  descripcion   VARCHAR(500),
  activa        BOOLEAN DEFAULT true,
  creado_por    UUID REFERENCES usuarios(id),
  creado_en     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE encuesta_preguntas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encuesta_id UUID NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'opcion_multiple', -- 'opcion_multiple' | 'abierta'
  texto       VARCHAR(500) NOT NULL,
  opciones    JSONB DEFAULT '[]', -- ["Opción A","Opción B"] — solo para opcion_multiple
  orden       INTEGER DEFAULT 0
);

CREATE TABLE encuesta_respuestas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encuesta_id   UUID NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
  promovido_id  UUID REFERENCES promovidos(id) ON DELETE SET NULL,
  respuestas    JSONB NOT NULL, -- {"pregunta_id": "respuesta"}
  origen        VARCHAR(10) DEFAULT 'campo', -- 'campo' | 'enlace'
  capturado_por UUID REFERENCES usuarios(id),
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_encuesta_respuestas_encuesta ON encuesta_respuestas(encuesta_id);

-- ── ÁREA JURÍDICA ──
CREATE TABLE calendario_electoral (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id    UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  titulo        VARCHAR(200) NOT NULL,
  tipo          VARCHAR(20) DEFAULT 'otro', -- plazo_ine, plazo_ite, veda, otro
  fecha         DATE NOT NULL,
  descripcion   VARCHAR(500),
  cumplido      BOOLEAN DEFAULT false,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quejas_recursos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id          UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  tipo                VARCHAR(15) DEFAULT 'queja', -- queja | recurso
  autoridad           VARCHAR(10) DEFAULT 'ite', -- ine | ite
  numero_expediente   VARCHAR(100),
  descripcion         TEXT NOT NULL,
  estado              VARCHAR(15) DEFAULT 'presentada', -- presentada, en_proceso, resuelta
  fecha_presentacion  DATE,
  fecha_resolucion    DATE,
  resultado           VARCHAR(500),
  creado_por          UUID REFERENCES usuarios(id),
  creado_en           TIMESTAMPTZ DEFAULT now()
);

-- ── AGENDA: tipo de evento y alertas ──
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS color_alerta VARCHAR(10) DEFAULT 'azul'; -- azul, amarillo, rojo

-- Tablero de anuncios internos del equipo (no son eventos con fecha,
-- son avisos que se quedan fijos hasta que alguien los quita)
CREATE TABLE anuncios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id  UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  titulo      VARCHAR(200) NOT NULL,
  mensaje     VARCHAR(1000) NOT NULL,
  importante  BOOLEAN DEFAULT false,
  creado_por  UUID REFERENCES usuarios(id),
  creado_en   TIMESTAMPTZ DEFAULT now()
);

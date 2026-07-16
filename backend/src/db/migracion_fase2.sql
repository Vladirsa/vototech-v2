-- ══════════════════════════════════════════════════════════════
-- FASE 2 — MOTOR DE ESTRATEGIA
-- ══════════════════════════════════════════════════════════════

-- ── HISTORIAL DE CONTACTOS ──────────────────────────────────────
-- Cada vez que alguien del equipo habla/visita/llama a un promovido,
-- se registra aquí. Esto es lo que permite medir FRECUENCIA de
-- contacto (la ciencia dice: se necesitan ~7 toques antes de que
-- el mensaje "se pegue" — sin esta tabla, solo sabíamos si alguien
-- fue registrado UNA vez, nunca si se le dio seguimiento real).
CREATE TABLE contactos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  promovido_id    UUID NOT NULL REFERENCES promovidos(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id),
  tipo            VARCHAR(20) NOT NULL DEFAULT 'visita',  -- 'visita','llamada','whatsapp','evento'
  resultado       VARCHAR(20),                             -- 'positivo','neutral','negativo','sin_respuesta'
  notas           TEXT,
  creado_en       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_contactos_promovido ON contactos(promovido_id, creado_en DESC);
CREATE INDEX idx_contactos_campana ON contactos(campana_id, creado_en DESC);

-- ── AGREGAR CAMPOS DE CLASIFICACIÓN ESTRATÉGICA A PROMOVIDOS ──
-- clasificacion se recalcula automáticamente (ver función abajo),
-- no se edita a mano — así siempre refleja la realidad actual.
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(15) DEFAULT 'persuadible';
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS ultimo_contacto TIMESTAMPTZ;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS num_contactos INTEGER DEFAULT 0;
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS veces_intentado INTEGER DEFAULT 1;

-- ── FUNCIÓN: clasificar un promovido en Base / Persuadible / Adversario ──
-- Base         = ya vota por nosotros y está comprometido -> solo hay que
--                asegurarnos que SALGA A VOTAR el día D (no gastar en persuadir)
-- Persuadible  = indeciso, o simpatiza pero no está comprometido, o es de
--                otro partido pero no declarado hostil -> AQUÍ se invierte
--                el esfuerzo de persuasión, es donde más rinde cada hora
-- Adversario   = declarado con partido rival y sin señales de apertura ->
--                no vale la pena gastar recursos en convencerlo
CREATE OR REPLACE FUNCTION clasificar_promovido(
  p_partido_promovido VARCHAR,
  p_partido_campana VARCHAR,
  p_comprometido BOOLEAN,
  p_temperatura VARCHAR
) RETURNS VARCHAR AS $$
BEGIN
  IF p_partido_promovido = p_partido_campana AND p_comprometido THEN
    RETURN 'base';
  ELSIF p_partido_promovido IS NOT NULL
        AND p_partido_promovido != p_partido_campana
        AND p_partido_promovido != 'independiente'
        AND NOT p_comprometido
        AND p_temperatura = 'frio' THEN
    RETURN 'adversario';
  ELSE
    RETURN 'persuadible';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── TRIGGER: recalcular clasificación automáticamente al guardar ──
CREATE OR REPLACE FUNCTION trg_clasificar_promovido() RETURNS TRIGGER AS $$
DECLARE
  v_partido_campana VARCHAR;
BEGIN
  SELECT partido INTO v_partido_campana FROM campanas WHERE id = NEW.campana_id;
  NEW.clasificacion := clasificar_promovido(NEW.partido, v_partido_campana, NEW.comprometido, NEW.temperatura);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_clasificar ON promovidos;
CREATE TRIGGER auto_clasificar
  BEFORE INSERT OR UPDATE ON promovidos
  FOR EACH ROW EXECUTE FUNCTION trg_clasificar_promovido();

-- ── TRIGGER: al registrar un contacto, actualizar el contador y fecha en el promovido ──
CREATE OR REPLACE FUNCTION trg_actualizar_contacto() RETURNS TRIGGER AS $$
BEGIN
  UPDATE promovidos
  SET num_contactos = num_contactos + 1,
      ultimo_contacto = NEW.creado_en
  WHERE id = NEW.promovido_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER despues_de_contacto
  AFTER INSERT ON contactos
  FOR EACH ROW EXECUTE FUNCTION trg_actualizar_contacto();

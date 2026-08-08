-- ══════════════════════════════════════════════════════════════
-- FASE 16 — TABLERO DE PROMOVIDOS (arrastrar entre columnas)
-- ══════════════════════════════════════════════════════════════
-- Si alguien arrastra una tarjeta a otra columna del tablero, se
-- marca como "ajuste manual" para que el disparador automático de
-- clasificación ya no se la vuelva a pisar la próxima vez que se
-- edite el registro.
ALTER TABLE promovidos ADD COLUMN IF NOT EXISTS clasificacion_manual BOOLEAN DEFAULT false;

-- Actualizar el disparador de clasificación automática para que
-- respete los ajustes manuales (no se los pise en la próxima edición).
CREATE OR REPLACE FUNCTION trg_clasificar_promovido() RETURNS TRIGGER AS $$
DECLARE
  v_partido_campana VARCHAR;
BEGIN
  IF NEW.clasificacion_manual THEN
    RETURN NEW;
  END IF;
  SELECT partido INTO v_partido_campana FROM campanas WHERE id = NEW.campana_id;
  NEW.clasificacion := clasificar_promovido(NEW.partido, v_partido_campana, NEW.comprometido, NEW.temperatura);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

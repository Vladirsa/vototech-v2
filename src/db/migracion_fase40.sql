CREATE TABLE casillas_oficiales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seccion_id    INTEGER NOT NULL REFERENCES secciones(id) ON DELETE CASCADE,
  tipo          VARCHAR(20) NOT NULL,
  electores_estimados INTEGER,
  creado_en     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_casillas_oficiales_seccion ON casillas_oficiales(seccion_id);

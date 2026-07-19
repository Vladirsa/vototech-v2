-- ══════════════════════════════════════════════════════════════
-- FASE 28 — CORRECCIÓN GENERAL: 21 columnas "quién lo hizo" sin
-- regla de borrado hacia usuarios — encontrado al enriquecer la
-- demo (encuesta_respuestas.capturado_por tumbaba el borrado de
-- campaña). Se corrige TODO el patrón de un jalón, no solo el caso
-- que lo disparó, para no volver a toparnos con esto en otra tabla.
--
-- Regla: si el usuario que hizo algo se borra, el registro se
-- CONSERVA (el promovido, el gasto, la incidencia siguen existiendo)
-- pero pierde la referencia de "quién" — se pone en NULL, nunca se
-- bloquea el borrado.
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  fila RECORD;
BEGIN
  FOR fila IN
    SELECT tc.table_name, kcu.column_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='usuarios' AND rc.delete_rule='NO ACTION'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fila.table_name, fila.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES usuarios(id) ON DELETE SET NULL',
      fila.table_name, fila.constraint_name, fila.column_name);
    RAISE NOTICE 'Corregido: %.%', fila.table_name, fila.column_name;
  END LOOP;
END $$;

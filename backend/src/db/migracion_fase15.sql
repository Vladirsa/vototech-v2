-- ══════════════════════════════════════════════════════════════
-- FASE 15 — CORRECCIÓN: borrar campaña no debe tumbar el servidor
-- ══════════════════════════════════════════════════════════════
-- codigos_acceso_campana.usado_por_campana_id apuntaba a la campaña
-- sin CASCADE — al borrar una campaña que se registró con código,
-- PostgreSQL rechazaba el borrado con un error que no estaba
-- controlado y tumbaba el proceso completo del servidor.
ALTER TABLE codigos_acceso_campana
  DROP CONSTRAINT IF EXISTS codigos_acceso_campana_usado_por_campana_id_fkey;
ALTER TABLE codigos_acceso_campana
  ADD CONSTRAINT codigos_acceso_campana_usado_por_campana_id_fkey
  FOREIGN KEY (usado_por_campana_id) REFERENCES campanas(id) ON DELETE SET NULL;

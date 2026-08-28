import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/auditoria
 * La bitácora unificada de TODA la campaña — quién hizo qué, cuándo,
 * y desde dónde. Solo altos mandos deberían verla completa (se
 * restringe también del lado del frontend), porque puede incluir
 * acciones de cualquier miembro del equipo, no solo las propias.
 *
 * Filtros opcionales: ?tabla=gastos_campana, ?accion=borrar,
 * ?usuario_id=..., ?desde=2026-08-01, ?hasta=2026-08-31
 */
router.get('/', async (req, res) => {
  const { tabla, accion, usuario_id, desde, hasta, buscar } = req.query;
  let sql = `SELECT * FROM auditoria WHERE campana_id = $1`;
  const params = [req.usuario.campana_id];

  if (tabla) { params.push(tabla); sql += ` AND tabla = $${params.length}`; }
  if (accion) { params.push(accion); sql += ` AND accion = $${params.length}`; }
  if (usuario_id) { params.push(usuario_id); sql += ` AND usuario_id = $${params.length}`; }
  if (desde) { params.push(desde); sql += ` AND creado_en >= $${params.length}`; }
  if (hasta) { params.push(hasta); sql += ` AND creado_en <= $${params.length}::date + interval '1 day'`; }
  if (buscar) { params.push(`%${buscar}%`); sql += ` AND (usuario_nombre ILIKE $${params.length} OR detalle::text ILIKE $${params.length})`; }

  sql += ' ORDER BY creado_en DESC LIMIT 300';
  const resultado = await query(sql, params);

  // Para llenar los filtros del frontend con opciones reales, no inventadas
  const tablasRes = await query('SELECT DISTINCT tabla FROM auditoria WHERE campana_id=$1 ORDER BY tabla', [req.usuario.campana_id]);
  const accionesRes = await query('SELECT DISTINCT accion FROM auditoria WHERE campana_id=$1 ORDER BY accion', [req.usuario.campana_id]);

  res.json({
    ok: true,
    data: resultado.rows,
    filtros_disponibles: {
      tablas: tablasRes.rows.map((r) => r.tabla),
      acciones: accionesRes.rows.map((r) => r.accion),
    },
  });
});

export default router;

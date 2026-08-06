import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { listarRespaldos, generarLinkDescarga, ejecutarRestauracion } from '../lib/respaldoAutomatico.js';

const router = Router();
router.use(requiereAuth);

// Solo mando máximo puede tocar respaldos/restauración — un
// promotor no debería poder ni ver esto, mucho menos restaurar.
function esMandoMaximo(req) {
  return ['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol);
}

/** GET /api/respaldos — lista los respaldos de MI propia campaña */
router.get('/', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'Solo Candidato, Jefe de Campaña o Coordinador General pueden ver esto.' });
  const lista = await listarRespaldos(req.usuario.campana_id);
  res.json({ ok: true, data: lista });
});

/** GET /api/respaldos/descargar/:archivo — link temporal de descarga (1 hora) */
router.get('/descargar/:archivo', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'No autorizado' });
  try {
    const url = await generarLinkDescarga(req.usuario.campana_id, req.params.archivo);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No se pudo generar el link de descarga: ' + e.message });
  }
});

/** GET /api/respaldos/solicitudes — mis solicitudes de restauración pendientes o recientes */
router.get('/solicitudes', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'No autorizado' });
  const r = await query(
    `SELECT s.*, u.nombre as solicitado_por_nombre FROM solicitudes_restauracion s
     LEFT JOIN usuarios u ON u.id = s.solicitado_por
     WHERE s.campana_id=$1 ORDER BY s.creado_en DESC LIMIT 20`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: r.rows });
});

/**
 * POST /api/respaldos/solicitar-restauracion
 * El candidato pide restaurar una fecha — queda pendiente de que
 * Vladir (el admin) también apruebe. Si el candidato mismo tiene
 * mando máximo, su propia solicitud YA cuenta como su aprobación.
 */
router.post('/solicitar-restauracion', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'No autorizado' });
  const { fecha_respaldo } = req.body;
  if (!fecha_respaldo) return res.status(400).json({ ok: false, error: 'Falta la fecha del respaldo a restaurar' });

  const resultado = await query(
    `INSERT INTO solicitudes_restauracion (campana_id, fecha_respaldo, solicitado_por, solicitado_por_admin, aprobado_candidato)
     VALUES ($1,$2,$3,false,true) RETURNING *`,
    [req.usuario.campana_id, fecha_respaldo, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0], mensaje: 'Solicitud creada — falta que el equipo de VotoTech la apruebe para que se ejecute.' });
});

/**
 * POST /api/respaldos/aprobar-restauracion/:id
 * El candidato aprueba una solicitud que Vladir inició. Si con esto
 * ya quedan las 2 aprobaciones, se ejecuta la restauración de una vez.
 */
router.post('/aprobar-restauracion/:id', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'No autorizado' });
  const solicitud = await query('SELECT * FROM solicitudes_restauracion WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!solicitud.rows[0]) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
  if (solicitud.rows[0].estado !== 'pendiente') return res.status(400).json({ ok: false, error: 'Esta solicitud ya fue procesada' });

  await query('UPDATE solicitudes_restauracion SET aprobado_candidato=true WHERE id=$1', [req.params.id]);
  const actualizada = (await query('SELECT * FROM solicitudes_restauracion WHERE id=$1', [req.params.id])).rows[0];

  if (actualizada.aprobado_candidato && actualizada.aprobado_admin) {
    try {
      await ejecutarRestauracion(req.params.id);
      return res.json({ ok: true, mensaje: '✅ Restauración completada — la campaña ya está en el estado de esa fecha.' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Error al restaurar: ' + e.message });
    }
  }
  res.json({ ok: true, mensaje: 'Aprobado de tu lado — falta la aprobación del equipo de VotoTech.' });
});

export default router;

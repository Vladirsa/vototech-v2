import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT i.*, s.numero as seccion_numero, u.nombre as reportado_por_nombre
     FROM incidencias i
     LEFT JOIN secciones s ON s.id = i.seccion_id
     LEFT JOIN usuarios u ON u.id = i.reportado_por
     WHERE i.campana_id = $1 ORDER BY
       CASE i.urgencia WHEN 'urgente' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC,
       i.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaIncidencia = z.object({
  tipo: z.enum(['compra_votos', 'violencia', 'irregularidad', 'logistica', 'representante', 'propaganda', 'otro']),
  urgencia: z.enum(['urgente', 'alta', 'media', 'baja']).default('media'),
  descripcion: z.string().min(5).max(1000),
  seccion_numero: z.number().int().optional(),
  casilla: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  foto_url: z.string().url().optional(),
  testigos: z.string().max(500).optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaIncidencia.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
    seccionId = s.rows[0]?.id || null;
  }

  const resultado = await query(
    `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, casilla, lat, lng, foto_url, testigos, reportado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.usuario.campana_id, d.tipo, d.urgencia, d.descripcion, seccionId, d.casilla || null,
     d.lat || null, d.lng || null, d.foto_url || null, d.testigos || null, req.usuario.sub]
  );

  // Las incidencias URGENTES se transmiten en vivo — el Jefe de Campaña
  // debe enterarse al instante, no cuando alguien recargue la pantalla.
  if (d.urgencia === 'urgente') {
    getIo().to(`campana:${req.usuario.campana_id}`).emit('incidencia_urgente', resultado.rows[0]);
  }

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/resolver', async (req, res) => {
  await query('UPDATE incidencias SET estado=$1 WHERE id=$2 AND campana_id=$3', ['resuelta', req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

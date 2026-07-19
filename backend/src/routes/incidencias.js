import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';
import { enviarPushMasivo } from './push.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const { tipo, estado, urgencia } = req.query;
  let sql = `
    SELECT i.*, s.numero as seccion_numero, u.nombre as reportado_por_nombre
    FROM incidencias i
    LEFT JOIN secciones s ON s.id = i.seccion_id
    LEFT JOIN usuarios u ON u.id = i.reportado_por
    WHERE i.campana_id = $1`;
  const params = [req.usuario.campana_id];

  if (tipo) { params.push(tipo); sql += ` AND i.tipo = $${params.length}`; }
  if (estado) { params.push(estado); sql += ` AND i.estado = $${params.length}`; }
  if (urgencia) { params.push(urgencia); sql += ` AND i.urgencia = $${params.length}`; }
  sql += ` ORDER BY CASE i.urgencia WHEN 'urgente' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, i.creado_en DESC`;

  const resultado = await query(sql, params);
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
  notificado_ople: z.boolean().optional(),
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
    `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, casilla, lat, lng, foto_url, testigos, notificado_ople, reportado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.usuario.campana_id, d.tipo, d.urgencia, d.descripcion, seccionId, d.casilla || null,
     d.lat || null, d.lng || null, d.foto_url || null, d.testigos || null, d.notificado_ople || false, req.usuario.sub]
  );

  // Las incidencias URGENTES se transmiten en vivo — el Jefe de Campaña
  // debe enterarse al instante, no cuando alguien recargue la pantalla.
  if (d.urgencia === 'urgente') {
    getIo().to(`campana:${req.usuario.campana_id}`).emit('incidencia_urgente', resultado.rows[0]);

    // Push real a los altos mandos — esto SÍ debe llegar aunque tengan
    // el celular bloqueado, es justo el tipo de aviso que no puede esperar.
    const altosMando = await query(
      `SELECT id FROM usuarios WHERE campana_id=$1 AND rol IN ('candidato','jefe_campana','coord_general')`,
      [req.usuario.campana_id]
    );
    enviarPushMasivo(altosMando.rows.map((u) => u.id), {
      titulo: '🚨 Incidencia urgente',
      cuerpo: d.descripcion.slice(0, 100),
      url: '/incidencias',
    }).catch(() => {});
  }

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

const esquemaEditar = z.object({
  tipo: z.enum(['compra_votos', 'violencia', 'irregularidad', 'logistica', 'representante', 'propaganda', 'otro']).optional(),
  urgencia: z.enum(['urgente', 'alta', 'media', 'baja']).optional(),
  descripcion: z.string().min(5).max(1000).optional(),
  casilla: z.string().optional(),
  testigos: z.string().max(500).optional(),
  notificado_ople: z.boolean().optional(),
});

/**
 * PATCH /api/incidencias/:id
 * Corregir el reporte — el tipo de urgencia, agregar testigos que
 * no se anotaron al momento, etc.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) {
    campos.push(`${campo}=$${i}`);
    valores.push(valor);
    i++;
  }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });

  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(
    `UPDATE incidencias SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/resolver', async (req, res) => {
  await query('UPDATE incidencias SET estado=$1 WHERE id=$2 AND campana_id=$3', ['resuelta', req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

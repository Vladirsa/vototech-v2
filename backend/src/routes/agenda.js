import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as creado_por_nombre
     FROM agenda a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.creado_por
     WHERE a.campana_id = $1
     ORDER BY a.fecha_inicio ASC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaEvento = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(['evento', 'reunion', 'recorrido', 'entrevista']).default('evento'),
  fecha_inicio: z.string(),
  fecha_fin: z.string().optional(),
  lugar: z.string().max(255).optional(),
  seccion_numero: z.number().int().optional(),
  descripcion: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaEvento.safeParse(req.body);
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
    `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, fecha_fin, lugar, seccion_id, descripcion, creado_por, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.tipo, d.fecha_inicio, d.fecha_fin || null,
     d.lugar || null, seccionId, d.descripcion || null, req.usuario.sub, d.lat || null, d.lng || null]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM agenda WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

const esquemaEditar = z.object({
  titulo: z.string().min(2).max(200).optional(),
  tipo: z.enum(['evento', 'reunion', 'recorrido', 'entrevista']).optional(),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  lugar: z.string().max(255).optional(),
  seccion_numero: z.number().int().optional(),
  descripcion: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

/**
 * PATCH /api/agenda/:id
 * Corregir un evento (cambió la hora, el lugar, etc.) sin tener
 * que borrarlo y crearlo de nuevo.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let seccionId;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
    seccionId = s.rows[0]?.id;
  }

  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) {
    if (campo === 'seccion_numero') continue;
    campos.push(`${campo}=$${i}`);
    valores.push(valor);
    i++;
  }
  if (seccionId) { campos.push(`seccion_id=$${i}`); valores.push(seccionId); i++; }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });

  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(
    `UPDATE agenda SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * PATCH /api/agenda/:id/completar
 * Marca un evento como realizado — esto es lo que alimenta
 * "reuniones realizadas" como concepto medible, no solo la agenda
 * a futuro.
 */
router.patch('/:id/completar', async (req, res) => {
  const resultado = await query(
    `UPDATE agenda SET realizado = true WHERE id=$1 AND campana_id=$2 RETURNING *`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

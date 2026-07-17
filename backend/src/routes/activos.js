import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre
     FROM activos a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.registrado_por
     WHERE a.campana_id = $1 ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaActivo = z.object({
  tipo: z.enum(['espectacular', 'barda', 'manta', 'ine_representante', 'utilitario']),
  seccion_numero: z.number().int().optional(),
  direccion: z.string().max(255).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  empresa: z.string().max(200).optional(),
  costo: z.number().optional(),
  fecha_ini: z.string().optional(),
  fecha_vence: z.string().optional(),
  nombre_rep: z.string().max(200).optional(),
  telefono_rep: z.string().max(20).optional(),
  notas: z.string().max(300).optional(),
  cantidad: z.number().int().optional(),
  subtipo: z.string().max(50).optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaActivo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
    seccionId = s.rows[0]?.id || null;
  }

  const resultado = await query(
    `INSERT INTO activos (campana_id, tipo, seccion_id, direccion, lat, lng, empresa, costo, fecha_ini, fecha_vence, nombre_rep, telefono_rep, notas, cantidad, subtipo, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.usuario.campana_id, d.tipo, seccionId, d.direccion || null, d.lat || null, d.lng || null,
     d.empresa || null, d.costo || null, d.fecha_ini || null, d.fecha_vence || null,
     d.nombre_rep || null, d.telefono_rep || null, d.notas || null, d.cantidad || null, d.subtipo || null, req.usuario.sub]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/estado', async (req, res) => {
  const estado = req.body.estado;
  if (!['activo', 'vencido', 'retirado'].includes(estado)) return res.status(400).json({ ok: false, error: 'Estado inválido' });
  await query('UPDATE activos SET estado=$1 WHERE id=$2 AND campana_id=$3', [estado, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM activos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

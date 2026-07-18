import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/calendario', async (req, res) => {
  const resultado = await query('SELECT * FROM calendario_electoral WHERE campana_id=$1 ORDER BY fecha', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaPlazo = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(['plazo_ine', 'plazo_ite', 'veda', 'otro']).default('otro'),
  fecha: z.string(),
  descripcion: z.string().max(500).optional(),
});

router.post('/calendario', async (req, res) => {
  const parseado = esquemaPlazo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO calendario_electoral (campana_id, titulo, tipo, fecha, descripcion) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.tipo, d.fecha, d.descripcion || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/calendario/:id/cumplido', async (req, res) => {
  await query('UPDATE calendario_electoral SET cumplido=$1 WHERE id=$2 AND campana_id=$3', [!!req.body.cumplido, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.delete('/calendario/:id', async (req, res) => {
  await query('DELETE FROM calendario_electoral WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.get('/quejas', async (req, res) => {
  const resultado = await query('SELECT * FROM quejas_recursos WHERE campana_id=$1 ORDER BY creado_en DESC', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaQueja = z.object({
  tipo: z.enum(['queja', 'recurso']).default('queja'),
  autoridad: z.enum(['ine', 'ite']).default('ite'),
  numero_expediente: z.string().max(100).optional(),
  descripcion: z.string().min(5).max(2000),
  fecha_presentacion: z.string().optional(),
});

router.post('/quejas', async (req, res) => {
  const parseado = esquemaQueja.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO quejas_recursos (campana_id, tipo, autoridad, numero_expediente, descripcion, fecha_presentacion, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.usuario.campana_id, d.tipo, d.autoridad, d.numero_expediente || null, d.descripcion, d.fecha_presentacion || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/quejas/:id', async (req, res) => {
  const { estado, resultado: textoResultado, fecha_resolucion, numero_expediente } = req.body;
  const campos = [];
  const valores = [];
  let i = 1;
  if (estado) { campos.push(`estado=$${i++}`); valores.push(estado); }
  if (textoResultado) { campos.push(`resultado=$${i++}`); valores.push(textoResultado); }
  if (fecha_resolucion) { campos.push(`fecha_resolucion=$${i++}`); valores.push(fecha_resolucion); }
  if (numero_expediente) { campos.push(`numero_expediente=$${i++}`); valores.push(numero_expediente); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE quejas_recursos SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.get('/resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const proximosPlazos = await query(
    `SELECT * FROM calendario_electoral WHERE campana_id=$1 AND cumplido=false AND fecha >= CURRENT_DATE ORDER BY fecha LIMIT 5`,
    [campanaId]
  );
  const quejasAbiertas = await query(`SELECT COUNT(*) as total FROM quejas_recursos WHERE campana_id=$1 AND estado != 'resuelta'`, [campanaId]);
  const incidenciasActivas = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1 AND estado='activa'`, [campanaId]);
  const gastoRes = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
  const campanaRes = await query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [campanaId]);

  res.json({
    ok: true,
    data: {
      proximos_plazos: proximosPlazos.rows,
      quejas_abiertas: parseInt(quejasAbiertas.rows[0].total),
      incidencias_activas: parseInt(incidenciasActivas.rows[0].total),
      gasto_actual: parseFloat(gastoRes.rows[0].total),
      tope_gasto: campanaRes.rows[0]?.tope_gasto_ople,
    },
  });
});

export default router;

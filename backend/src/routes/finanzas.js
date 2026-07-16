import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const gastos = await query(
    `SELECT g.*, u.nombre as registrado_por_nombre FROM gastos_campana g
     JOIN usuarios u ON u.id = g.registrado_por
     WHERE g.campana_id=$1 ORDER BY g.fecha DESC`,
    [req.usuario.campana_id]
  );
  const campana = await query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [req.usuario.campana_id]);

  const totalGastado = gastos.rows.reduce((s, g) => s + parseFloat(g.monto), 0);
  const tope = campana.rows[0]?.tope_gasto_ople ? parseFloat(campana.rows[0].tope_gasto_ople) : null;

  res.json({
    ok: true,
    data: gastos.rows,
    resumen: {
      total_gastado: totalGastado,
      tope_ople: tope,
      disponible: tope ? tope - totalGastado : null,
      porcentaje_usado: tope ? +((totalGastado / tope) * 100).toFixed(1) : null,
    },
  });
});

const esquemaGasto = z.object({
  categoria: z.string().min(2).max(40),
  descripcion: z.string().min(2).max(300),
  monto: z.number().positive(),
  fecha: z.string(),
  proveedor: z.string().max(200).optional(),
  rfc: z.string().max(20).optional(),
  factura_uuid: z.string().max(100).optional(),
  forma_pago: z.enum(['transferencia', 'cheque', 'efectivo', 'tarjeta']).default('transferencia'),
});

router.post('/', async (req, res) => {
  const parseado = esquemaGasto.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  const resultado = await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, rfc, factura_uuid, forma_pago, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.usuario.campana_id, d.categoria, d.descripcion, d.monto, d.fecha,
     d.proveedor || null, d.rfc || null, d.factura_uuid || null, d.forma_pago, req.usuario.sub]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.put('/tope', async (req, res) => {
  const tope = parseFloat(req.body.tope);
  if (isNaN(tope) || tope <= 0) return res.status(400).json({ ok: false, error: 'Tope inválido' });
  await query('UPDATE campanas SET tope_gasto_ople=$1 WHERE id=$2', [tope, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

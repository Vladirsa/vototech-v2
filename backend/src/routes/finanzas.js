import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(requiereAuth);

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * GET /api/finanzas
 * Ahora es el módulo administrativo completo de la campaña — no
 * solo gastos, también ingresos/aportaciones (lo que el INE exige
 * reportar de dónde viene el dinero, no solo en qué se gasta).
 */
router.get('/', async (req, res) => {
  const [gastos, ingresos, campana] = await Promise.all([
    query(
      `SELECT g.*, u.nombre as registrado_por_nombre FROM gastos_campana g
       LEFT JOIN usuarios u ON u.id = g.registrado_por
       WHERE g.campana_id=$1 ORDER BY g.fecha DESC`,
      [req.usuario.campana_id]
    ),
    query(
      `SELECT i.*, u.nombre as registrado_por_nombre FROM ingresos_campana i
       LEFT JOIN usuarios u ON u.id = i.registrado_por
       WHERE i.campana_id=$1 ORDER BY i.fecha DESC`,
      [req.usuario.campana_id]
    ),
    query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [req.usuario.campana_id]),
  ]);

  const totalGastado = gastos.rows.reduce((s, g) => s + parseFloat(g.monto), 0);
  const totalIngresos = ingresos.rows.reduce((s, i) => s + parseFloat(i.monto), 0);
  const tope = campana.rows[0]?.tope_gasto_ople ? parseFloat(campana.rows[0].tope_gasto_ople) : null;
  const sinComprobante = gastos.rows.filter((g) => !g.tipo_comprobante || g.tipo_comprobante === 'sin_comprobante').length;

  res.json({
    ok: true,
    data: gastos.rows, // se deja igual por compatibilidad — es la lista de gastos
    ingresos: ingresos.rows,
    resumen: {
      total_gastado: totalGastado,
      total_ingresos: totalIngresos,
      balance: totalIngresos - totalGastado,
      tope_ople: tope,
      disponible: tope ? tope - totalGastado : null,
      porcentaje_usado: tope ? +((totalGastado / tope) * 100).toFixed(1) : null,
      gastos_sin_comprobante: sinComprobante,
    },
  });
});

const esquemaGasto = z.object({
  categoria: z.string().min(2).max(40),
  descripcion: z.string().min(2).max(300),
  monto: z.coerce.number().positive(),
  fecha: z.string(),
  proveedor: z.string().max(200).optional(),
  rfc: z.string().max(20).optional(),
  factura_uuid: z.string().max(100).optional(),
  forma_pago: z.enum(['transferencia', 'cheque', 'efectivo', 'tarjeta']).default('transferencia'),
  tipo_comprobante: z.enum(['factura', 'nota', 'recibo', 'sin_comprobante']).default('sin_comprobante'),
  numero_comprobante: z.string().max(100).optional(),
  evento_id: z.string().uuid().optional().or(z.literal('')),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

/**
 * POST /api/finanzas
 * Cada gasto exige foto de evidencia Y ubicación en el mismo paso
 * — no como algo que se agrega después "si hay tiempo". Se manda
 * como multipart/form-data porque va con archivo. Si el gasto es
 * parte de un evento (una reunión gastó en sillas, sonido, comida,
 * transporte por separado), se vincula con evento_id — así se ven
 * todos juntos aunque sean registros distintos.
 */
router.post('/', upload.single('foto'), async (req, res) => {
  const parseado = esquemaGasto.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'La foto de evidencia es obligatoria — sin ella no se puede registrar el gasto.' });
  }
  if (parseado.data.lat === undefined || parseado.data.lng === undefined) {
    return res.status(400).json({ ok: false, error: 'La ubicación es obligatoria — activa el GPS y vuelve a intentar.' });
  }
  const d = parseado.data;

  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor.' });
  const ruta = `${req.usuario.campana_id}/comprobantes/${crypto.randomBytes(8).toString('hex')}.jpg`;
  const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (errorSubida) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto de evidencia' });
  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);

  const resultado = await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, rfc, factura_uuid, forma_pago, tipo_comprobante, numero_comprobante, registrado_por, evidencia_url, evento_id, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.usuario.campana_id, d.categoria, d.descripcion, d.monto, d.fecha,
     d.proveedor || null, d.rfc || null, d.factura_uuid || null, d.forma_pago,
     d.tipo_comprobante, d.numero_comprobante || null, req.usuario.sub,
     urlData.publicUrl, d.evento_id || null, d.lat, d.lng]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'gastos_campana', registroId: resultado.rows[0].id,
    detalle: { categoria: d.categoria, monto: d.monto, proveedor: d.proveedor },
    ip: req.ip,
  });

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/finanzas/por-evento/:eventoId
 * Todos los gastos ligados a un mismo evento — la renta de sillas,
 * el sonido, la comida, el transporte — juntos, con su total.
 */
router.get('/por-evento/:eventoId', async (req, res) => {
  const resultado = await query(
    `SELECT * FROM gastos_campana WHERE campana_id=$1 AND evento_id=$2 ORDER BY creado_en`,
    [req.usuario.campana_id, req.params.eventoId]
  );
  const total = resultado.rows.reduce((s, g) => s + parseFloat(g.monto), 0);
  res.json({ ok: true, data: resultado.rows, total });
});

/**
 * POST /api/finanzas/:id/evidencia
 * Se conserva por si algún gasto viejo (de antes de este cambio) se
 * quedó sin foto — para completarlo sin tener que borrarlo y
 * volverlo a crear.
 */
router.post('/:id/evidencia', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor.' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  const ruta = `${req.usuario.campana_id}/comprobantes/${crypto.randomBytes(8).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto' });

  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
  await query('UPDATE gastos_campana SET evidencia_url=$1 WHERE id=$2 AND campana_id=$3', [urlData.publicUrl, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true, data: { evidencia_url: urlData.publicUrl } });
});

/**
 * ── INGRESOS / APORTACIONES ──
 * El INE exige reportar de dónde viene el dinero, no solo en qué se
 * gasta — con el registro de quién aportó, cuánto, y con qué recibo.
 */
const esquemaIngreso = z.object({
  tipo_ingreso: z.enum(['aportacion_efectivo', 'aportacion_especie', 'autofinanciamiento', 'financiamiento_publico', 'rendimientos_financieros']),
  aportante_nombre: z.string().max(200).optional(),
  aportante_identificacion: z.string().max(30).optional(),
  monto: z.number().positive(),
  fecha: z.string(),
  forma_recepcion: z.enum(['efectivo', 'transferencia', 'cheque', 'especie']).default('transferencia'),
  descripcion_especie: z.string().max(300).optional(),
  numero_recibo: z.string().max(100).optional(),
});

router.post('/ingresos', async (req, res) => {
  const parseado = esquemaIngreso.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const resultado = await query(
    `INSERT INTO ingresos_campana (campana_id, tipo_ingreso, aportante_nombre, aportante_identificacion, monto, fecha, forma_recepcion, descripcion_especie, numero_recibo, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.usuario.campana_id, d.tipo_ingreso, d.aportante_nombre || null, d.aportante_identificacion || null,
     d.monto, d.fecha, d.forma_recepcion, d.descripcion_especie || null, d.numero_recibo || null, req.usuario.sub]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'ingresos_campana', registroId: resultado.rows[0].id,
    detalle: { tipo_ingreso: d.tipo_ingreso, monto: d.monto, aportante: d.aportante_nombre },
    ip: req.ip,
  });

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.post('/ingresos/:id/evidencia', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor.' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  const ruta = `${req.usuario.campana_id}/recibos-aportacion/${crypto.randomBytes(8).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto' });

  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
  await query('UPDATE ingresos_campana SET evidencia_url=$1 WHERE id=$2 AND campana_id=$3', [urlData.publicUrl, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true, data: { evidencia_url: urlData.publicUrl } });
});

router.delete('/ingresos/:id', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'encargado_finanzas'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para borrar ingresos' });
  }
  await query('DELETE FROM ingresos_campana WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.put('/tope', async (req, res) => {
  const tope = parseFloat(req.body.tope);
  if (isNaN(tope) || tope <= 0) return res.status(400).json({ ok: false, error: 'Tope inválido' });
  await query('UPDATE campanas SET tope_gasto_ople=$1 WHERE id=$2', [tope, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

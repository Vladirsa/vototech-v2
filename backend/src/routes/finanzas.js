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

// 🆕 Fuentes de financiamiento que la LGPP prohíbe expresamente para
// campañas — el sistema NUNCA bloquea el registro (esa decisión legal
// le toca al candidato y su equipo jurídico), pero sí avisa con toda
// claridad cuando la fuente declarada cae en una de estas categorías.
const FUENTES_PROHIBIDAS = ['gobierno', 'extranjero', 'iglesia_o_culto', 'empresa_mercantil', 'organismo_internacional', 'anonimo'];

/**
 * GET /api/finanzas
 * Devuelve gastos + ingresos + resumen con alerta escalonada de tope
 * (70/85/95/100%). Esta es la única fuente real de datos financieros
 * de la campaña — todo lo demás (pólizas, partida doble, activos
 * fijos con depreciación INE) se intentó y se descartó: duplicaba
 * este sistema con datos de prueba, sin conectar al frontend, y con
 * una validación de CFDI/SAT y una "firma electrónica" que en
 * realidad no verificaban nada real. Ver conversación del 15-ago-2026.
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
  const porcentajeUsado = tope ? +((totalGastado / tope) * 100).toFixed(1) : null;

  let nivelAlertaTope = 'ok';
  if (porcentajeUsado != null) {
    if (porcentajeUsado >= 100) nivelAlertaTope = 'rebasado';
    else if (porcentajeUsado >= 95) nivelAlertaTope = 'critico';
    else if (porcentajeUsado >= 85) nivelAlertaTope = 'alto';
    else if (porcentajeUsado >= 70) nivelAlertaTope = 'medio';
  }

  res.json({
    ok: true,
    data: gastos.rows,
    ingresos: ingresos.rows,
    resumen: {
      total_gastado: totalGastado,
      total_ingresos: totalIngresos,
      balance: totalIngresos - totalGastado,
      tope_ople: tope,
      disponible: tope ? tope - totalGastado : null,
      porcentaje_usado: porcentajeUsado,
      nivel_alerta_tope: nivelAlertaTope,
      gastos_sin_comprobante: sinComprobante,
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
  tipo_comprobante: z.enum(['factura', 'nota', 'recibo', 'sin_comprobante']).default('sin_comprobante'),
  numero_comprobante: z.string().max(100).optional(),
  utilitario_tipo: z.string().max(100).optional(),
  utilitario_cantidad: z.number().int().positive().optional(),
  utilitario_activo_id: z.string().uuid().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaGasto.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  let activoId = null;
  if (d.categoria === 'utilitarios' && d.utilitario_cantidad) {
    if (d.utilitario_activo_id) {
      const actualizado = await query(
        `UPDATE activos SET cantidad = COALESCE(cantidad,0) + $1 WHERE id=$2 AND campana_id=$3 RETURNING id`,
        [d.utilitario_cantidad, d.utilitario_activo_id, req.usuario.campana_id]
      );
      activoId = actualizado.rows[0]?.id || null;
    } else if (d.utilitario_tipo) {
      const nuevo = await query(
        `INSERT INTO activos (campana_id, tipo, subtipo, direccion, cantidad, costo, fecha_ini, registrado_por)
         VALUES ($1,'utilitario',$2,$2,$3,$4,$5,$6) RETURNING id`,
        [req.usuario.campana_id, d.utilitario_tipo, d.utilitario_cantidad, d.monto, d.fecha, req.usuario.sub]
      );
      activoId = nuevo.rows[0].id;
    }
  }

  const resultado = await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, rfc, factura_uuid, forma_pago, tipo_comprobante, numero_comprobante, registrado_por, activo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.usuario.campana_id, d.categoria, d.descripcion, d.monto, d.fecha,
     d.proveedor || null, d.rfc || null, d.factura_uuid || null, d.forma_pago,
     d.tipo_comprobante, d.numero_comprobante || null, req.usuario.sub, activoId]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'gastos_campana', registroId: resultado.rows[0].id,
    detalle: { categoria: d.categoria, monto: d.monto, proveedor: d.proveedor },
    ip: req.ip,
  });

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

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

const esquemaIngreso = z.object({
  tipo_ingreso: z.enum(['aportacion_efectivo', 'aportacion_especie', 'autofinanciamiento', 'financiamiento_publico', 'rendimientos_financieros']),
  aportante_nombre: z.string().max(200).optional(),
  aportante_identificacion: z.string().max(30).optional(),
  monto: z.number().positive(),
  fecha: z.string(),
  forma_recepcion: z.enum(['efectivo', 'transferencia', 'cheque', 'especie']).default('transferencia'),
  descripcion_especie: z.string().max(300).optional(),
  numero_recibo: z.string().max(100).optional(),
  tipo_persona: z.enum(['fisica_no_militante', 'fisica_militante', 'gobierno', 'extranjero', 'iglesia_o_culto', 'empresa_mercantil', 'organismo_internacional', 'anonimo']).default('fisica_no_militante'),
});

router.post('/ingresos', async (req, res) => {
  const parseado = esquemaIngreso.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const resultado = await query(
    `INSERT INTO ingresos_campana (campana_id, tipo_ingreso, aportante_nombre, aportante_identificacion, monto, fecha, forma_recepcion, descripcion_especie, numero_recibo, registrado_por, tipo_persona)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.usuario.campana_id, d.tipo_ingreso, d.aportante_nombre || null, d.aportante_identificacion || null,
     d.monto, d.fecha, d.forma_recepcion, d.descripcion_especie || null, d.numero_recibo || null, req.usuario.sub, d.tipo_persona]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'ingresos_campana', registroId: resultado.rows[0].id,
    detalle: { tipo_ingreso: d.tipo_ingreso, monto: d.monto, aportante: d.aportante_nombre },
    ip: req.ip,
  });

  const alertaFuenteProhibida = FUENTES_PROHIBIDAS.includes(d.tipo_persona)
    ? `⚠️ Declaraste esta aportación como "${d.tipo_persona.replace(/_/g, ' ')}" — el Art. 54 de la Ley General de Partidos Políticos PROHÍBE este tipo de financiamiento a campañas. Consulta con tu equipo jurídico antes de usar estos recursos.`
    : null;

  res.status(201).json({ ok: true, data: resultado.rows[0], alerta_fuente_prohibida: alertaFuenteProhibida });
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

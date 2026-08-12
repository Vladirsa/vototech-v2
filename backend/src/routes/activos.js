import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const campanaRes = await query('SELECT fecha_inicio_campana_oficial FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const fechaOficial = campanaRes.rows[0]?.fecha_inicio_campana_oficial;

  // 🆕 Se agrega el nombre del responsable asignado — antes un
  // activo no tenía dueño humano, solo existía en el inventario.
  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre,
            r.nombre as responsable_nombre
     FROM activos a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.registrado_por
     LEFT JOIN usuarios r ON r.id = a.responsable_id
     WHERE a.campana_id = $1 ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );

  const filas = resultado.rows.map((a) => ({
    ...a,
    riesgo_acto_anticipado: !!(fechaOficial && ['barda', 'espectacular', 'manta'].includes(a.tipo) && a.fecha_ini && new Date(a.fecha_ini) < new Date(fechaOficial)),
  }));

  res.json({ ok: true, data: filas, fecha_inicio_campana_oficial: fechaOficial });
});

/**
 * 🆕 GET /api/activos/resumen
 * Vista consolidada para la pestaña de Activos dentro de
 * Administración — valor total del inventario, depreciación
 * informativa (SOLO para que el candidato sepa el valor real de lo
 * que tiene, nunca se presenta como cifra oficial ante el INE), y
 * conteo por estado (activos, dados de baja, etc).
 */
router.get('/resumen', async (req, res) => {
  const activos = await query(
    `SELECT tipo, costo, fecha_ini, tasa_depreciacion_anual, estado, valor_venta
     FROM activos WHERE campana_id=$1`,
    [req.usuario.campana_id]
  );

  let valorOriginalTotal = 0, valorDepreciadoTotal = 0, valorVentaTotal = 0;
  const porEstado = {};
  activos.rows.forEach((a) => {
    const costo = parseFloat(a.costo) || 0;
    valorOriginalTotal += costo;
    if (a.estado === 'baja' || a.estado === 'vendido' || a.estado === 'donado' || a.estado === 'destruido' || a.estado === 'transferido') {
      valorVentaTotal += parseFloat(a.valor_venta) || 0;
    } else if (costo > 0 && a.fecha_ini) {
      // Depreciación lineal simple, informativa — nunca oficial.
      const mesesTranscurridos = Math.max(0, (Date.now() - new Date(a.fecha_ini).getTime()) / (1000 * 60 * 60 * 24 * 30));
      const tasaMensual = (parseFloat(a.tasa_depreciacion_anual) || 0.20) / 12;
      const depreciado = Math.max(0, costo * (1 - Math.min(1, tasaMensual * mesesTranscurridos)));
      valorDepreciadoTotal += depreciado;
    }
    porEstado[a.estado || 'activo'] = (porEstado[a.estado || 'activo'] || 0) + 1;
  });

  res.json({
    ok: true,
    data: {
      total_activos: activos.rows.length,
      valor_original_total: +valorOriginalTotal.toFixed(2),
      valor_depreciado_total: +valorDepreciadoTotal.toFixed(2),
      valor_recuperado_bajas: +valorVentaTotal.toFixed(2),
      por_estado: porEstado,
    },
  });
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
  motivo: z.enum(['promocion_voto', 'reunion', 'otro']).optional(),
  destinatario: z.string().max(200).optional(),
  // 🆕 Ciclo de vida — a quién se le asigna la responsabilidad del bien
  responsable_id: z.string().uuid().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaActivo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id || null;
  }

  // 🆕 Código de inventario automático — ej. ACT-2026-000123. No hace
  // falta que nadie lo capture a mano ni lo repita.
  const conteoRes = await query('SELECT COUNT(*) as total FROM activos WHERE campana_id=$1', [req.usuario.campana_id]);
  const codigoInventario = `ACT-${new Date().getFullYear()}-${String(parseInt(conteoRes.rows[0].total) + 1).padStart(6, '0')}`;

  const resultado = await query(
    `INSERT INTO activos (campana_id, tipo, seccion_id, direccion, lat, lng, empresa, costo, fecha_ini, fecha_vence, nombre_rep, telefono_rep, notas, cantidad, subtipo, registrado_por, codigo_inventario, responsable_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [req.usuario.campana_id, d.tipo, seccionId, d.direccion || null, d.lat || null, d.lng || null,
     d.empresa || null, d.costo || null, d.fecha_ini || null, d.fecha_vence || null,
     d.nombre_rep || null, d.telefono_rep || null, d.notas || null, d.cantidad || null, d.subtipo || null,
     req.usuario.sub, codigoInventario, d.responsable_id || null]
  );

  // 🆕 Primer renglón del kardex — el alta siempre queda registrada.
  await query(
    `INSERT INTO kardex_activos (activo_id, tipo_movimiento, descripcion, responsable_nuevo_id, realizado_por)
     VALUES ($1,'alta',$2,$3,$4)`,
    [resultado.rows[0].id, `Alta de ${d.tipo} — ${codigoInventario}`, d.responsable_id || null, req.usuario.sub]
  );

  // 🆕 Si es utilitario y vino con motivo+destinatario+cantidad, ya se
  // registra de una vez como una entrega real — así no hay que crear
  // el artículo Y LUEGO por separado ir a registrar quién se lo llevó.
  if (d.tipo === 'utilitario' && d.motivo && d.destinatario && d.cantidad) {
    await query(
      `INSERT INTO activos_entregas (activo_id, campana_id, cantidad, motivo, destinatario, seccion_id, fecha, entregado_por)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7)`,
      [resultado.rows[0].id, req.usuario.campana_id, d.cantidad, d.motivo, d.destinatario, seccionId, req.usuario.sub]
    );
  }

  // ── ALERTA LEGAL: acto anticipado de campaña ──
  // El ITE de Tlaxcala está sancionando activamente esto (junio-julio
  // 2026): bardas/espectaculares colocados ANTES del arranque oficial
  // de campaña. No bloqueamos el registro (la decisión es del equipo
  // jurídico), pero sí avisamos con toda claridad en el momento.
  let alertaLegal = null;
  if (['barda', 'espectacular', 'manta'].includes(d.tipo) && d.fecha_ini) {
    const campanaRes = await query('SELECT fecha_inicio_campana_oficial FROM campanas WHERE id=$1', [req.usuario.campana_id]);
    const fechaOficial = campanaRes.rows[0]?.fecha_inicio_campana_oficial;
    if (fechaOficial && new Date(d.fecha_ini) < new Date(fechaOficial)) {
      alertaLegal = `⚠️ Este ${d.tipo} tiene fecha de colocación (${d.fecha_ini}) ANTERIOR al inicio oficial de campaña (${fechaOficial.toISOString().slice(0, 10)}). El ITE ha sancionado casos similares por "actos anticipados de campaña" — consulta con tu equipo jurídico antes de continuar.`;
    }
  }

  res.status(201).json({ ok: true, data: resultado.rows[0], alerta_legal: alertaLegal });
});

/**
 * POST /api/activos/:id/entregas
 * Registrar una entrega adicional de un artículo utilitario que YA
 * existe (ej. ya diste de alta "Playeras talla M" con 500 en
 * existencia, y hoy repartes 100 más en una reunión distinta).
 */
const esquemaEntrega = z.object({
  cantidad: z.number().int().positive(),
  motivo: z.enum(['promocion_voto', 'reunion', 'otro']),
  destinatario: z.string().min(2).max(200),
  seccion_numero: z.number().int().optional(),
  notas: z.string().max(300).optional(),
});
router.post('/:id/entregas', async (req, res) => {
  const parseado = esquemaEntrega.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const activo = await query('SELECT id FROM activos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!activo.rows[0]) return res.status(404).json({ ok: false, error: 'Artículo no encontrado' });

  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id || null;
  }

  const resultado = await query(
    `INSERT INTO activos_entregas (activo_id, campana_id, cantidad, motivo, destinatario, seccion_id, notas, fecha, entregado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8) RETURNING *`,
    [req.params.id, req.usuario.campana_id, d.cantidad, d.motivo, d.destinatario, seccionId, d.notas || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/activos/:id/entregas
 * Historial de entregas de un artículo específico, con cuántos
 * promovidos se generaron cerca de cada una — cruzando la sección y
 * la fecha de la entrega contra cuándo se capturó cada promovido,
 * en la ventana de 7 días después (la señal de que "sí sirvió").
 */
router.get('/:id/entregas', async (req, res) => {
  const entregas = await query(
    `SELECT e.*, s.numero as seccion_numero, u.nombre as entregado_por_nombre
     FROM activos_entregas e
     LEFT JOIN secciones s ON s.id = e.seccion_id
     LEFT JOIN usuarios u ON u.id = e.entregado_por
     WHERE e.activo_id=$1 AND e.campana_id=$2 ORDER BY e.fecha DESC`,
    [req.params.id, req.usuario.campana_id]
  );

  const conPromovidos = [];
  for (const e of entregas.rows) {
    let promovidosGenerados = 0;
    if (e.seccion_id) {
      const conteo = await query(
        `SELECT COUNT(*) as total FROM promovidos
         WHERE campana_id=$1 AND seccion_id=$2 AND creado_en::date BETWEEN $3::date AND ($3::date + interval '7 days')`,
        [req.usuario.campana_id, e.seccion_id, e.fecha]
      );
      promovidosGenerados = parseInt(conteo.rows[0].total);
    }
    conPromovidos.push({ ...e, promovidos_generados: promovidosGenerados });
  }

  res.json({ ok: true, data: conPromovidos });
});

/**
 * 🆕 PATCH /api/activos/:id/responsable
 * Asigna o cambia quién es responsable de un activo — cada cambio
 * queda en el kardex, con quién lo tenía antes y quién lo tiene ahora.
 */
router.patch('/:id/responsable', async (req, res) => {
  const { responsable_id } = req.body;
  if (!responsable_id) return res.status(400).json({ ok: false, error: 'Falta el responsable' });

  const actual = await query('SELECT responsable_id FROM activos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!actual.rows[0]) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

  await query('UPDATE activos SET responsable_id=$1 WHERE id=$2', [responsable_id, req.params.id]);
  await query(
    `INSERT INTO kardex_activos (activo_id, tipo_movimiento, descripcion, responsable_anterior_id, responsable_nuevo_id, realizado_por)
     VALUES ($1,'traspaso','Cambio de responsable',$2,$3,$4)`,
    [req.params.id, actual.rows[0].responsable_id, responsable_id, req.usuario.sub]
  );
  res.json({ ok: true });
});

/**
 * 🆕 POST /api/activos/:id/baja
 * Da de baja un activo al terminar la campaña (o antes, si se
 * vendió, se dañó, etc.) — exige decir qué pasó con él (se lo quedó
 * el partido, se vendió, se donó, se destruyó) y por qué, tal como
 * pide el Reglamento de Fiscalización para el control de inventarios.
 */
const esquemaBaja = z.object({
  destino_baja: z.enum(['transferido_partido', 'vendido', 'donado', 'destruido', 'devuelto_comodato', 'perdido']),
  motivo_baja: z.string().min(3).max(500),
  valor_venta: z.number().optional(),
  evidencia_baja_url: z.string().url().optional(),
});
router.post('/:id/baja', async (req, res) => {
  const parseado = esquemaBaja.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const activo = await query('SELECT id, responsable_id FROM activos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!activo.rows[0]) return res.status(404).json({ ok: false, error: 'Activo no encontrado' });

  await query(
    `UPDATE activos SET estado='baja', fecha_baja=CURRENT_DATE, destino_baja=$1, motivo_baja=$2, valor_venta=$3, evidencia_baja_url=$4
     WHERE id=$5`,
    [d.destino_baja, d.motivo_baja, d.valor_venta || null, d.evidencia_baja_url || null, req.params.id]
  );
  await query(
    `INSERT INTO kardex_activos (activo_id, tipo_movimiento, descripcion, responsable_anterior_id, realizado_por)
     VALUES ($1,'baja',$2,$3,$4)`,
    [req.params.id, `Baja — ${d.destino_baja}: ${d.motivo_baja}`, activo.rows[0].responsable_id, req.usuario.sub]
  );
  res.json({ ok: true });
});

/** 🆕 GET /api/activos/:id/kardex — historial completo de movimientos de un bien */
router.get('/:id/kardex', async (req, res) => {
  const resultado = await query(
    `SELECT k.*, ra.nombre as responsable_anterior_nombre, rn.nombre as responsable_nuevo_nombre, u.nombre as realizado_por_nombre
     FROM kardex_activos k
     LEFT JOIN usuarios ra ON ra.id = k.responsable_anterior_id
     LEFT JOIN usuarios rn ON rn.id = k.responsable_nuevo_id
     LEFT JOIN usuarios u ON u.id = k.realizado_por
     WHERE k.activo_id=$1 ORDER BY k.creado_en DESC`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows });
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

/**
 * 🆕 GET /api/activos/bodega
 * Vista de inventario real de utilitarios — cuántas piezas se
 * compraron (de cada gasto en Finanzas que las generó), cuántas ya
 * se entregaron (de activos_entregas), y cuántas quedan disponibles.
 * Esto es lo que le faltaba al módulo: antes un "gasto de
 * utilitarios" era solo un monto suelto, sin ninguna conexión a
 * cuántas piezas existen o cuántas ya se repartieron.
 */
router.get('/bodega', async (req, res) => {
  const resultado = await query(
    `SELECT a.id, a.subtipo, a.direccion, a.costo, a.creado_en,
            COALESCE(a.cantidad,0) as comprado,
            COALESCE((SELECT SUM(e.cantidad) FROM activos_entregas e WHERE e.activo_id = a.id), 0) as entregado
     FROM activos a
     WHERE a.campana_id=$1 AND a.tipo='utilitario'
     ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );
  const conBodega = resultado.rows.map((r) => ({
    ...r,
    comprado: parseInt(r.comprado),
    entregado: parseInt(r.entregado),
    en_bodega: parseInt(r.comprado) - parseInt(r.entregado),
  }));
  res.json({ ok: true, data: conBodega });
});

export default router;

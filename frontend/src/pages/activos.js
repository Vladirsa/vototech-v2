import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const campanaRes = await query('SELECT fecha_inicio_campana_oficial FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const fechaOficial = campanaRes.rows[0]?.fecha_inicio_campana_oficial;

  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre
     FROM activos a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.registrado_por
     WHERE a.campana_id = $1 ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );

  const filas = resultado.rows.map((a) => ({
    ...a,
    riesgo_acto_anticipado: !!(fechaOficial && ['barda', 'espectacular', 'manta'].includes(a.tipo) && a.fecha_ini && new Date(a.fecha_ini) < new Date(fechaOficial)),
  }));

  res.json({ ok: true, data: filas, fecha_inicio_campana_oficial: fechaOficial });
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
  // 🆕 Solo aplican a utilitarios (playeras, gorras, lapiceros) —
  // cada vez que se registra uno CON estos 3 datos, se guarda de
  // una vez como una entrega real, no solo como inventario suelto.
  motivo: z.enum(['promocion_voto', 'reunion', 'otro']).optional(),
  destinatario: z.string().max(200).optional(),
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

  const resultado = await query(
    `INSERT INTO activos (campana_id, tipo, seccion_id, direccion, lat, lng, empresa, costo, fecha_ini, fecha_vence, nombre_rep, telefono_rep, notas, cantidad, subtipo, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.usuario.campana_id, d.tipo, seccionId, d.direccion || null, d.lat || null, d.lng || null,
     d.empresa || null, d.costo || null, d.fecha_ini || null, d.fecha_vence || null,
     d.nombre_rep || null, d.telefono_rep || null, d.notas || null, d.cantidad || null, d.subtipo || null, req.usuario.sub]
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

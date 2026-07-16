import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth); // todo este módulo requiere sesión

/**
 * GET /api/promovidos
 * Lista los promovidos de la campaña del usuario autenticado.
 * IMPORTANTE: el campana_id SIEMPRE sale del token, nunca de un
 * parámetro que el cliente pueda mandar — así un promotor de la
 * campaña A nunca puede ver datos de la campaña B, ni por error
 * ni a propósito.
 */
router.get('/', async (req, res) => {
  const { seccion, clasificacion, registrador } = req.query;
  let sql = `
    SELECT p.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre
    FROM promovidos p
    LEFT JOIN secciones s ON s.id = p.seccion_id
    LEFT JOIN usuarios u ON u.id = p.registrado_por
    WHERE p.campana_id = $1`;
  const params = [req.usuario.campana_id];

  if (seccion) { params.push(seccion); sql += ` AND s.numero = $${params.length}`; }
  if (clasificacion) { params.push(clasificacion); sql += ` AND p.clasificacion = $${params.length}`; }
  if (registrador) { params.push(registrador); sql += ` AND p.registrado_por = $${params.length}`; }
  sql += ' ORDER BY p.creado_en DESC LIMIT 2000';

  const resultado = await query(sql, params);
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/promovidos/resumen
 * Números clave para el Dashboard: cuántos Base/Persuadible/Adversario,
 * cuántos sin contacto reciente (>15 días), etc.
 */
/**
 * GET /api/promovidos/duplicados
 * Promovidos que más veces han intentado registrarse duplicados —
 * señal de que varios promotores están tocando a la misma persona
 * (puede ser bueno: alta relevancia social; o mala señal: territorio
 * mal repartido entre promotores).
 */
router.get('/duplicados', async (req, res) => {
  const resultado = await query(
    `SELECT p.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     LEFT JOIN usuarios u ON u.id = p.registrado_por
     WHERE p.campana_id = $1 AND p.veces_intentado > 1
     ORDER BY p.veces_intentado DESC LIMIT 100`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const porClasificacion = await query(
    `SELECT clasificacion, COUNT(*) as total FROM promovidos WHERE campana_id=$1 GROUP BY clasificacion`,
    [campanaId]
  );

  const sinSeguimiento = await query(
    `SELECT COUNT(*) as total FROM promovidos
     WHERE campana_id=$1 AND clasificacion='persuadible'
       AND (ultimo_contacto IS NULL OR ultimo_contacto < now() - interval '15 days')`,
    [campanaId]
  );

  const totalHoy = await query(
    `SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND creado_en::date = CURRENT_DATE`,
    [campanaId]
  );

  res.json({
    ok: true,
    data: {
      por_clasificacion: Object.fromEntries(porClasificacion.rows.map(r => [r.clasificacion, parseInt(r.total)])),
      persuadibles_sin_seguimiento: parseInt(sinSeguimiento.rows[0].total),
      registrados_hoy: parseInt(totalHoy.rows[0].total),
    },
  });
});

/**
 * GET /api/promovidos/seguimiento-prioritario
 * "¿A quién le hablo hoy?" — los persuadibles que llevan más tiempo
 * sin que nadie les dé seguimiento. Esto es directamente el principio
 * de los 7 toques aplicado: sin esto, un promovido persuadible se
 * registra una vez y nunca más se le vuelve a tocar.
 */
router.get('/seguimiento-prioritario', async (req, res) => {
  const resultado = await query(
    `SELECT p.*, s.numero as seccion_numero,
       EXTRACT(DAY FROM now() - COALESCE(p.ultimo_contacto, p.creado_en))::int as dias_sin_contacto
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id = $1 AND p.clasificacion = 'persuadible'
     ORDER BY p.ultimo_contacto ASC NULLS FIRST, p.creado_en ASC
     LIMIT 50`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ── VALIDACIÓN DE ENTRADA ──────────────────────────────────────
const esquemaPromovido = z.object({
  nombre: z.string().min(2).max(200),
  telefono: z.string().max(20).optional(),
  curp: z.string().max(18).optional(),
  seccion_numero: z.number().int().optional(),
  calle: z.string().max(255).optional(),
  partido: z.string().max(20).optional(),
  comprometido: z.boolean().default(false),
  temperatura: z.enum(['frio', 'tibio', 'caliente']).default('tibio'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  encuesta: z.record(z.any()).optional(),
  consentimiento: z.boolean(),
});

/**
 * POST /api/promovidos
 * consentimiento=true es OBLIGATORIO — sin esto no se guarda, es
 * el requisito de la LFPDPPP (Ley Federal de Protección de Datos).
 */
router.post('/', async (req, res) => {
  const parseado = esquemaPromovido.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  if (!d.consentimiento) {
    return res.status(400).json({ ok: false, error: 'Se requiere el consentimiento del ciudadano para registrar sus datos (LFPDPPP)' });
  }

  try {
    // ── DETECCIÓN DE DUPLICADOS ──────────────────────────────
    // Se busca primero por CURP (identificador único real), y si no
    // viene CURP, por nombre + teléfono dentro de la misma campaña.
    // Si ya existe, NO se crea un registro nuevo — se cuenta el
    // intento y se avisa quién lo registró la primera vez.
    let duplicado = null;
    if (d.curp) {
      const porCurp = await query(
        `SELECT p.*, u.nombre as registrado_por_nombre FROM promovidos p
         JOIN usuarios u ON u.id = p.registrado_por
         WHERE p.campana_id=$1 AND p.curp=$2`,
        [req.usuario.campana_id, d.curp]
      );
      duplicado = porCurp.rows[0] || null;
    }
    if (!duplicado && d.telefono) {
      const porNombreTel = await query(
        `SELECT p.*, u.nombre as registrado_por_nombre FROM promovidos p
         JOIN usuarios u ON u.id = p.registrado_por
         WHERE p.campana_id=$1 AND lower(p.nombre)=lower($2) AND p.telefono=$3`,
        [req.usuario.campana_id, d.nombre, d.telefono]
      );
      duplicado = porNombreTel.rows[0] || null;
    }

    if (duplicado) {
      await query('UPDATE promovidos SET veces_intentado = veces_intentado + 1 WHERE id=$1', [duplicado.id]);
      return res.status(409).json({
        ok: false,
        duplicado: true,
        error: `${d.nombre} ya está registrado en el sistema`,
        data: {
          id: duplicado.id,
          registrado_por: duplicado.registrado_por_nombre,
          fecha_registro: duplicado.creado_en,
          veces_intentado: duplicado.veces_intentado + 1,
        },
      });
    }

    let seccionId = null;
    if (d.seccion_numero) {
      const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
      seccionId = s.rows[0]?.id || null;
    }

    const resultado = await query(
      `INSERT INTO promovidos
        (campana_id, nombre, telefono, curp, seccion_id, calle, partido, comprometido,
         temperatura, lat, lng, encuesta, registrado_por, consentimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [req.usuario.campana_id, d.nombre, d.telefono || null, d.curp || null, seccionId,
       d.calle || null, d.partido || null, d.comprometido, d.temperatura,
       d.lat || null, d.lng || null, d.encuesta ? JSON.stringify(d.encuesta) : null,
       req.usuario.sub, d.consentimiento]
    );

    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (e) {
    console.error('Error creando promovido:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

/**
 * POST /api/promovidos/:id/contacto
 * Registra un toque de seguimiento — esto es lo que alimenta el
 * conteo de frecuencia de contacto.
 */
const esquemaContacto = z.object({
  tipo: z.enum(['visita', 'llamada', 'whatsapp', 'evento']).default('visita'),
  resultado: z.enum(['positivo', 'neutral', 'negativo', 'sin_respuesta']).optional(),
  notas: z.string().max(500).optional(),
});

router.post('/:id/contacto', async (req, res) => {
  const parseado = esquemaContacto.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: 'Datos de contacto inválidos' });
  }
  const d = parseado.data;

  try {
    // Verificar que el promovido pertenece a la campaña del usuario (aislamiento multi-tenant)
    const propietario = await query(
      'SELECT id FROM promovidos WHERE id=$1 AND campana_id=$2',
      [req.params.id, req.usuario.campana_id]
    );
    if (propietario.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Promovido no encontrado' });
    }

    const resultado = await query(
      `INSERT INTO contactos (campana_id, promovido_id, usuario_id, tipo, resultado, notas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.usuario.campana_id, req.params.id, req.usuario.sub, d.tipo, d.resultado || null, d.notas || null]
    );

    // Si el contacto fue positivo, ofrecer subir la temperatura automáticamente
    if (d.resultado === 'positivo') {
      await query(
        `UPDATE promovidos SET temperatura = CASE
           WHEN temperatura='frio' THEN 'tibio'
           WHEN temperatura='tibio' THEN 'caliente'
           ELSE temperatura END
         WHERE id=$1`,
        [req.params.id]
      );
    }

    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (e) {
    console.error('Error registrando contacto:', e);
    res.status(500).json({ ok: false, error: 'Error al registrar el contacto' });
  }
});

export default router;

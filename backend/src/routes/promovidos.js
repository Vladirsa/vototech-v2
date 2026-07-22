import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

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
  const { seccion, clasificacion, registrador, temperatura, buscar } = req.query;
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
  if (temperatura) { params.push(temperatura); sql += ` AND p.temperatura = $${params.length}`; }
  if (buscar) { params.push(`%${buscar}%`); sql += ` AND (unaccent(p.nombre) ILIKE unaccent($${params.length}) OR p.telefono ILIKE $${params.length})`; }
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
  situacion_grave: z.string().max(500).optional(),
  consentimiento: z.boolean(),
  genero: z.enum(['hombre', 'mujer', 'otro']).optional(),
  rango_edad: z.enum(['18-29', '30-44', '45-59', '60+']).optional(),
});

/**
 * POST /api/promovidos
 * consentimiento=true es OBLIGATORIO — sin esto no se guarda, es
 * el requisito de la LFPDPPP (Ley Federal de Protección de Datos).
 */
/**
 * GET /api/promovidos/mi-resumen
 * La pantalla que ve un promotor — SOLO sus propios números, nada
 * del resto de la campaña. Cuántos lleva, de qué sección, y qué
 * tan cerca está de su meta mínima (5 personas que lleve a votar).
 */
const META_MINIMA_PROMOTOR = 5;

/**
 * GET /api/promovidos/seguimiento
 * Los persuadibles que necesitan que alguien vuelva por ellos —
 * ordenados con los vencidos primero (nadie los ha contactado a
 * tiempo), luego por fecha de próximo contacto más próxima.
 */
router.get('/seguimiento', async (req, res) => {
  const soloMios = req.query.solo_mios === 'true';
  const filtroAsignado = soloMios ? 'AND (p.asignado_seguimiento_a=$2 OR p.registrado_por=$2)' : '';
  const params = soloMios ? [req.usuario.campana_id, req.usuario.sub] : [req.usuario.campana_id];

  const resultado = await query(
    `SELECT p.id, p.nombre, p.telefono, p.veces_contactado, p.proximo_seguimiento, p.notas_seguimiento,
            s.numero as seccion_numero, u.nombre as asignado_a_nombre, p.asignado_seguimiento_a,
            (p.proximo_seguimiento IS NOT NULL AND p.proximo_seguimiento < CURRENT_DATE) as vencido
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     LEFT JOIN usuarios u ON u.id = p.asignado_seguimiento_a
     WHERE p.campana_id=$1 AND p.clasificacion='persuadible' ${filtroAsignado}
     ORDER BY (p.proximo_seguimiento IS NULL) ASC, p.proximo_seguimiento ASC NULLS LAST`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * PATCH /api/promovidos/:id/seguimiento
 * Registrar un intento de contacto: qué pasó, cuándo volver a
 * intentarlo, y a quién se le asigna esa siguiente vuelta. Si en el
 * mismo movimiento la persona ya se convenció, se actualiza directo
 * a comprometido — no hace falta un paso aparte.
 */
router.patch('/:id/seguimiento', async (req, res) => {
  const { notas, proximo_seguimiento, asignado_a, se_convencio } = req.body;

  const actual = await query('SELECT veces_contactado FROM promovidos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!actual.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  if (se_convencio) {
    const resultado = await query(
      `UPDATE promovidos SET comprometido=true, clasificacion='base', notas_seguimiento=$1,
              veces_contactado=veces_contactado+1, proximo_seguimiento=NULL
       WHERE id=$2 AND campana_id=$3 RETURNING *`,
      [notas || null, req.params.id, req.usuario.campana_id]
    );
    return res.json({ ok: true, data: resultado.rows[0], mensaje: '🎉 ¡Se convenció! Movido a Base.' });
  }

  const resultado = await query(
    `UPDATE promovidos SET notas_seguimiento=$1, proximo_seguimiento=$2, asignado_seguimiento_a=$3, veces_contactado=veces_contactado+1
     WHERE id=$4 AND campana_id=$5 RETURNING *`,
    [notas || null, proximo_seguimiento || null, asignado_a || null, req.params.id, req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});

router.get('/mi-resumen', async (req, res) => {
  const misPromovidos = await query(
    `SELECT p.id, p.nombre, p.comprometido, s.numero as seccion_numero, p.creado_en
     FROM promovidos p LEFT JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id=$1 AND p.registrado_por=$2 ORDER BY p.creado_en DESC`,
    [req.usuario.campana_id, req.usuario.sub]
  );

  const total = misPromovidos.rows.length;
  const comprometidos = misPromovidos.rows.filter((p) => p.comprometido).length;
  const porSeccion = {};
  misPromovidos.rows.forEach((p) => {
    const s = p.seccion_numero || 'sin sección';
    porSeccion[s] = (porSeccion[s] || 0) + 1;
  });

  res.json({
    ok: true,
    data: {
      total,
      comprometidos,
      meta: META_MINIMA_PROMOTOR,
      porcentaje_meta: Math.min(100, Math.round((comprometidos / META_MINIMA_PROMOTOR) * 100)),
      por_seccion: Object.entries(porSeccion).map(([seccion, total]) => ({ seccion, total })).sort((a, b) => b.total - a.total),
      ultimos: misPromovidos.rows.slice(0, 5),
    },
  });
});

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
      const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
      seccionId = s.rows[0]?.id || null;
    }

    const resultado = await query(
      `INSERT INTO promovidos
        (campana_id, nombre, telefono, curp, seccion_id, calle, partido, comprometido,
         temperatura, lat, lng, encuesta, situacion_grave, registrado_por, consentimiento, genero, rango_edad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [req.usuario.campana_id, d.nombre, d.telefono || null, d.curp || null, seccionId,
       d.calle || null, d.partido || null, d.comprometido, d.temperatura,
       d.lat || null, d.lng || null, d.encuesta ? JSON.stringify(d.encuesta) : null,
       d.situacion_grave || null, req.usuario.sub, d.consentimiento, d.genero || null, d.rango_edad || null]
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

/**
 * GET /api/promovidos/:id
 * Ficha completa de un promovido — incluye TODO su historial de
 * contactos, para ver la evolución real de la relación, no solo
 * el contador.
 */
router.get('/:id', async (req, res) => {
  const promovido = await query(
    `SELECT p.*, s.numero as seccion_numero, u.nombre as registrado_por_nombre
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     LEFT JOIN usuarios u ON u.id = p.registrado_por
     WHERE p.id=$1 AND p.campana_id=$2`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!promovido.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const historial = await query(
    `SELECT c.*, u.nombre as usuario_nombre FROM contactos c
     JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.promovido_id=$1 ORDER BY c.creado_en DESC`,
    [req.params.id]
  );

  res.json({ ok: true, data: { ...promovido.rows[0], historial: historial.rows } });
});

const esquemaEditar = z.object({
  nombre: z.string().min(2).max(200).optional(),
  telefono: z.string().max(20).optional(),
  curp: z.string().max(18).optional(),
  seccion_numero: z.number().int().optional(),
  calle: z.string().max(255).optional(),
  partido: z.string().max(20).optional(),
  comprometido: z.boolean().optional(),
  temperatura: z.enum(['frio', 'tibio', 'caliente']).optional(),
});

/**
 * PATCH /api/promovidos/:id
 * Corregir datos — el trigger de clasificación automática se vuelve
 * a disparar solo (partido/comprometido/temperatura cambiaron), así
 * que si editas el partido, la clasificación Base/Persuadible/
 * Adversario se recalcula sola.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let seccionId;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
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
    `UPDATE promovidos SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

const esquemaFilaImportar = z.object({
  nombre: z.string().min(2).max(200),
  telefono: z.string().max(20).optional(),
  seccion_numero: z.number().int().optional(),
  partido: z.string().max(20).optional(),
  comprometido: z.boolean().optional(),
});

/**
 * POST /api/promovidos/importar
 * Importación masiva de una base de datos QUE EL CANDIDATO YA TIENE
 * (su propio Excel/CSV de contactos previos) — distinto por completo
 * al padrón electoral oficial, que nunca se importa a esta plataforma.
 * El candidato declara aquí que esos contactos son suyos y que ya
 * contaba con su consentimiento al recopilarlos.
 */
router.post('/importar', async (req, res) => {
  const { filas, declaro_consentimiento } = req.body;
  if (!declaro_consentimiento) {
    return res.status(400).json({ ok: false, error: 'Debes confirmar que ya contabas con el consentimiento de estos contactos' });
  }
  if (!Array.isArray(filas) || filas.length === 0 || filas.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Se requiere una lista de 1 a 5000 registros' });
  }

  let importados = 0, duplicados = 0, errores = 0;
  for (const fila of filas) {
    const parseado = esquemaFilaImportar.safeParse(fila);
    if (!parseado.success) { errores++; continue; }
    const d = parseado.data;

    try {
      // Misma lógica de duplicados que el registro individual — no
      // crear dos veces a la misma persona si ya existía.
      let duplicado = null;
      if (d.telefono) {
        const existente = await query(
          `SELECT id FROM promovidos WHERE campana_id=$1 AND lower(nombre)=lower($2) AND telefono=$3`,
          [req.usuario.campana_id, d.nombre, d.telefono]
        );
        duplicado = existente.rows[0];
      }
      if (duplicado) { duplicados++; continue; }

      let seccionId = null;
      if (d.seccion_numero) {
        const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
        seccionId = s.rows[0]?.id || null;
      }

      await query(
        `INSERT INTO promovidos (campana_id, nombre, telefono, seccion_id, partido, comprometido, temperatura, registrado_por, consentimiento)
         VALUES ($1,$2,$3,$4,$5,$6,'tibio',$7,true)`,
        [req.usuario.campana_id, d.nombre, d.telefono || null, seccionId, d.partido || null, d.comprometido || false, req.usuario.sub]
      );
      importados++;
    } catch (e) {
      errores++;
    }
  }

  // Importar datos de ciudadanos de golpe (hasta 5000 a la vez) es
  // justo el tipo de acción que vale la pena poder rastrear después:
  // quién subió qué lote, cuándo, y cuántos registros entraron.
  await registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'promovidos_importacion', registroId: null,
    detalle: { total_filas: filas.length, importados, duplicados, errores },
    ip: req.ip,
  });

  res.json({ ok: true, importados, duplicados, errores, total: filas.length });
});

/**
 * PATCH /api/promovidos/:id/clasificacion
 * Cambio manual de clasificación (al arrastrar una tarjeta en el
 * tablero) — queda marcado como ajuste manual para que el
 * disparador automático ya no lo recalcule después.
 */
router.patch('/:id/clasificacion', async (req, res) => {
  const { clasificacion } = req.body;
  if (!['base', 'persuadible', 'adversario'].includes(clasificacion)) {
    return res.status(400).json({ ok: false, error: 'Clasificación inválida' });
  }
  const resultado = await query(
    `UPDATE promovidos SET clasificacion=$1, clasificacion_manual=true
     WHERE id=$2 AND campana_id=$3 RETURNING id, nombre, clasificacion`,
    [clasificacion, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

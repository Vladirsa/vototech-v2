import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';

const router = Router();

// ── Roles que SIEMPRE pueden seguir capturando, incluso tras el cierre ──
const ROLES_ALTOS_MANDO = ['candidato', 'jefe_campana', 'coord_general'];

/**
 * Verifica si la captura está cerrada para el rol de quien pide —
 * automático por hora (fecha_cierre_casillas) o manual (captura_cerrada).
 * Los altos mandos SIEMPRE pueden seguir, para correcciones de último
 * momento — el bloqueo es para promotores/representantes de casilla.
 */
async function capturaBloqueadaPara(campanaId, rol) {
  if (ROLES_ALTOS_MANDO.includes(rol)) return false;
  const c = await query('SELECT fecha_cierre_casillas, captura_cerrada FROM campanas WHERE id=$1', [campanaId]);
  const campana = c.rows[0];
  if (!campana) return false;
  if (campana.captura_cerrada) return true;
  if (campana.fecha_cierre_casillas && new Date(campana.fecha_cierre_casillas) < new Date()) return true;
  return false;
}

router.use(requiereAuth);

/**
 * GET /api/dia-eleccion/prep
 * El checklist de preparación — todo lo que hay que cerrar ANTES del
 * día D: cobertura de casillas, representantes confirmados, y qué
 * falta. Se usa en los días previos, no el día mismo.
 */
router.get('/prep', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const casillas = await query(
    `SELECT c.*, s.numero as seccion_numero, u.nombre as representante_nombre
     FROM casillas c JOIN secciones s ON s.id=c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     WHERE c.campana_id=$1 ORDER BY s.numero`,
    [campanaId]
  );

  const total = casillas.rows.length;
  const conRepresentante = casillas.rows.filter((c) => c.representante_id).length;
  const confirmadas = casillas.rows.filter((c) => c.confirmado_asistencia).length;

  const campanaRes = await query('SELECT fecha_eleccion, fecha_cierre_casillas, captura_cerrada FROM campanas WHERE id=$1', [campanaId]);

  res.json({
    ok: true,
    data: {
      total_casillas: total,
      con_representante: conRepresentante,
      confirmadas_asistencia: confirmadas,
      sin_representante: total - conRepresentante,
      casillas: casillas.rows,
      fecha_eleccion: campanaRes.rows[0]?.fecha_eleccion,
      fecha_cierre_casillas: campanaRes.rows[0]?.fecha_cierre_casillas,
      captura_cerrada: campanaRes.rows[0]?.captura_cerrada,
      listo: total > 0 && conRepresentante === total && confirmadas === total,
    },
  });
});

const esquemaCasilla = z.object({
  seccion_numero: z.number().int(),
  numero: z.string().default('B'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  direccion: z.string().max(255).optional(),
  representante_id: z.string().uuid().optional(),
});

/**
 * POST /api/dia-eleccion/casillas
 * Registrar dónde está una casilla y quién la cubre — se usa desde
 * el mapa (pin arrastrable) o desde este mismo módulo.
 */
router.post('/casillas', async (req, res) => {
  const parseado = esquemaCasilla.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const seccion = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
  if (!seccion.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });

  const resultado = await query(
    `INSERT INTO casillas (campana_id, seccion_id, numero, lat, lng, direccion, representante_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (campana_id, seccion_id, numero)
     DO UPDATE SET lat=COALESCE($4, casillas.lat), lng=COALESCE($5, casillas.lng),
       direccion=COALESCE($6, casillas.direccion), representante_id=COALESCE($7, casillas.representante_id)
     RETURNING *`,
    [req.usuario.campana_id, seccion.rows[0].id, d.numero, d.lat || null, d.lng || null, d.direccion || null, d.representante_id || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/dia-eleccion/casillas
 * Todas las casillas con ubicación — para la capa del mapa.
 */
router.get('/casillas', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, s.numero as seccion_numero, u.nombre as representante_nombre
     FROM casillas c JOIN secciones s ON s.id=c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     WHERE c.campana_id=$1`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * PATCH /api/dia-eleccion/casillas/:id/confirmar
 * El representante confirma "sí voy a estar" — parte del prep.
 */
router.patch('/casillas/:id/confirmar', async (req, res) => {
  const resultado = await query(
    `UPDATE casillas SET confirmado_asistencia=true WHERE id=$1 AND campana_id=$2 RETURNING *`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/dia-eleccion/resultados
 */
router.get('/resultados', async (req, res) => {
  const resultado = await query(
    `SELECT r.*, s.numero as seccion_numero, u.nombre as capturado_por_nombre
     FROM resultados_casilla r
     JOIN secciones s ON s.id = r.seccion_id
     JOIN usuarios u ON u.id = r.capturado_por
     WHERE r.campana_id = $1 ORDER BY r.capturado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaResultado = z.object({
  seccion_numero: z.number().int(),
  casilla: z.string().default('B'),
  votos: z.record(z.number().int()),
  nulos: z.number().int().default(0),
  lista_nominal: z.number().int().optional(),
  foto_acta_url: z.string().url().optional(),
});

/**
 * POST /api/dia-eleccion/resultados
 * Captura Y transmite en vivo — ahora respeta el cierre de captura
 * (automático o manual) para roles que no son alto mando.
 */
router.post('/resultados', async (req, res) => {
  const bloqueada = await capturaBloqueadaPara(req.usuario.campana_id, req.usuario.rol);
  if (bloqueada) {
    return res.status(403).json({ ok: false, error: '🔒 La captura ya está cerrada. Solo el candidato o jefe de campaña pueden seguir editando resultados.' });
  }

  const parseado = esquemaResultado.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  try {
    const seccion = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
    if (!seccion.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });

    const resultado = await query(
      `INSERT INTO resultados_casilla (campana_id, seccion_id, casilla, votos, nulos, lista_nominal, foto_acta_url, capturado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (campana_id, seccion_id, casilla)
       DO UPDATE SET votos=$4, nulos=$5, lista_nominal=$6, foto_acta_url=COALESCE($7, resultados_casilla.foto_acta_url), capturado_por=$8, capturado_en=now()
       RETURNING *`,
      [req.usuario.campana_id, seccion.rows[0].id, d.casilla, JSON.stringify(d.votos), d.nulos, d.lista_nominal || null, d.foto_acta_url || null, req.usuario.sub]
    );

    const filaCompleta = { ...resultado.rows[0], seccion_numero: d.seccion_numero, capturado_por_nombre: req.usuario.nombre };
    getIo().to(`campana:${req.usuario.campana_id}`).emit('resultado_actualizado', filaCompleta);

    res.status(201).json({ ok: true, data: filaCompleta });
  } catch (e) {
    console.error('Error guardando resultado de casilla:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar el resultado' });
  }
});

/**
 * GET /api/dia-eleccion/conteo-rapido
 * Suma en vivo de todo lo capturado hasta ahora, con el % de
 * casillas ya reportadas — tu propio "conteo rápido" antes del oficial.
 */
router.get('/conteo-rapido', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const resultados = await query(`SELECT votos, nulos, lista_nominal FROM resultados_casilla WHERE campana_id=$1`, [campanaId]);
  const totalCasillasRes = await query(`SELECT COUNT(*) as total FROM casillas WHERE campana_id=$1`, [campanaId]);

  const sumaPartidos = {};
  let totalNulos = 0, totalListaNominal = 0;
  resultados.rows.forEach((r) => {
    Object.entries(r.votos).forEach(([p, v]) => { sumaPartidos[p] = (sumaPartidos[p] || 0) + v; });
    totalNulos += r.nulos || 0;
    totalListaNominal += r.lista_nominal || 0;
  });
  const totalVotos = Object.values(sumaPartidos).reduce((a, b) => a + b, 0) + totalNulos;
  const totalCasillasEsperadas = parseInt(totalCasillasRes.rows[0].total) || 1;
  const porcentajeReportado = Math.min(100, +((resultados.rows.length / totalCasillasEsperadas) * 100).toFixed(1));

  res.json({
    ok: true,
    data: {
      casillas_reportadas: resultados.rows.length,
      casillas_esperadas: totalCasillasEsperadas,
      porcentaje_reportado: porcentajeReportado,
      votos_por_partido: sumaPartidos,
      total_votos: totalVotos,
      total_nulos: totalNulos,
      participacion_pct: totalListaNominal > 0 ? +((totalVotos / totalListaNominal) * 100).toFixed(1) : null,
    },
  });
});

/**
 * GET /api/dia-eleccion/alertas-sin-reportar
 * Casillas con representante confirmado pero SIN resultado
 * capturado, pasada cierta hora del cierre — para detectar
 * representantes con problemas antes de que sea muy tarde.
 */
router.get('/alertas-sin-reportar', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const casillas = await query(
    `SELECT c.id, s.numero as seccion_numero, c.numero as casilla_numero, u.nombre as representante_nombre, u.telefono
     FROM casillas c JOIN secciones s ON s.id=c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     WHERE c.campana_id=$1 AND c.confirmado_asistencia=true
       AND NOT EXISTS (
         SELECT 1 FROM resultados_casilla r WHERE r.campana_id=$1 AND r.seccion_id=c.seccion_id AND r.casilla=c.numero
       )`,
    [campanaId]
  );
  res.json({ ok: true, data: casillas.rows });
});

/**
 * POST /api/dia-eleccion/cerrar-captura
 * Bloqueo manual — solo alto mando puede activarlo/desactivarlo.
 */
router.post('/cerrar-captura', async (req, res) => {
  if (!ROLES_ALTOS_MANDO.includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo el candidato o jefe de campaña pueden cerrar la captura' });
  }
  const { cerrar } = req.body;
  await query('UPDATE campanas SET captura_cerrada=$1 WHERE id=$2', [!!cerrar, req.usuario.campana_id]);
  getIo().to(`campana:${req.usuario.campana_id}`).emit('captura_estado_cambio', { cerrada: !!cerrar });
  res.json({ ok: true, cerrada: !!cerrar });
});

/**
 * GET /api/dia-eleccion/caceria
 * "Lista de cacería" — promovidos BASE comprometidos que a esta hora
 * NO han confirmado que ya votaron.
 */
router.get('/caceria', async (req, res) => {
  const resultado = await query(
    `SELECT p.id, p.nombre, p.telefono, p.ya_voto, s.numero as seccion_numero
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id = $1 AND p.clasificacion = 'base' AND p.comprometido = true AND p.ya_voto = false
     ORDER BY s.numero`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows, total: resultado.rows.length });
});

/**
 * GET /api/dia-eleccion/confirmados
 * Los que YA marcaron que votaron — para la capa verde del mapa,
 * complemento de la cacería (que muestra a los que faltan, en rojo).
 */
router.get('/confirmados', async (req, res) => {
  const resultado = await query(
    `SELECT p.id, p.nombre, p.hora_voto, s.numero as seccion_numero, p.lat, p.lng
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id = $1 AND p.clasificacion = 'base' AND p.comprometido = true AND p.ya_voto = true
     ORDER BY p.hora_voto DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.patch('/caceria/:id/voto', async (req, res) => {
  const resultado = await query(
    `UPDATE promovidos SET ya_voto = true, hora_voto = now()
     WHERE id=$1 AND campana_id=$2 RETURNING id, nombre`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  getIo().to(`campana:${req.usuario.campana_id}`).emit('voto_confirmado', resultado.rows[0]);
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

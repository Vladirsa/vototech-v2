import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// 🆕 Mismo cache en memoria que ya usa geo.js — para calcular el
// centro aproximado de cada sección y poder posicionar sus casillas
// en el mapa automáticamente, sin que nadie tenga que colocarlas a mano.
let cacheGeoSecciones = null;
function centroDeSeccion(numeroSeccion) {
  if (!cacheGeoSecciones) {
    const rutaArchivo = path.join(__dirname, '../db/secciones_tlaxcala.geojson');
    cacheGeoSecciones = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
  }
  const feature = cacheGeoSecciones.features.find((f) => f.properties.seccion === numeroSeccion);
  if (!feature) return null;
  const anillo = feature.geometry.coordinates[0];
  let sumaLat = 0, sumaLng = 0;
  anillo.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
  return { lat: sumaLat / anillo.length, lng: sumaLng / anillo.length };
}

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
 * 🆕 GET /api/dia-eleccion/casillas-sugeridas
 * Cuántas casillas le tocan REALMENTE a cada sección de tu
 * territorio, según la regla oficial del INE: una casilla por cada
 * 750 electores o fracción (Art. 253, 258 y 284 de la LGIPE) — así
 * puedes ir asignando representantes ANTES de que el INE publique
 * su propio listado oficial, en vez de esperar hasta el final.
 *
 * Compara contra las casillas que YA registraste en el sistema, para
 * que se vea claro cuántas faltan por dar de alta en cada sección.
 */
router.get('/casillas-sugeridas', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const campanaRes = await query('SELECT territorio_tipo, territorio_id FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  let filtroTerritorio = '';
  const params = [req.usuario.estado_id];
  if (campana?.territorio_tipo === 'municipio' && campana.territorio_id) {
    filtroTerritorio = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2)';
    params.push(campana.territorio_id);
  } else if (campana?.territorio_tipo === 'distrito_local' && campana.territorio_id) {
    filtroTerritorio = 'AND s.distrito_local = $2';
    params.push(campana.territorio_id);
  } else if (campana?.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
    filtroTerritorio = 'AND s.distrito_federal = $2';
    params.push(campana.territorio_id);
  } else if (campana?.territorio_tipo === 'seccion' && campana.territorio_id) {
    filtroTerritorio = 'AND s.numero = $2';
    params.push(campana.territorio_id);
  }
  // 'estatal' (gobernador/senador) no agrega filtro — todo el estado

  const secciones = await query(
    `SELECT s.id, s.numero, m.nombre as municipio, s.lista_nominal,
       CEIL(GREATEST(1, COALESCE(s.lista_nominal, 0))::numeric / 750) as casillas_sugeridas
     FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     WHERE s.estado_id=$1 ${filtroTerritorio} AND s.lista_nominal > 0
     ORDER BY s.numero`,
    params
  );

  const yaRegistradas = await query(
    `SELECT s.numero, COUNT(*) as total FROM casillas c
     JOIN secciones s ON s.id = c.seccion_id
     WHERE c.campana_id=$1 GROUP BY s.numero`,
    [campanaId]
  );
  const registradasPorSeccion = {};
  yaRegistradas.rows.forEach((r) => { registradasPorSeccion[r.numero] = parseInt(r.total); });

  const data = secciones.rows.map((s) => {
    const sugeridas = parseInt(s.casillas_sugeridas);
    const registradas = registradasPorSeccion[s.numero] || 0;
    return {
      seccion: s.numero, municipio: s.municipio, lista_nominal: s.lista_nominal,
      casillas_sugeridas: sugeridas, casillas_registradas: registradas,
      faltantes: Math.max(0, sugeridas - registradas),
    };
  });

  res.json({
    ok: true, data,
    resumen: {
      total_secciones: data.length,
      total_casillas_sugeridas: data.reduce((s, d) => s + d.casillas_sugeridas, 0),
      total_casillas_registradas: data.reduce((s, d) => s + d.casillas_registradas, 0),
      total_faltantes: data.reduce((s, d) => s + d.faltantes, 0),
    },
  });
});

/**
 * 🆕 POST /api/dia-eleccion/casillas-sugeridas/:seccion_numero/generar
 * Da de alta de un jalón las casillas que le faltan a una sección
 * (B, C1, C2...) según el cálculo de 750 electores por casilla — y
 * las posiciona automáticamente cerca del centro de la sección (con
 * un pequeño desfase para que no queden todas exactamente encimadas),
 * listas para arrastrarse a su ubicación real en cuanto se sepa.
 */
router.post('/casillas-sugeridas/:seccion_numero/generar', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const numeroSeccion = parseInt(req.params.seccion_numero);

  const seccionRes = await query('SELECT id, lista_nominal FROM secciones WHERE estado_id=$2 AND numero=$1', [numeroSeccion, req.usuario.estado_id]);
  if (!seccionRes.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
  const seccionId = seccionRes.rows[0].id;
  const sugeridas = Math.ceil(Math.max(1, seccionRes.rows[0].lista_nominal || 0) / 750);

  const existentesRes = await query('SELECT numero FROM casillas WHERE campana_id=$1 AND seccion_id=$2', [campanaId, seccionId]);
  const existentes = new Set(existentesRes.rows.map((r) => r.numero));
  const centro = centroDeSeccion(numeroSeccion);

  const creadas = [];
  const nombresCasilla = ['B', ...Array.from({ length: Math.max(0, sugeridas - 1) }, (_, i) => `C${i + 1}`)];
  for (let i = 0; i < nombresCasilla.length; i++) {
    const nombre = nombresCasilla[i];
    if (existentes.has(nombre)) continue;
    // Pequeño desfase en espiral para que las casillas de una misma
    // sección no queden todas apiladas exactamente en el mismo punto.
    const angulo = i * 2.4;
    const radio = 0.0006 * (1 + Math.floor(i / 6));
    const lat = centro ? centro.lat + Math.cos(angulo) * radio : null;
    const lng = centro ? centro.lng + Math.sin(angulo) * radio : null;
    const r = await query(
      `INSERT INTO casillas (campana_id, seccion_id, numero, lat, lng) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [campanaId, seccionId, nombre, lat, lng]
    );
    creadas.push(r.rows[0]);
  }
  res.status(201).json({ ok: true, data: creadas, mensaje: `${creadas.length} casilla(s) nueva(s) creada(s) y posicionada(s) en el mapa — arrástralas a su ubicación real en cuanto la sepas.` });
});

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

/**
 * 🆕 GET /api/dia-eleccion/casillas-estadisticas
 * Para el panel del candidato — cobertura general y alertas claras
 * de qué falta cerrar antes del día D.
 */
router.get('/casillas-estadisticas', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const casillas = await query(
    `SELECT c.*, s.numero as seccion_numero, u.nombre as representante_nombre, u2.nombre as suplente_nombre
     FROM casillas c JOIN secciones s ON s.id=c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     LEFT JOIN usuarios u2 ON u2.id = c.suplente_id
     WHERE c.campana_id=$1 ORDER BY s.numero, c.numero`,
    [campanaId]
  );
  const total = casillas.rows.length;
  const conRepresentante = casillas.rows.filter((c) => c.representante_id).length;
  const conSuplente = casillas.rows.filter((c) => c.suplente_id).length;
  const confirmadas = casillas.rows.filter((c) => c.confirmado_asistencia).length;
  const conUbicacion = casillas.rows.filter((c) => c.lat && c.lng).length;

  const alertas = [];
  const sinRepresentante = casillas.rows.filter((c) => !c.representante_id);
  if (sinRepresentante.length > 0) {
    alertas.push({ nivel: 'alta', texto: `${sinRepresentante.length} casilla(s) sin representante asignado`, secciones: [...new Set(sinRepresentante.map((c) => c.seccion_numero))] });
  }
  const sinSuplente = casillas.rows.filter((c) => c.representante_id && !c.suplente_id);
  if (sinSuplente.length > 0) {
    alertas.push({ nivel: 'media', texto: `${sinSuplente.length} casilla(s) con representante pero sin suplente`, secciones: [...new Set(sinSuplente.map((c) => c.seccion_numero))] });
  }
  const sinConfirmar = casillas.rows.filter((c) => c.representante_id && !c.confirmado_asistencia);
  if (sinConfirmar.length > 0) {
    alertas.push({ nivel: 'media', texto: `${sinConfirmar.length} representante(s) sin confirmar asistencia todavía`, secciones: [...new Set(sinConfirmar.map((c) => c.seccion_numero))] });
  }

  res.json({
    ok: true,
    data: {
      total_casillas: total,
      con_representante: conRepresentante,
      con_suplente: conSuplente,
      confirmadas_asistencia: confirmadas,
      con_ubicacion_en_mapa: conUbicacion,
      porcentaje_cobertura: total > 0 ? Math.round((conRepresentante / total) * 100) : 0,
      alertas,
    },
  });
});

const esquemaCasilla = z.object({
  seccion_numero: z.number().int(),
  numero: z.string().default('B'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  direccion: z.string().max(255).optional(),
  representante_id: z.string().uuid().nullable().optional(),
  suplente_id: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/dia-eleccion/casillas
 * Registrar dónde está una casilla y quién la cubre (representante Y
 * suplente) — se usa desde el mapa (pin arrastrable) o desde el
 * panel de Prep.
 */
router.post('/casillas', async (req, res) => {
  const parseado = esquemaCasilla.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const seccion = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
  if (!seccion.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });

  // 🆕 Primero se asegura que la fila exista (alta si es nueva, sin
  // tocar nada si ya existía) — y LUEGO solo se actualizan los campos
  // que de verdad vinieron en la petición. Así, asignar un
  // representante nunca borra por accidente al suplente que ya
  // estaba, ni viceversa — cada campo se actualiza solo si alguien
  // realmente lo mandó.
  await query(
    `INSERT INTO casillas (campana_id, seccion_id, numero) VALUES ($1,$2,$3)
     ON CONFLICT (campana_id, seccion_id, numero) DO NOTHING`,
    [req.usuario.campana_id, seccion.rows[0].id, d.numero]
  );

  const campos = [];
  const valores = [];
  let i = 1;
  if (d.lat !== undefined) { campos.push(`lat=$${i++}`); valores.push(d.lat); }
  if (d.lng !== undefined) { campos.push(`lng=$${i++}`); valores.push(d.lng); }
  if (d.direccion !== undefined) { campos.push(`direccion=$${i++}`); valores.push(d.direccion); }
  if ('representante_id' in req.body) { campos.push(`representante_id=$${i++}`); valores.push(d.representante_id ?? null); }
  if ('suplente_id' in req.body) { campos.push(`suplente_id=$${i++}`); valores.push(d.suplente_id ?? null); }

  let resultado;
  if (campos.length > 0) {
    valores.push(req.usuario.campana_id, seccion.rows[0].id, d.numero);
    resultado = await query(
      `UPDATE casillas SET ${campos.join(', ')} WHERE campana_id=$${i} AND seccion_id=$${i + 1} AND numero=$${i + 2} RETURNING *`,
      valores
    );
  } else {
    resultado = await query(
      `SELECT * FROM casillas WHERE campana_id=$1 AND seccion_id=$2 AND numero=$3`,
      [req.usuario.campana_id, seccion.rows[0].id, d.numero]
    );
  }
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/**
 * 🆕 PATCH /api/dia-eleccion/casillas/:id/posicion
 * Mover el pin de una casilla en el mapa (al arrastrarlo) — separado
 * del POST general para no arriesgar pisar representante/suplente
 * por accidente al solo mover el punto.
 */
router.patch('/casillas/:id/posicion', async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ ok: false, error: 'Coordenadas inválidas' });
  const resultado = await query(
    `UPDATE casillas SET lat=$1, lng=$2 WHERE id=$3 AND campana_id=$4 RETURNING *`,
    [lat, lng, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * 🆕 PATCH /api/dia-eleccion/casillas/:id/datos-nombramiento
 * Guarda la clave de elector y el domicilio del representante — son
 * 2 de los datos que exige la LGIPE (Art. 259 y Lineamientos de
 * Registro de Representantes) para el nombramiento formal, y que no
 * se piden en ningún otro lado del sistema.
 */
router.patch('/casillas/:id/datos-nombramiento', async (req, res) => {
  const { representante_clave_elector, representante_domicilio } = req.body;
  const campos = [];
  const valores = [];
  let i = 1;
  if (representante_clave_elector !== undefined) { campos.push(`representante_clave_elector=$${i++}`); valores.push(representante_clave_elector); }
  if (representante_domicilio !== undefined) { campos.push(`representante_domicilio=$${i++}`); valores.push(representante_domicilio); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(
    `UPDATE casillas SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * 🆕 GET /api/dia-eleccion/casillas/:id/nombramiento-pdf
 * Genera el nombramiento del representante con los campos que exige
 * la LGIPE Art. 259 y los Lineamientos de Registro de Representantes:
 * partido, nombre, carácter (propietario/suplente), distrito, sección,
 * casilla, domicilio, clave de elector, y espacio para firma y fecha.
 *
 * IMPORTANTE: este PDF es un borrador para AGILIZAR el trámite — el
 * registro real y válido se hace ante el Consejo Distrital del INE,
 * en los plazos que marca la ley (hasta 13 días antes de la elección
 * para el registro, 10 días antes como límite para el Consejo).
 */
router.get('/casillas/:id/nombramiento-pdf', async (req, res) => {
  const casillaRes = await query(
    `SELECT c.*, s.numero as seccion_numero, s.distrito_local, s.distrito_federal,
            u.nombre as representante_nombre, u2.nombre as suplente_nombre,
            camp.nombre_candidato, camp.partido
     FROM casillas c
     JOIN secciones s ON s.id = c.seccion_id
     JOIN campanas camp ON camp.id = c.campana_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     LEFT JOIN usuarios u2 ON u2.id = c.suplente_id
     WHERE c.id=$1 AND c.campana_id=$2`,
    [req.params.id, req.usuario.campana_id]
  );
  const c = casillaRes.rows[0];
  if (!c) return res.status(404).json({ ok: false, error: 'No encontrada' });
  if (!c.representante_id) return res.status(400).json({ ok: false, error: 'Esta casilla todavía no tiene representante asignado' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=nombramiento_seccion${c.seccion_numero}_casilla${c.numero}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(14).font('Helvetica-Bold').text('NOMBRAMIENTO DE REPRESENTANTE ANTE MESA DIRECTIVA DE CASILLA', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(8).font('Helvetica').fillColor('#666').text('Conforme al Art. 259 de la LGIPE y los Lineamientos para el Registro de Representantes — borrador para agilizar el trámite ante el Consejo Distrital', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1.5);

  const fila = (etiqueta, valor) => {
    doc.fontSize(10).font('Helvetica-Bold').text(etiqueta, { continued: true }).font('Helvetica').text(`  ${valor || '_____________________'}`);
    doc.moveDown(0.5);
  };

  fila('I. Partido político o coalición:', c.partido || '_____________________');
  fila('II. Nombre del representante propietario:', c.representante_nombre);
  fila('   Nombre del representante suplente:', c.suplente_nombre);
  fila('III. Distrito Electoral Federal:', c.distrito_federal);
  fila('     Distrito Electoral Local:', c.distrito_local);
  fila('     Sección:', c.seccion_numero);
  fila('     Casilla:', c.numero);
  fila('IV. Domicilio del representante:', c.representante_domicilio);
  fila('V. Clave de la credencial para votar:', c.representante_clave_elector);
  fila('VI. Lugar y fecha de expedición:', `Tlaxcala, a ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`);

  doc.moveDown(3);
  doc.fontSize(9).text('_______________________________', { align: 'center' });
  doc.text('Firma del representante', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(7).fillColor('#888').text('La firma podrá realizarse hasta antes de acreditarse en la casilla el día de la jornada electoral (Art. 261 LGIPE).', { align: 'center' });

  await query('UPDATE casillas SET nombramiento_generado_en=now() WHERE id=$1', [c.id]);
  doc.end();
});

/**
 * GET /api/dia-eleccion/casillas
 * Todas las casillas con ubicación — para la capa del mapa. Incluye
 * cuántas personas se espera que voten ahí (lista nominal de su
 * sección repartida entre sus casillas) y el nombre del suplente.
 */
router.get('/casillas', async (req, res) => {
  // 🆕 Igual que en Activos/Incidencias/Agenda — conteo ligero para
  // el checkbox del mapa.
  if (req.query.contar) {
    const resultado = await query('SELECT COUNT(*) as total FROM casillas WHERE campana_id=$1 AND lat IS NOT NULL', [req.usuario.campana_id]);
    return res.json({ ok: true, total: parseInt(resultado.rows[0].total) });
  }

  const resultado = await query(
    `SELECT c.*, s.numero as seccion_numero, s.lista_nominal as seccion_lista_nominal,
            u.nombre as representante_nombre, u.telefono as representante_telefono,
            u2.nombre as suplente_nombre, u2.telefono as suplente_telefono,
            (SELECT COUNT(*) FROM casillas c2 WHERE c2.campana_id=c.campana_id AND c2.seccion_id=c.seccion_id) as total_casillas_seccion
     FROM casillas c JOIN secciones s ON s.id=c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     LEFT JOIN usuarios u2 ON u2.id = c.suplente_id
     WHERE c.campana_id=$1`,
    [req.usuario.campana_id]
  );
  const conEstimado = resultado.rows.map((c) => ({
    ...c,
    personas_esperadas: c.total_casillas_seccion > 0 ? Math.round((c.seccion_lista_nominal || 0) / c.total_casillas_seccion) : null,
  }));
  res.json({ ok: true, data: conEstimado });
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
    const seccion = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
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

    // Los resultados electorales son lo más sensible de todo el
    // sistema — cada captura/corrección queda en la bitácora, con
    // los votos exactos que se guardaron, para poder rastrear
    // cualquier cambio después.
    registrarAuditoria({
      campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
      accion: 'crear', tabla: 'resultados_casilla', registroId: resultado.rows[0].id,
      detalle: { seccion: d.seccion_numero, casilla: d.casilla, votos: d.votos, nulos: d.nulos },
      ip: req.ip,
    });

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

/**
 * GET /api/dia-eleccion/avance-estructura
 * La vista pensada para el candidato/jefe de campaña: no solo el
 * porcentaje agregado, sino QUIÉN de tu equipo ya reportó y quién
 * no — para saber a quién llamarle, no solo "falta el 30%".
 */
router.get('/avance-estructura', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const casillas = await query(
    `SELECT c.id, s.numero as seccion_numero, c.numero as casilla_letra,
            u.nombre as representante_nombre, u.telefono as representante_telefono,
            c.confirmado_asistencia,
            rc.id as resultado_id, rc.capturado_en as hora_reporte
     FROM casillas c
     JOIN secciones s ON s.id = c.seccion_id
     LEFT JOIN usuarios u ON u.id = c.representante_id
     LEFT JOIN resultados_casilla rc ON rc.campana_id = c.campana_id AND rc.seccion_id = c.seccion_id AND rc.casilla = c.numero
     WHERE c.campana_id = $1
     ORDER BY (rc.id IS NULL) DESC, s.numero`,
    [campanaId]
  );

  const total = casillas.rows.length;
  const reportaron = casillas.rows.filter((c) => c.resultado_id).length;

  res.json({
    ok: true,
    data: {
      total, reportaron,
      porcentaje: total > 0 ? Math.round((reportaron / total) * 100) : 0,
      casillas: casillas.rows.map((c) => ({
        seccion_numero: c.seccion_numero,
        casilla_letra: c.casilla_letra,
        representante_nombre: c.representante_nombre,
        representante_telefono: c.representante_telefono,
        confirmado_asistencia: c.confirmado_asistencia,
        ya_reporto: !!c.resultado_id,
        hora_reporte: c.hora_reporte,
      })),
    },
  });
});

/**
 * POST /api/dia-eleccion/simular-eleccion
 * SOLO para campañas demo — genera resultados realistas para las
 * casillas que aún no tienen resultado, usando el histórico REAL de
 * cada sección (no números al azar), y los va "transmitiendo" uno
 * por uno con pequeños intervalos — para que al ver la pantalla de
 * Avance en vivo se vea exactamente como se vería una noche de
 * elección real, no como si todo apareciera de golpe.
 *
 * Solo altos mandos pueden dispararlo, y solo funciona en campañas
 * marcadas es_demo=true — nunca en una campaña real, sería gravísimo
 * inventar resultados electorales reales.
 */
router.post('/simular-eleccion', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden simular' });
  }
  const campanaRes = await query('SELECT es_demo, partido, tipo_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const campana = campanaRes.rows[0];
  if (!campana?.es_demo) {
    return res.status(403).json({ ok: false, error: 'El simulador solo está disponible en campañas demo — nunca se deben inventar resultados en una campaña real.' });
  }

  const pendientes = await query(
    `SELECT c.id, c.seccion_id, c.numero as casilla, s.numero as seccion_numero, s.lista_nominal
     FROM casillas c JOIN secciones s ON s.id = c.seccion_id
     WHERE c.campana_id=$1 AND NOT EXISTS (
       SELECT 1 FROM resultados_casilla rc WHERE rc.campana_id=c.campana_id AND rc.seccion_id=c.seccion_id AND rc.casilla=c.numero
     )`,
    [req.usuario.campana_id]
  );
  if (pendientes.rows.length === 0) {
    return res.json({ ok: true, mensaje: 'Todas las casillas ya tienen resultado — usa "Reiniciar simulación" primero.', total: 0 });
  }

  res.json({ ok: true, mensaje: `Simulación iniciada — ${pendientes.rows.length} casillas irán reportando en los próximos minutos.`, total: pendientes.rows.length });

  // A partir de aquí corre EN SEGUNDO PLANO — la respuesta HTTP ya se
  // mandó, esto sigue insertando resultados espaciados en el tiempo.
  const PARTIDOS = ['morena', 'pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac'];
  (async () => {
    for (const casilla of pendientes.rows) {
      // Espera entre 2 y 8 segundos entre cada casilla — se siente
      // vivo sin hacer esperar demasiado a quien está viendo la demo.
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 6000));

      // Usar el histórico REAL de esa sección para que los números
      // se sientan de verdad, no aleatorios sin sentido.
      const hist = await query(
        `SELECT partido, votos FROM resultados_historicos WHERE seccion_id=$1 AND tipo_eleccion=$2 ORDER BY anio DESC LIMIT 10`,
        [casilla.seccion_id, campana.tipo_eleccion]
      );
      const totalHist = hist.rows.reduce((s, r) => s + r.votos, 0);
      const PARTICIPACION_OBJETIVO = 0.53; // 53% del padrón, exacto — no aproximado
      const totalEmitidos = Math.round((casilla.lista_nominal || 700) * PARTICIPACION_OBJETIVO);
      const nulos = Math.round(totalEmitidos * (0.02 + Math.random() * 0.03)); // 2%-5% de nulos, normal en una elección real
      const totalParaPartidos = totalEmitidos - nulos; // el resto SÍ se reparte entre partidos, sin pasarse

      const votos = {};
      if (totalHist > 0) {
        // Se reparte con ruido natural, pero luego se AJUSTA para que
        // la suma cuadre exacto con totalParaPartidos — así 53% de
        // participación es el número real, no un promedio aproximado.
        const pesos = {};
        let sumaPesos = 0;
        hist.rows.forEach((r) => {
          const proporcion = r.votos / totalHist;
          const ruido = 0.85 + Math.random() * 0.3;
          pesos[r.partido] = proporcion * ruido;
          sumaPesos += pesos[r.partido];
        });
        let asignado = 0;
        const partidosOrdenados = Object.keys(pesos);
        partidosOrdenados.forEach((partido, idx) => {
          if (idx === partidosOrdenados.length - 1) {
            votos[partido] = totalParaPartidos - asignado; // el último se lleva el resto exacto, sin redondeos perdidos
          } else {
            const v = Math.round(totalParaPartidos * (pesos[partido] / sumaPesos));
            votos[partido] = v;
            asignado += v;
          }
        });
      } else {
        votos[campana.partido] = Math.round(totalParaPartidos * 0.4);
        votos.pan = Math.round(totalParaPartidos * 0.25);
        votos.pri = totalParaPartidos - votos[campana.partido] - votos.pan; // ajuste exacto también aquí
      }

      try {
        const resultado = await query(
          `INSERT INTO resultados_casilla (campana_id, seccion_id, casilla, votos, nulos, lista_nominal, capturado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (campana_id, seccion_id, casilla) DO NOTHING RETURNING *`,
          [req.usuario.campana_id, casilla.seccion_id, casilla.casilla, JSON.stringify(votos), nulos, casilla.lista_nominal, req.usuario.sub]
        );
        if (resultado.rows[0]) {
          getIo().to(`campana:${req.usuario.campana_id}`).emit('resultado_actualizado', {
            ...resultado.rows[0], seccion_numero: casilla.seccion_numero, capturado_por_nombre: '🤖 Simulación',
          });
        }
      } catch (e) {
        console.error('Error en simulación de casilla:', e.message);
      }
    }
    console.log(`✅ Simulación de elección completada para campaña ${req.usuario.campana_id}`);
  })();
});

/**
 * POST /api/dia-eleccion/reiniciar-simulacion
 * Borra todos los resultados capturados — para poder correr la
 * simulación varias veces y ver el sistema funcionando desde cero
 * cuantas veces haga falta.
 */
router.post('/reiniciar-simulacion', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden reiniciar' });
  }
  const campanaRes = await query('SELECT es_demo FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  if (!campanaRes.rows[0]?.es_demo) {
    return res.status(403).json({ ok: false, error: 'Solo disponible en campañas demo' });
  }
  await query('DELETE FROM resultados_casilla WHERE campana_id=$1', [req.usuario.campana_id]);
  getIo().to(`campana:${req.usuario.campana_id}`).emit('resultado_actualizado', { reinicio: true });
  res.json({ ok: true, mensaje: 'Resultados borrados — listo para simular de nuevo' });
});

export default router;

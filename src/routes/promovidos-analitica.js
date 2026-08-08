import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

async function territorioDeCampana(campanaId) {
  const r = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
  return r.rows[0];
}

function filtroTerritorioSQL(campana, alias = 's') {
  if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
    return { sql: `AND ${alias}.municipio_id = (SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$X)`, valor: campana.territorio_id };
  }
  if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
    return { sql: `AND ${alias}.distrito_local=$X`, valor: campana.territorio_id };
  }
  if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
    return { sql: `AND ${alias}.distrito_federal=$X`, valor: campana.territorio_id };
  }
  return { sql: '', valor: null };
}

/**
 * GET /api/promovidos-analitica/por-partido
 * Pestaña 1: cuántos promovidos hay declarados de cada partido, y
 * cuántos de ESOS ya están comprometidos con nosotros — el "potencial
 * dormido" real (no de afiliados, de tu propia base).
 */
router.get('/por-partido', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await territorioDeCampana(campanaId);

  const resultado = await query(
    `SELECT partido, COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos WHERE campana_id=$1 AND partido IS NOT NULL GROUP BY partido ORDER BY total DESC`,
    [campanaId]
  );

  const totalGeneral = resultado.rows.reduce((s, r) => s + parseInt(r.total), 0);
  const propios = resultado.rows.find((r) => r.partido === campana.partido);
  const oposicion = totalGeneral - (propios ? parseInt(propios.total) : 0);

  res.json({
    ok: true,
    data: {
      por_partido: resultado.rows,
      total_general: totalGeneral,
      total_propios: propios ? parseInt(propios.total) : 0,
      total_oposicion: oposicion,
      partido_campana: campana.partido,
    },
  });
});

/**
 * GET /api/promovidos-analitica/concentrado-mapa
 * El "de un vistazo" que el candidato necesita ver GRANDE, no
 * escondido en una pestaña — cuántos promovidos totales, por
 * partido, y cuántas secciones de tu territorio ya tienen cobertura.
 */
router.get('/concentrado-mapa', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await territorioDeCampana(campanaId);
  const campanaEstado = await query('SELECT estado_id FROM campanas WHERE id=$1', [campanaId]);
  const estadoId = campanaEstado.rows[0]?.estado_id || 29;

  const [porPartido, comprometidos, seccionesCubiertas, seccionesTotal] = await Promise.all([
    query(`SELECT partido, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND partido IS NOT NULL GROUP BY partido ORDER BY total DESC`, [campanaId]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido=true`, [campanaId]),
    query(`SELECT COUNT(DISTINCT seccion_id) as total FROM promovidos WHERE campana_id=$1 AND seccion_id IS NOT NULL`, [campanaId]),
    query(
      campana.territorio_tipo === 'municipio' && campana.territorio_id
        ? `SELECT COUNT(*) as total FROM secciones s WHERE s.municipio_id=(SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2)`
        : `SELECT COUNT(*) as total FROM secciones WHERE estado_id=$1`,
      campana.territorio_tipo === 'municipio' && campana.territorio_id ? [estadoId, campana.territorio_id] : [estadoId]
    ),
  ]);

  const totalPromovidos = porPartido.rows.reduce((s, r) => s + parseInt(r.total), 0);

  res.json({
    ok: true,
    data: {
      total_promovidos: totalPromovidos,
      total_comprometidos: parseInt(comprometidos.rows[0].total),
      secciones_cubiertas: parseInt(seccionesCubiertas.rows[0].total),
      secciones_total: parseInt(seccionesTotal.rows[0].total),
      por_partido: porPartido.rows,
      partido_campana: campana.partido,
    },
  });
});

/**
 * GET /api/promovidos-analitica/comparativa
 * Pestaña 2: Ayuntamiento 2024 vs Presidente de Comunidad 2024 —
 * las dos elecciones concurrentes reales que sí tenemos, comparadas.
 */
router.get('/comparativa', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await territorioDeCampana(campanaId);
  const filtro = filtroTerritorioSQL(campana, 's');
  const params = filtro.valor ? [filtro.valor] : [];
  const filtroSQL = filtro.sql.replace('$X', '$1');

  const traer = async (tipoEleccion) => {
    const r = await query(
      `SELECT r.partido, SUM(r.votos) as votos
       FROM resultados_historicos r JOIN secciones s ON s.id=r.seccion_id
       WHERE r.tipo_eleccion=$${params.length + 1} AND r.anio=2024 AND s.estado_id=29 ${filtroSQL}
       GROUP BY r.partido ORDER BY votos DESC`,
      [...params, tipoEleccion]
    );
    return r.rows;
  };

  const ayuntamiento = await traer('ayuntamiento');
  const presComunidad = await traer('pres_comunidad');

  const contarGanadas = async (tipoEleccion) => {
    const r = await query(
      `SELECT s.numero, r.partido, r.votos FROM resultados_historicos r
       JOIN secciones s ON s.id=r.seccion_id
       WHERE r.tipo_eleccion=$${params.length + 1} AND r.anio=2024 AND s.estado_id=29 ${filtroSQL}
       ORDER BY s.numero, r.votos DESC`,
      [...params, tipoEleccion]
    );
    const ganadorPorSeccion = {};
    r.rows.forEach((row) => { if (!ganadorPorSeccion[row.numero]) ganadorPorSeccion[row.numero] = row.partido; });
    const conteo = {};
    Object.values(ganadorPorSeccion).forEach((p) => { conteo[p] = (conteo[p] || 0) + 1; });
    return { conteo, total: Object.keys(ganadorPorSeccion).length };
  };

  const seccionesAyto = await contarGanadas('ayuntamiento');
  const seccionesPresCom = await contarGanadas('pres_comunidad');

  const votosPropiosAyto = ayuntamiento.find((r) => r.partido === campana.partido)?.votos || 0;
  const votosPropiosPresCom = presComunidad.find((r) => r.partido === campana.partido)?.votos || 0;

  res.json({
    ok: true,
    data: {
      ayuntamiento, pres_comunidad: presComunidad,
      secciones_ganadas: {
        ayuntamiento: seccionesAyto.conteo[campana.partido] || 0,
        ayuntamiento_total: seccionesAyto.total,
        pres_comunidad: seccionesPresCom.conteo[campana.partido] || 0,
        pres_comunidad_total: seccionesPresCom.total,
      },
      votos_propios: { ayuntamiento: parseInt(votosPropiosAyto), pres_comunidad: parseInt(votosPropiosPresCom) },
      brecha: parseInt(votosPropiosAyto) - parseInt(votosPropiosPresCom),
      partido_campana: campana.partido,
    },
  });
});

/**
 * GET /api/promovidos-analitica/voto-diferenciado
 * Pestaña 3: secciones donde la gente votó DISTINTO entre
 * Ayuntamiento y Pdte. de Comunidad — dato real, no depende de
 * afiliados ni padrón.
 */
router.get('/voto-diferenciado', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await territorioDeCampana(campanaId);
  const filtro = filtroTerritorioSQL(campana, 's');
  const params = filtro.valor ? [filtro.valor] : [];
  const filtroSQL = filtro.sql.replace('$X', '$1');

  const r = await query(
    `SELECT s.numero, r.tipo_eleccion, r.partido, r.votos FROM resultados_historicos r
     JOIN secciones s ON s.id=r.seccion_id
     WHERE r.anio=2024 AND r.tipo_eleccion IN ('ayuntamiento','pres_comunidad') AND s.estado_id=29 ${filtroSQL}
     ORDER BY s.numero, r.tipo_eleccion, r.votos DESC`,
    params
  );

  const porSeccion = {};
  r.rows.forEach((row) => {
    if (!porSeccion[row.numero]) porSeccion[row.numero] = {};
    if (!porSeccion[row.numero][row.tipo_eleccion]) porSeccion[row.numero][row.tipo_eleccion] = row.partido;
  });

  const diferenciado = [];
  const consistente = [];
  Object.entries(porSeccion).forEach(([numero, datos]) => {
    if (!datos.ayuntamiento || !datos.pres_comunidad) return;
    if (datos.ayuntamiento !== datos.pres_comunidad) {
      diferenciado.push({ seccion: parseInt(numero), gano_ayuntamiento: datos.ayuntamiento, gano_pres_comunidad: datos.pres_comunidad });
    } else {
      consistente.push(parseInt(numero));
    }
  });

  res.json({
    ok: true,
    data: {
      secciones_diferenciado: diferenciado.sort((a, b) => a.seccion - b.seccion),
      total_diferenciado: diferenciado.length,
      total_consistente: consistente.length,
      total_comparables: diferenciado.length + consistente.length,
      partido_campana: campana.partido,
    },
  });
});

/**
 * GET /api/promovidos-analitica/oportunidad
 * Pestaña 4: pirámide de oportunidad + ranking de secciones más
 * recuperables — reutiliza el Motor de Priorización.
 */
router.get('/oportunidad', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await territorioDeCampana(campanaId);

  const promosRes = await query(
    `SELECT clasificacion, COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos WHERE campana_id=$1 GROUP BY clasificacion`,
    [campanaId]
  );
  const promos = { base: 0, persuadible: 0, adversario: 0 };
  let totalComprometidos = 0;
  promosRes.rows.forEach((r) => { promos[r.clasificacion] = parseInt(r.total); totalComprometidos += parseInt(r.comprometidos); });
  const totalPromovidos = promos.base + promos.persuadible + promos.adversario;

  const metaRes = await query('SELECT meta_votos FROM campanas WHERE id=$1', [campanaId]);
  const listaNominalRes = await query(
    `SELECT COALESCE(SUM(s.lista_nominal),0) as total FROM secciones s WHERE s.estado_id=29
     ${campana.territorio_tipo === 'municipio' && campana.territorio_id ? 'AND s.municipio_id=(SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$1)' : ''}`,
    campana.territorio_tipo === 'municipio' && campana.territorio_id ? [campana.territorio_id] : []
  );
  const metaVotos = metaRes.rows[0]?.meta_votos || Math.round((listaNominalRes.rows[0]?.total || 0) * 0.35);

  const filtro = filtroTerritorioSQL(campana, 's');
  const params = filtro.valor ? [filtro.valor] : [];
  const filtroSQL = filtro.sql.replace('$X', '$1');

  const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
  const anio = anioRes.rows[0]?.anio;

  let secciones = [];
  if (anio) {
    const hist = await query(
      `SELECT s.numero, r.partido, r.votos FROM resultados_historicos r
       JOIN secciones s ON s.id=r.seccion_id
       WHERE r.tipo_eleccion=$${params.length + 1} AND r.anio=$${params.length + 2} AND s.estado_id=29 ${filtroSQL}`,
      [...params, campana.tipo_eleccion, anio]
    );
    const porSeccion = {};
    hist.rows.forEach((r) => {
      if (!porSeccion[r.numero]) porSeccion[r.numero] = {};
      porSeccion[r.numero][r.partido] = r.votos;
    });

    const promosPorSeccionRes = await query(
      `SELECT s.numero, COUNT(*) as total FROM promovidos p JOIN secciones s ON s.id=p.seccion_id
       WHERE p.campana_id=$1 AND p.clasificacion IN ('base','persuadible') GROUP BY s.numero`,
      [campanaId]
    );
    const promosPorSeccion = Object.fromEntries(promosPorSeccionRes.rows.map((r) => [r.numero, parseInt(r.total)]));

    Object.entries(porSeccion).forEach(([numero, votos]) => {
      const total = Object.values(votos).reduce((a, b) => a + b, 0);
      if (total === 0) return;
      const votosPartido = votos[campana.partido] || 0;
      const ganador = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (ganador === campana.partido) return;
      const necesarios = Math.floor(total / 2) + 1;
      const deficit = necesarios - votosPartido - ((promosPorSeccion[numero] || 0) * 0.65);
      if (deficit > 300) return;
      const promotoresNecesarios = Math.ceil(Math.max(0, deficit) / 0.65 / 10);
      secciones.push({
        seccion: parseInt(numero), votos_propios: votosPartido, deficit: Math.round(Math.max(0, deficit)),
        promotores_necesarios: Math.max(1, promotoresNecesarios),
        prioridad: deficit <= 30 ? 'urgente' : deficit <= 100 ? 'alta' : 'media',
      });
    });
    secciones.sort((a, b) => a.deficit - b.deficit);
  }

  res.json({
    ok: true,
    data: {
      total_promovidos: totalPromovidos,
      total_comprometidos: totalComprometidos,
      meta_votos: metaVotos,
      piramide: [
        { etiqueta: 'Promovidos totales', valor: totalPromovidos, pct: 100 },
        { etiqueta: 'Comprometidos', valor: totalComprometidos, pct: totalPromovidos > 0 ? +((totalComprometidos / totalPromovidos) * 100).toFixed(1) : 0 },
        { etiqueta: 'Meta 2027', valor: metaVotos, pct: metaVotos > 0 ? +((totalComprometidos / metaVotos) * 100).toFixed(1) : 0 },
      ],
      secciones_recuperables: secciones.slice(0, 10),
    },
  });
});

/**
 * GET /api/promovidos-analitica/segmentacion
 * Desglose de TUS promovidos (no del INE — eso no se puede) por
 * género, rango de edad y sección — con lo que el propio equipo va
 * capturando en campo. Entre más completa la captura, más útil esto.
 */
router.get('/segmentacion', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const [porGenero, porEdad, conDatos, sinDatos] = await Promise.all([
    query(`SELECT genero, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND genero IS NOT NULL GROUP BY genero`, [campanaId]),
    query(`SELECT rango_edad, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND rango_edad IS NOT NULL GROUP BY rango_edad ORDER BY rango_edad`, [campanaId]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND (genero IS NOT NULL OR rango_edad IS NOT NULL)`, [campanaId]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1`, [campanaId]),
  ]);

  // Cruce género x sección — para detectar, por ejemplo, "en la
  // sección 12 casi no hemos hablado con mujeres", útil para decidir
  // qué tipo de reunión organizar y con quién.
  const cruce = await query(
    `SELECT s.numero as seccion, p.genero, COUNT(*) as total
     FROM promovidos p JOIN secciones s ON s.id=p.seccion_id
     WHERE p.campana_id=$1 AND p.genero IS NOT NULL
     GROUP BY s.numero, p.genero ORDER BY s.numero`,
    [campanaId]
  );

  res.json({
    ok: true,
    data: {
      total_con_segmentacion: parseInt(conDatos.rows[0].total),
      total_promovidos: parseInt(sinDatos.rows[0].total),
      por_genero: porGenero.rows,
      por_edad: porEdad.rows,
      cruce_seccion_genero: cruce.rows,
    },
  });
});

export default router;

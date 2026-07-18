import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// Reutilizamos la tabla contactos + promovidos para calcular reportes de
// campo reales (contactados, comprometidos) en vez de una tabla aparte
// que se pueda desincronizar de la realidad — así el reporte SIEMPRE
// refleja lo que de verdad se registró ese día, no un número aparte
// que alguien tuvo que escribir a mano.

/**
 * GET /api/reportes/diario
 * Actividad real del día de hoy (o de la fecha que se pida) por
 * cada promotor de la campaña — contactos + promovidos nuevos.
 */
router.get('/diario', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);

  const resultado = await query(
    `SELECT u.id as usuario_id, u.nombre,
       COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en::date = $2) as promovidos_nuevos,
       COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en::date = $2 AND p.comprometido) as comprometidos_nuevos,
       COUNT(DISTINCT c.id) FILTER (WHERE c.creado_en::date = $2) as contactos_hechos
     FROM usuarios u
     LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id = $1
     LEFT JOIN contactos c ON c.usuario_id = u.id AND c.campana_id = $1
     WHERE u.campana_id = $1 AND u.rol = 'promotor'
     GROUP BY u.id, u.nombre
     ORDER BY promovidos_nuevos DESC`,
    [req.usuario.campana_id, fecha]
  );

  res.json({ ok: true, data: resultado.rows, fecha });
});

/**
 * GET /api/reportes/tendencia
 * Actividad de los últimos 14 días — para ver si el ritmo de la
 * campaña va subiendo o bajando.
 */
router.get('/tendencia', async (req, res) => {
  const resultado = await query(
    `SELECT creado_en::date as fecha, COUNT(*) as promovidos,
            COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos
     WHERE campana_id = $1 AND creado_en > now() - interval '14 days'
     GROUP BY creado_en::date ORDER BY fecha`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/reportes/estadisticas
 * Análisis histórico agregado de TODO el territorio de la campaña:
 * participación promedio, distribución de competitividad, y el
 * desglose de partidos sumando todas las secciones — la foto
 * completa, no sección por sección.
 */
router.get('/estadisticas', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  try {
    const campanaRes = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id FROM campanas WHERE id=$1', [campanaId]);
    const campana = campanaRes.rows[0];

    let filtroTerritorio = '';
    const paramsTerr = [];
    if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
      filtroTerritorio = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$1)';
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_local = $1';
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_federal = $1';
      paramsTerr.push(campana.territorio_id);
    }

    const seccionesRes = await query(`SELECT s.id, s.numero, s.lista_nominal FROM secciones s WHERE s.estado_id=29 ${filtroTerritorio}`, paramsTerr);
    const seccionIds = seccionesRes.rows.map((s) => s.id);
    const listaNominalTotal = seccionesRes.rows.reduce((s, r) => s + (r.lista_nominal || 0), 0);

    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;

    let votosPorPartido = {}, totalVotosGeneral = 0;
    let distribucion = { arrasador: 0, comodo: 0, cerrado: 0, empate: 0 }; // margen de victoria por sección
    let participacionPorSeccion = [];

    if (anio && seccionIds.length > 0) {
      const hist = await query(
        `SELECT seccion_id, partido, votos FROM resultados_historicos WHERE tipo_eleccion=$1 AND anio=$2 AND seccion_id = ANY($3)`,
        [campana.tipo_eleccion, anio, seccionIds]
      );
      const porSeccion = {};
      hist.rows.forEach((r) => {
        votosPorPartido[r.partido] = (votosPorPartido[r.partido] || 0) + r.votos;
        totalVotosGeneral += r.votos;
        if (!porSeccion[r.seccion_id]) porSeccion[r.seccion_id] = {};
        porSeccion[r.seccion_id][r.partido] = r.votos;
      });

      seccionesRes.rows.forEach((s) => {
        const votos = porSeccion[s.id];
        if (!votos) return;
        const total = Object.values(votos).reduce((a, b) => a + b, 0);
        if (total === 0) return;
        const ordenados = Object.values(votos).sort((a, b) => b - a);
        const margen = ordenados.length > 1 ? ((ordenados[0] - ordenados[1]) / total) * 100 : 100;
        if (margen > 30) distribucion.arrasador++;
        else if (margen > 15) distribucion.comodo++;
        else if (margen > 5) distribucion.cerrado++;
        else distribucion.empate++;

        if (s.lista_nominal > 0) participacionPorSeccion.push((total / s.lista_nominal) * 100);
      });
    }

    const participacionPromedio = participacionPorSeccion.length > 0
      ? +(participacionPorSeccion.reduce((a, b) => a + b, 0) / participacionPorSeccion.length).toFixed(1)
      : null;

    // Promovidos por partido declarado (para comparar intención actual vs histórico)
    const promosPartidoRes = await query(
      `SELECT partido, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND partido IS NOT NULL GROUP BY partido`,
      [campanaId]
    );

    // 📊 COMPARACIÓN 2024 → PROYECCIÓN 2027: toma el resultado histórico
    // real y le suma/resta lo que tus promovidos actuales representan,
    // para estimar hacia dónde va cada partido si la tendencia se sostiene.
    const CONVERSION = 0.65;
    const promosPorPartidoClasif = await query(
      `SELECT partido, clasificacion, COUNT(*) as total FROM promovidos
       WHERE campana_id=$1 AND partido IS NOT NULL GROUP BY partido, clasificacion`,
      [campanaId]
    );
    const gananciaPorPartido = {}; // votos estimados que cada partido suma por promovidos "base" propios
    promosPorPartidoClasif.rows.forEach((r) => {
      if (r.clasificacion === 'base') {
        gananciaPorPartido[r.partido] = (gananciaPorPartido[r.partido] || 0) + parseInt(r.total) * CONVERSION;
      }
    });
    // Los persuadibles capturados por TU partido cuentan como ganancia tuya
    const persuadiblesPropios = promosPorPartidoClasif.rows
      .filter((r) => r.clasificacion === 'persuadible' && r.partido === campana.partido)
      .reduce((s, r) => s + parseInt(r.total), 0);

    const proyeccion2027 = {};
    Object.entries(votosPorPartido).forEach(([p, v]) => { proyeccion2027[p] = v; });
    Object.entries(gananciaPorPartido).forEach(([p, ganancia]) => {
      proyeccion2027[p] = (proyeccion2027[p] || 0) + ganancia;
    });
    if (campana.partido) {
      proyeccion2027[campana.partido] = (proyeccion2027[campana.partido] || 0) + persuadiblesPropios * CONVERSION;
    }

    res.json({
      ok: true,
      data: {
        anio_historico: anio,
        total_secciones: seccionesRes.rows.length,
        lista_nominal_total: listaNominalTotal,
        participacion_promedio: participacionPromedio,
        votos_por_partido: votosPorPartido,
        total_votos_historico: totalVotosGeneral,
        distribucion_competitividad: distribucion,
        promovidos_por_partido: Object.fromEntries(promosPartidoRes.rows.map((r) => [r.partido, parseInt(r.total)])),
        partido_campana: campana.partido,
        proyeccion_2027: proyeccion2027,
      },
    });
  } catch (e) {
    console.error('Error en estadísticas:', e);
    res.status(500).json({ ok: false, error: 'Error al calcular estadísticas' });
  }
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
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
      filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)`;
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_local = $1';
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_federal = $1';
      paramsTerr.push(campana.territorio_id);
    }

    const seccionesRes = await query(`SELECT s.id, s.numero, s.lista_nominal FROM secciones s WHERE s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`, paramsTerr);
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

/**
 * Genera un número aleatorio con distribución normal (Box-Muller) —
 * usado para simular la incertidumbre de la tasa de conversión de
 * promovidos a votos reales.
 */
function aleatorioNormal(media, desviacion) {
  let u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return media + desviacion * z;
}

/**
 * Intervalo de confianza de Wilson (mejor que la fórmula normal
 * simple cuando la muestra no es enorme) — para no dar una cifra
 * falsamente precisa como "53% de apoyo" sin su margen de error real.
 */
function intervaloWilson(exitos, n, z = 1.96) {
  if (n === 0) return { centro: null, inferior: null, superior: null };
  const pHat = exitos / n;
  const centro = (pHat + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const margen = (z * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return {
    centro: +(centro * 100).toFixed(1),
    inferior: +(Math.max(0, centro - margen) * 100).toFixed(1),
    superior: +(Math.min(1, centro + margen) * 100).toFixed(1),
  };
}

/**
 * GET /api/reportes/probabilidad
 * Estadística real, con sus límites reconocidos:
 * 1) Intervalo de confianza (Wilson) sobre qué % de tus promovidos
 *    son de tu partido — ADVERTENCIA: no es una encuesta aleatoria,
 *    es tu propia base de contactos, sesgada hacia tu simpatizantes.
 * 2) Simulación Monte Carlo (10,000 corridas) de votos el día D,
 *    usando bootstrap no-paramétrico sobre la variación real
 *    sección-por-sección entre Ayuntamiento y Pdte. Comunidad 2024
 *    (mismo día, mismo electorado) como muestra empírica de cuánto
 *    puede moverse el resultado entre una boleta y otra.
 */

/**
 * GET /api/reportes/ficha-estado
 * La foto completa del ESTADO, no solo tu municipio/distrito — para
 * dar contexto de dónde queda tu territorio dentro del panorama
 * general. Histórico agregado + tu avance actual como campaña.
 */
router.get('/ficha-estado', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const estadoId = req.usuario.estado_id;

  const campanaRes = await query('SELECT partido, tipo_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  const [totales, aniosDisponibles, promovidosPropios] = await Promise.all([
    query(`SELECT COUNT(*) as secciones, COUNT(DISTINCT municipio_id) as municipios, SUM(lista_nominal) as lista_nominal FROM secciones WHERE estado_id=$1`, [estadoId]),
    query(`SELECT DISTINCT anio FROM resultados_historicos WHERE tipo_eleccion=$1 ORDER BY anio DESC`, [campana.tipo_eleccion]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1`, [campanaId]),
  ]);

  const anioReciente = aniosDisponibles.rows[0]?.anio;
  let historico = null;
  if (anioReciente) {
    const votosEstado = await query(
      `SELECT rh.partido, SUM(rh.votos) as votos
       FROM resultados_historicos rh JOIN secciones s ON s.id=rh.seccion_id
       WHERE s.estado_id=$1 AND rh.tipo_eleccion=$2 AND rh.anio=$3
       GROUP BY rh.partido ORDER BY votos DESC`,
      [estadoId, campana.tipo_eleccion, anioReciente]
    );
    const totalVotos = votosEstado.rows.reduce((s, r) => s + parseInt(r.votos), 0);
    historico = {
      anio: anioReciente,
      total_votos: totalVotos,
      por_partido: votosEstado.rows.map((r) => ({ partido: r.partido, votos: parseInt(r.votos), pct: totalVotos > 0 ? +((r.votos / totalVotos) * 100).toFixed(1) : 0 })),
      anios_disponibles: aniosDisponibles.rows.map((r) => r.anio),
    };
  }

  res.json({
    ok: true,
    data: {
      total_secciones: parseInt(totales.rows[0].secciones),
      total_municipios: parseInt(totales.rows[0].municipios),
      lista_nominal_estado: parseInt(totales.rows[0].lista_nominal || 0),
      tipo_eleccion: campana.tipo_eleccion,
      partido_campana: campana.partido,
      historico,
      tus_promovidos_totales: parseInt(promovidosPropios.rows[0].total),
    },
  });
});

/**
 * GET /api/reportes/agregados/:tipo
 * Fichas técnicas de Senadurías, Diputación Federal, y Diputación
 * Local — resultados por distrito/estado 2024, no por sección (esos
 * cargos no se reportan a nivel sección de la misma forma que
 * Ayuntamiento/Pdte. Comunidad).
 */
router.get('/agregados/:tipo', async (req, res) => {
  const resultado = await query(
    `SELECT * FROM resultados_agregados WHERE estado_id=$1 AND tipo_eleccion=$2 ORDER BY anio DESC, nivel, distrito_numero NULLS FIRST, votos DESC NULLS LAST, porcentaje DESC NULLS LAST`,
    [req.usuario.estado_id, req.params.tipo]
  );
  if (resultado.rows.length === 0) {
    return res.json({ ok: true, data: { disponible: false } });
  }

  const porNivel = {};
  resultado.rows.forEach((r) => {
    const clave = r.nivel === 'estado' ? 'estado' : `${r.nivel}_${r.distrito_numero}`;
    if (!porNivel[clave]) porNivel[clave] = { nivel: r.nivel, distrito_numero: r.distrito_numero, distrito_cabecera: r.distrito_cabecera, resultados: [] };
    porNivel[clave].resultados.push(r);
  });

  res.json({ ok: true, data: { disponible: true, anio: resultado.rows[0].anio, grupos: Object.values(porNivel) } });
});

router.get('/probabilidad', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  try {
    // ── 1. INTERVALO DE CONFIANZA sobre promovidos ──
    const promosRes = await query(`SELECT partido, comprometido FROM promovidos WHERE campana_id=$1 AND partido IS NOT NULL`, [campanaId]);
    const totalPromos = promosRes.rows.length;
    const propiosPromos = promosRes.rows.filter((p) => p.partido === campana.partido).length;
    const ic = intervaloWilson(propiosPromos, totalPromos);

    // ── 2. MUESTRA EMPÍRICA DE VARIACIÓN (bootstrap) ──
    let filtroTerritorio = '';
    const paramsTerr = [];
    if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
      filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)`;
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_local=$1'; paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_federal=$1'; paramsTerr.push(campana.territorio_id);
    }

    // MEJOR CASO: comparar el MISMO tipo de elección entre dos años
    // reales (ej. Ayuntamiento 2021 vs 2024) — esto es swing temporal
    // de verdad, la cantidad que realmente interesa proyectar, no un
    // sustituto entre boletas distintas del mismo día.
    const aniosDisponibles = await query(
      `SELECT DISTINCT anio FROM resultados_historicos WHERE tipo_eleccion=$1 ORDER BY anio`,
      [campana.tipo_eleccion]
    );
    const swingsObservados = [];
    let metodoBootstrap = 'sin_datos';

    if (aniosDisponibles.rows.length >= 2) {
      const anioViejo = aniosDisponibles.rows[0].anio;
      const anioNuevo = aniosDisponibles.rows[aniosDisponibles.rows.length - 1].anio;
      // filtroTerritorio trae su parámetro codificado como $1 (pensado
      // para cuando es el único filtro extra) — aquí van 3 parámetros
      // ANTES (tipo, año viejo, año nuevo), así que hace falta una
      // versión con el índice corrido a $4, o el filtro terminaría
      // comparando el territorio contra el tipo de elección por error.
      const filtroTerritorioCorrido = filtroTerritorio.replace('$1', '$4');
      const datosDosAnios = await query(
        `SELECT s.numero, r.anio, r.partido, r.votos FROM resultados_historicos r
         JOIN secciones s ON s.id=r.seccion_id
         WHERE r.tipo_eleccion=$1 AND r.anio IN ($2,$3) AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorioCorrido}`,
        [campana.tipo_eleccion, anioViejo, anioNuevo, ...paramsTerr]
      );
      const porSeccionAnios = {};
      datosDosAnios.rows.forEach((r) => {
        if (!porSeccionAnios[r.numero]) porSeccionAnios[r.numero] = { viejo: {}, nuevo: {} };
        porSeccionAnios[r.numero][r.anio === anioViejo ? 'viejo' : 'nuevo'][r.partido] = r.votos;
      });
      Object.values(porSeccionAnios).forEach((d) => {
        const totalViejo = Object.values(d.viejo).reduce((a, b) => a + b, 0);
        const totalNuevo = Object.values(d.nuevo).reduce((a, b) => a + b, 0);
        if (totalViejo === 0 || totalNuevo === 0) return;
        const shareViejo = (d.viejo[campana.partido] || 0) / totalViejo;
        const shareNuevo = (d.nuevo[campana.partido] || 0) / totalNuevo;
        swingsObservados.push(shareNuevo - shareViejo);
      });
      if (swingsObservados.length >= 5) metodoBootstrap = `temporal_${anioViejo}_${anioNuevo}`;
    }

    // RESPALDO: si no hay dos años del mismo tipo, comparar boletas
    // distintas del mismo día más reciente (mejor que nada, pero
    // menos preciso que un swing temporal real).
    if (metodoBootstrap === 'sin_datos') {
      const datosMismoDia = await query(
        `SELECT s.numero, r.tipo_eleccion, r.partido, r.votos FROM resultados_historicos r
         JOIN secciones s ON s.id=r.seccion_id
         WHERE r.anio=2024 AND r.tipo_eleccion IN ('ayuntamiento','pres_comunidad') AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`,
        paramsTerr
      );
      const porSeccion = {};
      datosMismoDia.rows.forEach((r) => {
        if (!porSeccion[r.numero]) porSeccion[r.numero] = { ayuntamiento: {}, pres_comunidad: {} };
        porSeccion[r.numero][r.tipo_eleccion][r.partido] = r.votos;
      });
      Object.values(porSeccion).forEach((d) => {
        const totalA = Object.values(d.ayuntamiento).reduce((a, b) => a + b, 0);
        const totalP = Object.values(d.pres_comunidad).reduce((a, b) => a + b, 0);
        if (totalA === 0 || totalP === 0) return;
        const shareA = (d.ayuntamiento[campana.partido] || 0) / totalA;
        const shareP = (d.pres_comunidad[campana.partido] || 0) / totalP;
        swingsObservados.push(shareP - shareA);
      });
      if (swingsObservados.length >= 5) metodoBootstrap = 'mismo_dia_2024';
    }

    const usandoSupuestoPorFaltaDeDatos = swingsObservados.length < 5;

    // ── Base histórica para la simulación: el tipo de elección real de tu campaña ──
    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;

    if (!anio) {
    res.json({
      ok: true,
      data: {
        intervalo_confianza: ic,
        total_promovidos_muestra: totalPromos,
        muestra_suficiente: totalPromos >= 30,
        interpretacion_ic: totalPromos === 0
          ? 'Aún no hay promovidos con partido declarado para calcular esto.'
          : totalPromos < 30
          ? `Con solo ${totalPromos} promovidos, el margen de error es muy amplio (${ic.superior - ic.inferior} puntos porcentuales) — necesitas al menos 30 para que este número empiece a ser confiable, e idealmente 100+ para que sea realmente útil.`
          : `Con ${ic.superior - ic.inferior > 15 ? 'bastante' : 'razonable'} confianza estadística, entre el ${ic.inferior}% y el ${ic.superior}% de la gente que tu equipo contacta se identifica con tu partido. Recuerda: esto refleja a quién CONTACTA tu equipo, no necesariamente a todo el electorado.`,
        simulacion_disponible: false,
        mensaje: 'Sin datos históricos cargados para tu tipo de elección — no se puede simular la proyección de votos todavía.',
      },
    });
    return;
  }

    const historico = await query(
      `SELECT s.numero, r.partido, r.votos FROM resultados_historicos r
       JOIN secciones s ON s.id=r.seccion_id
       WHERE r.tipo_eleccion=$${paramsTerr.length + 1} AND r.anio=$${paramsTerr.length + 2} AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`,
      [...paramsTerr, campana.tipo_eleccion, anio]
    );
    const votosPorPartido = {};
    historico.rows.forEach((r) => { votosPorPartido[r.partido] = (votosPorPartido[r.partido] || 0) + r.votos; });
    const totalVotosHist = Object.values(votosPorPartido).reduce((a, b) => a + b, 0);
    const votosPropiosHist = votosPorPartido[campana.partido] || 0;
    const oponentePrincipal = Object.entries(votosPorPartido).filter(([p]) => p !== campana.partido).sort((a, b) => b[1] - a[1])[0];
    const votosOponenteHist = oponentePrincipal ? oponentePrincipal[1] : 0;

    // ── Promovidos "base" (compromiso fuerte) como aporte de organización territorial ──
    const promosBaseRes = await query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND clasificacion='base'`, [campanaId]);
    const promosBase = parseInt(promosBaseRes.rows[0].total);

    const diasRestantes = campana.fecha_eleccion ? Math.max(1, Math.ceil((new Date(campana.fecha_eleccion) - new Date()) / 86400000)) : 300;
    const promosHoyRes = await query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND creado_en > now() - interval '14 days'`, [campanaId]);
    const ritmoDiario = parseInt(promosHoyRes.rows[0].total) / 14;
    const proyeccionPromosBase = promosBase + ritmoDiario * diasRestantes * 0.4; // solo 40% del ritmo se asume que llega a "base" real

    // ── SIMULACIÓN MONTE CARLO (10,000 corridas) ──
    const N = 10000;
    let ganadas = 0;
    const resultadosSimulados = [];
    for (let i = 0; i < N; i++) {
      const swing = usandoSupuestoPorFaltaDeDatos
        ? aleatorioNormal(0, 0.06) // supuesto conservador: ±6% de volatilidad típica
        : swingsObservados[Math.floor(Math.random() * swingsObservados.length)]; // bootstrap real
      const conversion = Math.min(1, Math.max(0, aleatorioNormal(0.6, 0.15)));

      const shareBase = totalVotosHist > 0 ? votosPropiosHist / totalVotosHist : 0.3;
      const shareSimulado = Math.min(0.95, Math.max(0.02, shareBase + swing));
      const votosPorTendencia = shareSimulado * totalVotosHist;
      const votosPorOrganizacion = proyeccionPromosBase * conversion;
      const votosPropiosSimulados = votosPorTendencia + votosPorOrganizacion * 0.5; // 50% para no duplicar con la tendencia

      const votosOponenteSimulados = votosOponenteHist * (1 + aleatorioNormal(0, 0.05));

      if (votosPropiosSimulados > votosOponenteSimulados) ganadas++;
      resultadosSimulados.push(Math.round(votosPropiosSimulados));
    }
    resultadosSimulados.sort((a, b) => a - b);
    const percentil = (p) => resultadosSimulados[Math.floor(N * p)];

    res.json({
      ok: true,
      data: {
        intervalo_confianza: ic,
        total_promovidos_muestra: totalPromos,
        muestra_suficiente: totalPromos >= 30,
        interpretacion_ic: totalPromos === 0
          ? 'Aún no hay promovidos con partido declarado para calcular esto.'
          : totalPromos < 30
          ? `Con solo ${totalPromos} promovidos, el margen de error es muy amplio — necesitas al menos 30 para que este número empiece a ser confiable, e idealmente 100+ para que sea realmente útil.`
          : `Entre el ${ic.inferior}% y el ${ic.superior}% de la gente que tu equipo contacta se identifica con tu partido. Recuerda: esto refleja a quién CONTACTA tu equipo, no a todo el electorado.`,
        simulacion_disponible: true,
        probabilidad_triunfo: +((ganadas / N) * 100).toFixed(1),
        interpretacion_probabilidad: (() => {
          const p = +((ganadas / N) * 100).toFixed(1);
          if (p >= 70) return `De cada 100 escenarios posibles simulados, ganas en ${Math.round(p)} de ellos — vas en una posición sólida, pero ningún escenario es 100%, sigue trabajando el territorio.`;
          if (p >= 50) return `Vas ligeramente adelante: ganas en poco más de la mitad de los escenarios simulados. Es una elección competitiva, cualquier descuido puede voltear el resultado.`;
          if (p >= 30) return `Vas abajo, pero no fuera de la contienda: en ${Math.round(p)} de cada 100 escenarios simulados logras ganar. Necesitas acelerar el ritmo de organización territorial.`;
          return `Con la tendencia y organización actuales, el escenario es difícil (${Math.round(p)}% de los escenarios simulados). Esto no es una sentencia — es una señal de que hace falta un cambio de estrategia o de ritmo, mientras más pronto mejor.`;
        })(),
        proyeccion_votos: { p10: percentil(0.10), p50: percentil(0.50), p90: percentil(0.90) },
        votos_oponente_referencia: Math.round(votosOponenteHist),
        metodologia: {
          bootstrap_real: !usandoSupuestoPorFaltaDeDatos,
          metodo_bootstrap: metodoBootstrap,
          metodo_bootstrap_descripcion: metodoBootstrap.startsWith('temporal_')
            ? `Comparación real entre ${metodoBootstrap.split('_')[1]} y ${metodoBootstrap.split('_')[2]} (mismo tipo de elección, dos años reales)`
            : metodoBootstrap === 'mismo_dia_2024'
            ? 'Comparación entre Ayuntamiento y Pdte. Comunidad 2024 (mismo día, sin un segundo año de este tipo de elección todavía)'
            : 'Supuesto conservador de ±6% de volatilidad (sin datos suficientes)',
          secciones_usadas_bootstrap: swingsObservados.length,
          corridas_simuladas: N,
          promovidos_base_actuales: promosBase,
          promovidos_base_proyectados_dia_d: Math.round(proyeccionPromosBase),
          dias_restantes: diasRestantes,
        },
      },
    });
  } catch (e) {
    console.error('Error en probabilidad:', e);
    res.status(500).json({ ok: false, error: 'Error al calcular la proyección estadística' });
  }
});

/**
 * GET /api/reportes/regresion-cobertura
 * ¿Las secciones con más promotores realmente generan más
 * promovidos? Regresión lineal simple (paramétrica) + R² para saber
 * qué tanto explica esa relación (y no solo asumirlo).
 */
router.get('/regresion-cobertura', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const datos = await query(
    `SELECT s.numero,
            COUNT(DISTINCT z.usuario_id) as promotores_asignados,
            COUNT(DISTINCT p.id) as promovidos_generados
     FROM secciones s
     LEFT JOIN zonas_asignadas z ON z.seccion_id = s.id AND z.campana_id=$1
     LEFT JOIN promovidos p ON p.seccion_id = s.id AND p.campana_id=$1
     WHERE s.estado_id=${req.usuario.estado_id} AND (z.campana_id=$1 OR p.campana_id=$1)
     GROUP BY s.numero
     HAVING COUNT(DISTINCT z.usuario_id) > 0 OR COUNT(DISTINCT p.id) > 0`,
    [campanaId]
  );

  const puntos = datos.rows.map((r) => ({ x: parseInt(r.promotores_asignados), y: parseInt(r.promovidos_generados) }));
  const n = puntos.length;

  if (n < 5) {
    return res.json({
      ok: true,
      data: { suficientes_datos: false, secciones_disponibles: n,
        mensaje: `Solo hay ${n} secciones con datos de cobertura — se necesitan mínimo 5 (idealmente 15+) para que una regresión tenga algún sentido estadístico. Asigna promotores a más secciones desde el modo Sectorización del mapa.` },
    });
  }

  // Si NADIE tiene promotores asignados vía Sectorización, la
  // regresión no tiene ningún sentido matemático (no hay variación
  // en X) — hay que decirlo claramente, no fingir un resultado.
  const sinVarianzaX = puntos.every((p) => p.x === puntos[0].x);
  if (sinVarianzaX) {
    return res.json({
      ok: true,
      data: { suficientes_datos: false, secciones_disponibles: n,
        mensaje: `Todavía nadie tiene promotores asignados por sección vía el modo Sectorización del mapa — sin esa variación no hay nada que medir. Asigna zonas a tus coordinadores/promotores primero.` },
    });
  }

  // Regresión lineal simple: y = a + bx, por mínimos cuadrados
  const sumX = puntos.reduce((s, p) => s + p.x, 0);
  const sumY = puntos.reduce((s, p) => s + p.y, 0);
  const sumXY = puntos.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = puntos.reduce((s, p) => s + p.x * p.x, 0);
  const medioX = sumX / n, medioY = sumY / n;

  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const a = medioY - b * medioX;

  // R² — qué tanto explica el modelo
  const sumYY = puntos.reduce((s, p) => s + p.y * p.y, 0);
  const ssTot = puntos.reduce((s, p) => s + Math.pow(p.y - medioY, 2), 0);
  const ssRes = puntos.reduce((s, p) => s + Math.pow(p.y - (a + b * p.x), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  res.json({
    ok: true,
    data: {
      suficientes_datos: true,
      secciones_analizadas: n,
      pendiente: +b.toFixed(2),
      intercepto: +a.toFixed(2),
      r_cuadrada: +r2.toFixed(3),
      puntos,
      interpretacion: b <= 0
        ? 'En tus datos actuales, más promotores asignados NO se traduce en más promovidos — puede ser que estén mal distribuidos, no estén trabajando activamente, o que el modelo aún tenga muy pocos datos para verse claro.'
        : `Por cada promotor adicional asignado a una sección, tu equipo genera en promedio ${b.toFixed(1)} promovidos más. ${
            r2 > 0.5 ? `Esta relación explica el ${Math.round(r2 * 100)}% de la variación entre secciones — es una relación fuerte, vale la pena seguir asignando gente con este criterio.`
            : r2 > 0.2 ? `Esta relación solo explica el ${Math.round(r2 * 100)}% de la variación — hay otros factores (calidad del promotor, tipo de sección) pesando más que solo la cantidad de gente.`
            : `Esta relación explica muy poco (${Math.round(r2 * 100)}%) de la variación — la cantidad de promotores por sí sola no predice bien cuántos promovidos saldrán; probablemente importa más QUIÉN está en cada sección que CUÁNTOS.`
          }`,
    },
  });
});

/**
 * GET /api/reportes/prueba-ritmo
 * Prueba de hipótesis (t de Student, una muestra): ¿tu ritmo diario
 * real de los últimos 14 días es estadísticamente distinto (mejor o
 * peor) del ritmo que necesitas para llegar a tu meta?
 */
router.get('/prueba-ritmo', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT meta_votos, fecha_eleccion, territorio_tipo, territorio_id FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  const diario = await query(
    `SELECT date_trunc('day', creado_en) as dia, COUNT(*) as total
     FROM promovidos WHERE campana_id=$1 AND creado_en > now() - interval '14 days'
     GROUP BY dia ORDER BY dia`,
    [campanaId]
  );

  // Rellenar días sin actividad como 0 — si no, el promedio se ve
  // artificialmente alto al ignorar los días vacíos.
  const conteosPorDia = {};
  diario.rows.forEach((r) => { conteosPorDia[r.dia.toISOString().slice(0, 10)] = parseInt(r.total); });
  const muestra = [];
  for (let i = 13; i >= 0; i--) {
    const fecha = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    muestra.push(conteosPorDia[fecha] || 0);
  }

  const n = muestra.length;
  const media = muestra.reduce((a, b) => a + b, 0) / n;
  const varianza = muestra.reduce((s, x) => s + Math.pow(x - media, 2), 0) / (n - 1);
  const desviacion = Math.sqrt(varianza);
  const errorEstandar = desviacion / Math.sqrt(n);

  const listaNominalRes = await query(
    `SELECT COALESCE(SUM(s.lista_nominal),0) as total FROM secciones s WHERE s.estado_id=${req.usuario.estado_id}
     ${campana.territorio_tipo === 'municipio' && campana.territorio_id ? `AND s.municipio_id=(SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)` : ''}`,
    campana.territorio_tipo === 'municipio' && campana.territorio_id ? [campana.territorio_id] : []
  );
  const metaVotos = campana.meta_votos || Math.round((listaNominalRes.rows[0]?.total || 0) * 0.35);
  const diasRestantes = campana.fecha_eleccion ? Math.max(1, Math.ceil((new Date(campana.fecha_eleccion) - new Date()) / 86400000)) : 300;

  const totalComprometidosRes = await query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido`, [campanaId]);
  const faltantes = Math.max(0, metaVotos - parseInt(totalComprometidosRes.rows[0].total));
  const ritmoNecesario = faltantes / diasRestantes;

  // Estadístico t de una muestra: (media - valor_hipotetico) / error_estandar
  const t = errorEstandar > 0 ? (media - ritmoNecesario) / errorEstandar : 0;

  // Aproximación simple del valor p de dos colas usando la distribución
  // t con n-1 grados de libertad — para n=14 (13 g.l.) esto es una
  // aproximación razonable sin necesitar una librería estadística externa.
  const valorP = 2 * (1 - aproximarCDFNormalEstandar(Math.abs(t)));

  res.json({
    ok: true,
    data: {
      ritmo_real_promedio: +media.toFixed(1),
      ritmo_necesario: +ritmoNecesario.toFixed(1),
      desviacion_estandar: +desviacion.toFixed(2),
      estadistico_t: +t.toFixed(2),
      valor_p: +valorP.toFixed(3),
      significativo: valorP < 0.05,
      dias_analizados: n,
      interpretacion: n < 7
        ? 'Con menos de 7 días de historial, esta prueba todavía no es confiable — espera a tener al menos 2 semanas de actividad registrada.'
        : valorP >= 0.05
        ? `No hay diferencia estadísticamente significativa entre tu ritmo real (${media.toFixed(1)} promovidos/día) y el necesario (${ritmoNecesario.toFixed(1)}/día) — con la variabilidad normal de tu equipo, van más o menos a la par. Pequeños empujones pueden inclinar la balanza.`
        : media > ritmoNecesario
        ? `Tu ritmo real (${media.toFixed(1)}/día) es significativamente MAYOR al necesario (${ritmoNecesario.toFixed(1)}/día) — con 95% de confianza, no es casualidad, tu equipo está genuinamente por encima del ritmo requerido.`
        : `Tu ritmo real (${media.toFixed(1)}/día) es significativamente MENOR al necesario (${ritmoNecesario.toFixed(1)}/día) — con 95% de confianza, esto no es variabilidad normal, hay un problema real de ritmo que hay que corregir.`,
    },
  });
});

/**
 * GET /api/reportes/camino-triunfo
 * ¿Con cuántas secciones adicionales ganadas llegas al total de
 * votos que necesitas? Usa el ranking de secciones más recuperables
 * (de más fácil a más difícil) y suma hasta llegar a la meta.
 */
router.get('/camino-triunfo', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  let filtroTerritorio = '';
  const paramsTerr = [];
  if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
    filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)`;
    paramsTerr.push(campana.territorio_id);
  } else if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
    filtroTerritorio = 'AND s.distrito_local=$1'; paramsTerr.push(campana.territorio_id);
  } else if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
    filtroTerritorio = 'AND s.distrito_federal=$1'; paramsTerr.push(campana.territorio_id);
  }

  const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
  const anio = anioRes.rows[0]?.anio;
  if (!anio) return res.json({ ok: true, data: { disponible: false, mensaje: 'Sin datos históricos para tu tipo de elección.' } });

  const hist = await query(
    `SELECT s.numero, r.partido, r.votos FROM resultados_historicos r
     JOIN secciones s ON s.id=r.seccion_id
     WHERE r.tipo_eleccion=$${paramsTerr.length + 1} AND r.anio=$${paramsTerr.length + 2} AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`,
    [...paramsTerr, campana.tipo_eleccion, anio]
  );
  const porSeccion = {};
  hist.rows.forEach((r) => { if (!porSeccion[r.numero]) porSeccion[r.numero] = {}; porSeccion[r.numero][r.partido] = r.votos; });

  let totalSecciones = 0, seccionesGanadas = 0, votosPropiosTotal = 0, votosTotalesGeneral = 0;
  const perdidas = [];
  Object.entries(porSeccion).forEach(([numero, votos]) => {
    const total = Object.values(votos).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    totalSecciones++;
    votosTotalesGeneral += total;
    const propios = votos[campana.partido] || 0;
    votosPropiosTotal += propios;
    const ganador = Object.entries(votos).sort((a, b) => b[1] - a[1])[0][0];
    if (ganador === campana.partido) { seccionesGanadas++; return; }
    perdidas.push({ seccion: parseInt(numero), deficit: Math.floor(total / 2) + 1 - propios, votos_totales_seccion: total });
  });

  perdidas.sort((a, b) => a.deficit - b.deficit);
  const votosNecesariosTotal = Math.floor(votosTotalesGeneral / 2) + 1 - votosPropiosTotal;

  let acumulado = 0, seccionesNecesarias = 0;
  for (const p of perdidas) {
    if (acumulado >= votosNecesariosTotal) break;
    acumulado += p.deficit;
    seccionesNecesarias++;
  }

  res.json({
    ok: true,
    data: {
      disponible: true,
      total_secciones: totalSecciones,
      secciones_ganadas_hoy: seccionesGanadas,
      secciones_necesarias_adicionales: seccionesNecesarias,
      votos_necesarios_total: Math.max(0, votosNecesariosTotal),
      interpretacion: votosNecesariosTotal <= 0
        ? `Con los resultados históricos, ya vas ganando en votos totales — el reto ahora es CONSERVAR esa ventaja, no remontarla.`
        : `Hoy ganas en ${seccionesGanadas} de ${totalSecciones} secciones. Si ordenas tu esfuerzo hacia las secciones más fáciles de voltear primero, con ${seccionesNecesarias} secciones adicionales ganadas llegarías al total de votos que necesitas para el triunfo — no hace falta ganar TODAS las secciones, solo las suficientes.`,
      top_secciones_camino: perdidas.slice(0, seccionesNecesarias || 5),
    },
  });
});

/**
 * Aproximación de la función de distribución acumulada de la normal
 * estándar (suficiente para valores-p aproximados sin depender de
 * una librería estadística externa).
 */
function aproximarCDFNormalEstandar(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - prob;
}

/**
 * GET /api/reportes/actividad-resumen
 * KPIs generales de actividad de campo — la "foto de hoy" del
 * esfuerzo de todo el equipo.
 */
router.get('/actividad-resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const promosRes = await query(
    `SELECT p.comprometido, p.creado_en, p.registrado_por, s.numero as seccion_numero
     FROM promovidos p LEFT JOIN secciones s ON s.id=p.seccion_id
     WHERE p.campana_id=$1`,
    [campanaId]
  );
  const totalReportes = promosRes.rows.length;
  const contactados = totalReportes; // cada promovido registrado = una persona contactada
  const comprometidos = promosRes.rows.filter((p) => p.comprometido).length;
  const seccionesUnicas = new Set(promosRes.rows.filter((p) => p.seccion_numero).map((p) => p.seccion_numero));

  // Actividad por tipo — usando clasificación como proxy de "tipo de contacto"
  const clasRes = await query(`SELECT clasificacion, COUNT(*) as total FROM promovidos WHERE campana_id=$1 GROUP BY clasificacion`, [campanaId]);

  // Últimos 7 días
  const ultimos7 = [];
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const total = promosRes.rows.filter((p) => p.creado_en?.toISOString().slice(0, 10) === fecha).length;
    ultimos7.push({ fecha, total });
  }

  const promotoresRes = await query(
    `SELECT u.id, u.nombre, COUNT(p.id) as total_promovidos, MAX(p.creado_en) as ultima_actividad
     FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
     WHERE u.campana_id=$1 AND u.rol='promotor' AND u.activo != false
     GROUP BY u.id, u.nombre HAVING COUNT(p.id) > 0 ORDER BY total_promovidos DESC`,
    [campanaId]
  );

  res.json({
    ok: true,
    data: {
      total_reportes: totalReportes,
      personas_contactadas: contactados,
      comprometidos,
      pct_comprometidos: totalReportes > 0 ? +((comprometidos / totalReportes) * 100).toFixed(1) : 0,
      secciones_cubiertas: seccionesUnicas.size,
      actividades_por_tipo: Object.fromEntries(clasRes.rows.map((r) => [r.clasificacion, parseInt(r.total)])),
      ultimos_7_dias: ultimos7,
      promotores_activos: promotoresRes.rows.length,
      promotores: promotoresRes.rows.slice(0, 10),
    },
  });
});

/**
 * GET /api/reportes/actividad-por-promotor
 * Desglose individual — quién ha hecho qué.
 */
router.get('/actividad-por-promotor', async (req, res) => {
  const resultado = await query(
    `SELECT u.id, u.nombre, u.puesto,
            COUNT(p.id) as total_promovidos,
            COUNT(p.id) FILTER (WHERE p.comprometido) as comprometidos,
            COUNT(p.id) FILTER (WHERE p.creado_en > now() - interval '7 days') as ultimos_7_dias,
            MAX(p.creado_en) as ultima_actividad
     FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
     WHERE u.campana_id=$1 AND u.rol='promotor'
     GROUP BY u.id, u.nombre, u.puesto ORDER BY total_promovidos DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/reportes/actividad-por-seccion
 * Desglose territorial — dónde se está trabajando y dónde no.
 */
router.get('/actividad-por-seccion', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero as seccion_numero,
            COUNT(p.id) as total_promovidos,
            COUNT(p.id) FILTER (WHERE p.comprometido) as comprometidos,
            COUNT(DISTINCT p.registrado_por) as promotores_activos
     FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id=$1
     GROUP BY s.numero ORDER BY total_promovidos DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/reportes/cierre-campana-pdf
 * Resumen ejecutivo completo de toda la operación — para el
 * candidato, en un solo documento descargable.
 */
router.get('/cierre-campana-pdf', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  try {
    const campanaRes = await query('SELECT nombre_candidato, partido, tipo_eleccion, meta_votos, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
    const campana = campanaRes.rows[0];

    const promosRes = await query(
      `SELECT clasificacion, COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos FROM promovidos WHERE campana_id=$1 GROUP BY clasificacion`,
      [campanaId]
    );
    const promos = { base: 0, persuadible: 0, adversario: 0 };
    let totalComprometidos = 0;
    promosRes.rows.forEach((r) => { promos[r.clasificacion] = parseInt(r.total); totalComprometidos += parseInt(r.comprometidos); });
    const totalPromovidos = promos.base + promos.persuadible + promos.adversario;

    const estructuraRes = await query(
      `SELECT rol, COUNT(*) as total FROM usuarios WHERE campana_id=$1 AND activo != false GROUP BY rol`,
      [campanaId]
    );

    const seccionesRes = await query(
      `SELECT COUNT(DISTINCT seccion_id) as total FROM promovidos WHERE campana_id=$1 AND seccion_id IS NOT NULL`,
      [campanaId]
    );

    const gastoRes = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
    const campanaTope = await query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [campanaId]);

    const activosRes = await query(`SELECT tipo, COUNT(*) as total FROM activos WHERE campana_id=$1 GROUP BY tipo`, [campanaId]);
    const incidenciasRes = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1`, [campanaId]);

    // ── Generar el PDF — reutiliza el mismo membrete que todos los demás reportes ──
    const doc = iniciarPDF(
      res,
      `reporte_cierre_${new Date().toISOString().slice(0, 10)}.pdf`,
      'Reporte de Cierre de Campaña',
      `${campana.nombre_candidato} · ${campana.partido?.toUpperCase()} · ${campana.tipo_eleccion}`,
      req.usuario.nombre
    );

    const seccion = (titulo) => { doc.moveDown(0.5); doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e1b4b').text(titulo); doc.moveDown(0.3); doc.fontSize(10).font('Helvetica').fillColor('#334155'); };
    const linea = (etiqueta, valor) => doc.text(`${etiqueta}: ${valor}`);

    seccion('Avance Electoral');
    linea('Meta de votos', campana.meta_votos?.toLocaleString() || 'No configurada');
    linea('Promovidos totales', totalPromovidos.toLocaleString());
    linea('Comprometidos a votar', totalComprometidos.toLocaleString());
    linea('Base (voto seguro)', promos.base.toLocaleString());
    linea('Persuadibles', promos.persuadible.toLocaleString());
    linea('Secciones con presencia', seccionesRes.rows[0].total);

    seccion('Estructura de Campaña');
    estructuraRes.rows.forEach((r) => linea(r.rol, r.total));

    seccion('Activos de Campaña');
    if (activosRes.rows.length === 0) doc.text('Sin activos registrados');
    activosRes.rows.forEach((r) => linea(r.tipo, r.total));

    seccion('Finanzas');
    const tope = campanaTope.rows[0]?.tope_gasto_ople;
    linea('Gasto total', `$${parseFloat(gastoRes.rows[0].total).toLocaleString('es-MX')} MXN`);
    if (tope) linea('% del tope OPLE usado', `${Math.round((gastoRes.rows[0].total / tope) * 100)}%`);

    seccion('Incidencias');
    linea('Total reportadas', incidenciasRes.rows[0].total);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').text('Documento generado automáticamente por VotoTech — uso interno de campaña.', { align: 'center' });

    doc.end();
  } catch (e) {
    console.error('Error generando PDF de cierre:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar el reporte' });
  }
});

/**
 * GET /api/reportes/encuestas-resumen
 * Concentrado de todas las encuestas — cuántas respuestas por
 * sección y por municipio, para ver de un vistazo dónde se está
 * escuchando más a la gente y dónde falta.
 */
router.get('/encuestas-resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const encuestasRes = await query(
    `SELECT id, titulo, (SELECT COUNT(*) FROM encuesta_respuestas WHERE encuesta_id=encuestas.id) as total_respuestas
     FROM encuestas WHERE campana_id=$1 ORDER BY creado_en DESC`,
    [campanaId]
  );

  const porSeccion = await query(
    `SELECT s.numero as seccion_numero, m.nombre as municipio, COUNT(r.id) as total
     FROM encuesta_respuestas r
     JOIN encuestas e ON e.id = r.encuesta_id
     LEFT JOIN secciones s ON s.id = r.seccion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     WHERE e.campana_id=$1 AND s.numero IS NOT NULL
     GROUP BY s.numero, m.nombre ORDER BY total DESC`,
    [campanaId]
  );

  const porMunicipio = await query(
    `SELECT m.nombre as municipio, COUNT(r.id) as total
     FROM encuesta_respuestas r
     JOIN encuestas e ON e.id = r.encuesta_id
     LEFT JOIN secciones s ON s.id = r.seccion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     WHERE e.campana_id=$1 AND m.nombre IS NOT NULL
     GROUP BY m.nombre ORDER BY total DESC`,
    [campanaId]
  );

  const totalGeneral = encuestasRes.rows.reduce((s, e) => s + parseInt(e.total_respuestas), 0);

  res.json({
    ok: true,
    data: {
      total_encuestas: encuestasRes.rows.length,
      total_respuestas: totalGeneral,
      encuestas: encuestasRes.rows,
      por_seccion: porSeccion.rows.slice(0, 15),
      por_municipio: porMunicipio.rows,
    },
  });
});

/**
 * Encabezado compartido para todos los reportes PDF — ahora con
 * membrete real (no solo texto centrado) y quién lo descargó, para
 * que un PDF que circule por WhatsApp se pueda rastrear a quién se
 * le dio originalmente.
 */
function iniciarPDF(res, nombreArchivo, titulo, subtitulo, descargadoPor) {
  const doc = new PDFDocument({ margin: 50, size: 'letter' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
  doc.pipe(res);

  // ── MEMBRETE ── franja superior de color + marca, no solo texto suelto
  doc.rect(0, 0, doc.page.width, 8).fill('#1e1b4b');
  doc.fillColor('#1e1b4b').fontSize(16).font('Helvetica-Bold').text('🗳️  VOTOTECH', 50, 28, { continued: false });
  doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text('Plataforma Digital de Gestión Electoral', 50, 48);
  doc.moveTo(50, 66).lineTo(doc.page.width - 50, 66).lineWidth(1.5).strokeColor('#e2e8f0').stroke();

  doc.moveDown(1.2);
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e1b4b').text(titulo, { align: 'center' });
  if (subtitulo) doc.fontSize(10).font('Helvetica').fillColor('#4338ca').text(subtitulo, { align: 'center' });
  doc.fontSize(8).fillColor('#94a3b8').text(`Generado el ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} a las ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });
  if (descargadoPor) {
    doc.fontSize(8).fillColor('#94a3b8').text(`Descargado por: ${descargadoPor}`, { align: 'center' });
  }
  doc.moveDown(1.5);
  return doc;
}
const seccionPDF = (doc, titulo) => { doc.moveDown(0.5); doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e1b4b').text(titulo); doc.moveDown(0.3); doc.fontSize(10).font('Helvetica').fillColor('#334155'); };
const lineaPDF = (doc, etiqueta, valor) => doc.text(`${etiqueta}: ${valor}`);
// Para párrafos de verdad (descripciones largas) — texto justificado,
// se ve más formal/ejecutivo que el default alineado a la izquierda.
const parrafoPDF = (doc, texto, opts = {}) => doc.font('Helvetica').fontSize(9).fillColor('#334155').text(texto, { align: 'justify', ...opts });

/**
 * GET /api/reportes/pdf/juridico
 */
router.get('/pdf/juridico', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT nombre_candidato FROM campanas WHERE id=$1', [campanaId]);
  const plazos = await query('SELECT * FROM calendario_electoral WHERE campana_id=$1 ORDER BY fecha', [campanaId]);
  const quejas = await query('SELECT * FROM quejas_recursos WHERE campana_id=$1 ORDER BY creado_en DESC', [campanaId]);

  const doc = iniciarPDF(res, 'reporte_juridico.pdf', 'Reporte Juridico de Campana', campanaRes.rows[0]?.nombre_candidato, req.usuario.nombre);

  seccionPDF(doc, 'Calendario Electoral');
  if (plazos.rows.length === 0) doc.text('Sin plazos registrados');
  plazos.rows.forEach((p) => lineaPDF(doc, new Date(p.fecha).toLocaleDateString('es-MX'), `${p.titulo} (${p.cumplido ? 'Cumplido' : 'Pendiente'})`));

  seccionPDF(doc, `Quejas y Recursos (${quejas.rows.length} en total)`);
  if (quejas.rows.length === 0) doc.text('Sin quejas ni recursos registrados');
  quejas.rows.forEach((q) => {
    doc.font('Helvetica-Bold').text(`${q.tipo.toUpperCase()} ante ${q.autoridad.toUpperCase()} - ${q.estado}`);
    doc.font('Helvetica').fontSize(9).text(q.descripcion, { indent: 15, align: 'justify' });
    doc.fontSize(10).moveDown(0.3);
  });

  doc.end();
});

/**
 * GET /api/reportes/pdf/estructura
 */
router.get('/pdf/estructura', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT nombre_candidato FROM campanas WHERE id=$1', [campanaId]);
  const miembros = await query(
    `SELECT nombre, rol, puesto, (SELECT COUNT(*) FROM usuarios h WHERE h.parent_id=u.id) as reportes_directos
     FROM usuarios u WHERE u.campana_id=$1 AND u.activo != false ORDER BY
     CASE rol WHEN 'candidato' THEN 1 WHEN 'jefe_campana' THEN 2 WHEN 'coord_general' THEN 3
       WHEN 'coord_distrital' THEN 4 WHEN 'coord_municipal' THEN 5 WHEN 'coord_seccional' THEN 6 ELSE 7 END`,
    [campanaId]
  );
  const porRol = await query('SELECT rol, COUNT(*) as total FROM usuarios WHERE campana_id=$1 AND activo != false GROUP BY rol', [campanaId]);

  const doc = iniciarPDF(res, 'reporte_estructura.pdf', 'Reporte de Estructura de Campana', campanaRes.rows[0]?.nombre_candidato, req.usuario.nombre);

  seccionPDF(doc, 'Resumen por Nivel');
  porRol.rows.forEach((r) => lineaPDF(doc, r.rol, r.total));

  seccionPDF(doc, `Directorio Completo (${miembros.rows.length} personas)`);
  miembros.rows.forEach((m) => lineaPDF(doc, m.nombre, `${m.puesto || m.rol} - ${m.reportes_directos} a cargo`));

  doc.end();
});

/**
 * GET /api/reportes/pdf/incidencias
 */
router.get('/pdf/incidencias', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT nombre_candidato FROM campanas WHERE id=$1', [campanaId]);
  const incidencias = await query(
    `SELECT i.*, s.numero as seccion_numero FROM incidencias i LEFT JOIN secciones s ON s.id=i.seccion_id
     WHERE i.campana_id=$1 ORDER BY i.creado_en DESC`,
    [campanaId]
  );
  const porTipo = await query('SELECT tipo, COUNT(*) as total FROM incidencias WHERE campana_id=$1 GROUP BY tipo', [campanaId]);

  const doc = iniciarPDF(res, 'reporte_incidencias.pdf', 'Reporte de Incidencias de Campana', campanaRes.rows[0]?.nombre_candidato, req.usuario.nombre);

  seccionPDF(doc, 'Resumen por Tipo');
  porTipo.rows.forEach((r) => lineaPDF(doc, r.tipo, r.total));

  seccionPDF(doc, `Detalle (${incidencias.rows.length} incidencias)`);
  incidencias.rows.forEach((i) => {
    doc.font('Helvetica-Bold').text(`${i.tipo} - ${i.urgencia} - ${i.estado}${i.seccion_numero ? ` (Seccion ${i.seccion_numero})` : ''}`);
    doc.font('Helvetica').fontSize(9).text(i.descripcion, { indent: 15, align: 'justify' });
    doc.fontSize(10).moveDown(0.3);
  });

  doc.end();
});

/**
 * GET /api/reportes/pdf/encuestas
 */
router.get('/pdf/encuestas', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT nombre_candidato FROM campanas WHERE id=$1', [campanaId]);
  const encuestas = await query(
    `SELECT id, titulo, (SELECT COUNT(*) FROM encuesta_respuestas WHERE encuesta_id=encuestas.id) as total_respuestas
     FROM encuestas WHERE campana_id=$1 ORDER BY creado_en DESC`,
    [campanaId]
  );
  const porMunicipio = await query(
    `SELECT m.nombre as municipio, COUNT(r.id) as total
     FROM encuesta_respuestas r JOIN encuestas e ON e.id=r.encuesta_id
     LEFT JOIN secciones s ON s.id=r.seccion_id LEFT JOIN municipios m ON m.id=s.municipio_id
     WHERE e.campana_id=$1 AND m.nombre IS NOT NULL GROUP BY m.nombre ORDER BY total DESC`,
    [campanaId]
  );

  const doc = iniciarPDF(res, 'reporte_encuestas.pdf', 'Reporte Concentrado de Encuestas', campanaRes.rows[0]?.nombre_candidato, req.usuario.nombre);

  seccionPDF(doc, 'Encuestas Activas');
  if (encuestas.rows.length === 0) doc.text('Sin encuestas registradas');
  encuestas.rows.forEach((e) => lineaPDF(doc, e.titulo, `${e.total_respuestas} respuestas`));

  seccionPDF(doc, 'Respuestas por Municipio');
  if (porMunicipio.rows.length === 0) doc.text('Sin respuestas con ubicacion registrada todavia');
  porMunicipio.rows.forEach((m) => lineaPDF(doc, m.municipio, m.total));

  doc.end();
});

/**
 * GET /api/reportes/resumen-ejecutivo-pdf
 * La versión imprimible/compartible del Resumen Ejecutivo — para
 * mandarla por WhatsApp a alguien que no tiene acceso al sistema,
 * o llevarla impresa a una reunión con el candidato.
 */
router.get('/resumen-ejecutivo-pdf', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT nombre_candidato, partido FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  const [promovidosTotal, comprometidos, actividad7dias, promotoresActivos] = await Promise.all([
    query('SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1', [campanaId]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido=true`, [campanaId]),
    query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND creado_en >= now() - interval '7 days'`, [campanaId]),
    query(`SELECT COUNT(DISTINCT registrado_por) as total FROM promovidos WHERE campana_id=$1 AND creado_en >= now() - interval '7 days'`, [campanaId]),
  ]);

  const totalProm = parseInt(promovidosTotal.rows[0].total);
  const totalComp = parseInt(comprometidos.rows[0].total);
  const pctComp = totalProm > 0 ? Math.round((totalComp / totalProm) * 100) : 0;

  const doc = iniciarPDF(res, 'resumen_ejecutivo.pdf', 'Resumen Ejecutivo de Campaña', campana?.nombre_candidato, req.usuario.nombre);

  seccionPDF(doc, 'Los números que importan');
  lineaPDF(doc, 'Promovidos totales', totalProm);
  lineaPDF(doc, 'Comprometidos a votar', `${totalComp} (${pctComp}%)`);
  lineaPDF(doc, 'Promovidos en los últimos 7 días', parseInt(actividad7dias.rows[0].total));
  lineaPDF(doc, 'Promotores activos esta semana', parseInt(promotoresActivos.rows[0].total));

  seccionPDF(doc, 'Semáforo de campaña');
  const semaforo = (ok, texto) => { doc.fontSize(10).fillColor(ok ? '#059669' : '#dc2626').text(`${ok ? '🟢' : '🔴'} ${texto}`); doc.moveDown(0.3); };
  semaforo(totalProm >= 30, `Muestra estadística: ${totalProm} de 30 mínimo`);
  semaforo(parseInt(promotoresActivos.rows[0].total) > 0, 'Actividad de promotores esta semana');
  semaforo(pctComp >= 30, `Tasa de compromiso: ${pctComp}%`);
  semaforo(parseInt(actividad7dias.rows[0].total) > 0, 'Captación reciente de promovidos');

  doc.end();
});

/**
 * GET /api/reportes/motor-riesgos
 * Detecta automáticamente 4 tipos de riesgo, sin que nadie tenga
 * que ir a buscarlos a mano:
 * 1. Operadores que se están "apagando" — dejaron de tener actividad
 * 2. Municipios/secciones con poca cobertura de promovidos
 * 3. Gente que no está llegando a su meta diaria
 * 4. Territorio sin NADIE asignado todavía
 */
router.get('/motor-riesgos', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  // 1. Operadores apagándose — tenían actividad y ya no, o nunca
  //    han entrado desde que se les dio de alta hace más de 5 días.
  const operadoresRiesgo = await query(
    `SELECT id, nombre, rol, puesto, ultimo_acceso, creado_en
     FROM usuarios
     WHERE campana_id=$1 AND activo=true AND aprobado=true AND rol NOT IN ('candidato')
       AND (
         (ultimo_acceso IS NOT NULL AND ultimo_acceso < now() - interval '5 days')
         OR (ultimo_acceso IS NULL AND creado_en < now() - interval '5 days')
       )
     ORDER BY COALESCE(ultimo_acceso, creado_en) ASC
     LIMIT 15`,
    [campanaId]
  );

  // 2. Metas incumplidas — gente con meta_diaria puesta, pero su
  //    ritmo real de promovidos capturados está muy por debajo.
  const metasIncumplidas = await query(
    `SELECT u.id, u.nombre, u.rol, u.meta_diaria,
            COUNT(p.id) FILTER (WHERE p.creado_en >= now() - interval '7 days') as promovidos_7dias
     FROM usuarios u
     LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
     WHERE u.campana_id=$1 AND u.activo=true AND u.aprobado=true AND u.meta_diaria > 0
     GROUP BY u.id, u.nombre, u.rol, u.meta_diaria
     HAVING COUNT(p.id) FILTER (WHERE p.creado_en >= now() - interval '7 days') < u.meta_diaria * 7 * 0.5
     ORDER BY u.meta_diaria DESC
     LIMIT 15`,
    [campanaId]
  );

  // 3. Municipios con baja cobertura — pocos promovidos respecto al
  //    tamaño real de su lista nominal.
  const coberturaBaja = await query(
    `SELECT m.nombre as municipio, SUM(s.lista_nominal) as lista_nominal, COUNT(DISTINCT pr.id) as promovidos
     FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     LEFT JOIN promovidos pr ON pr.seccion_id = s.id AND pr.campana_id=$1
     WHERE s.estado_id=$2
     GROUP BY m.id, m.nombre
     HAVING SUM(s.lista_nominal) > 0
     ORDER BY (COUNT(DISTINCT pr.id)::float / NULLIF(SUM(s.lista_nominal),0)) ASC
     LIMIT 8`,
    [campanaId, req.usuario.estado_id]
  );

  // 4. Territorio sin nadie asignado — secciones prioritarias (según
  //    Priorización) que no tienen ningún coordinador ni promotor.
  const sinEstructura = await query(
    `SELECT s.numero as seccion, s.municipio_id, m.nombre as municipio
     FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     WHERE s.estado_id=$1
       AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.campana_id=$2 AND u.territorio_tipo='seccion' AND u.territorio_id=s.numero)
     LIMIT 10`,
    [req.usuario.estado_id, campanaId]
  );

  res.json({
    ok: true,
    data: {
      operadores_riesgo: operadoresRiesgo.rows.map((o) => ({
        ...o,
        dias_inactivo: Math.floor((Date.now() - new Date(o.ultimo_acceso || o.creado_en)) / 86400000),
      })),
      metas_incumplidas: metasIncumplidas.rows,
      cobertura_baja: coberturaBaja.rows.map((c) => ({
        ...c,
        pct_cobertura: c.lista_nominal > 0 ? +((c.promovidos / c.lista_nominal) * 100).toFixed(2) : 0,
      })),
      sin_estructura: sinEstructura.rows,
      total_riesgos: operadoresRiesgo.rows.length + metasIncumplidas.rows.length + sinEstructura.rows.length,
    },
  });
});

/**
 * GET /api/reportes/ficha-territorio/:tipo/:numero
 * tipo: 'distrito_federal' | 'distrito_local' | 'municipio'
 * La ficha completa de UN distrito o municipio específico — para
 * cuando lo seleccionas en el mapa: cuántas secciones tiene, su
 * lista nominal total, y el resultado histórico si existe (los
 * distritos federales ya tienen datos reales de 2024 cargados).
 */
router.get('/ficha-territorio/:tipo/:numero', async (req, res) => {
  const { tipo, numero } = req.params;
  const estadoId = req.usuario.estado_id;

  // Senaduría es a nivel ESTATAL completo, no por distrito/municipio
  // — se resuelve aparte, reusando los resultados agregados 2024.
  if (tipo === 'senaduria') {
    const [totales, resultados] = await Promise.all([
      query('SELECT COUNT(*) as secciones, COUNT(DISTINCT municipio_id) as municipios, SUM(lista_nominal) as lista_nominal FROM secciones WHERE estado_id=$1', [estadoId]),
      query(`SELECT partido, candidato, votos, porcentaje, gano FROM resultados_agregados WHERE estado_id=$1 AND tipo_eleccion='senaduria' AND nivel='estado' ORDER BY votos DESC`, [estadoId]),
    ]);
    return res.json({
      ok: true,
      data: {
        existe: resultados.rows.length > 0,
        tipo: 'senaduria', numero: null, nombre_municipio: null,
        total_secciones: parseInt(totales.rows[0].secciones),
        total_lista_nominal: parseInt(totales.rows[0].lista_nominal) || 0,
        municipios_incluidos: parseInt(totales.rows[0].municipios),
        historico: resultados.rows.length > 0 ? { anio: 2024, cabecera: 'Todo el estado', resultados: resultados.rows } : null,
      },
    });
  }

  let secciones;
  if (tipo === 'distrito_federal') {
    secciones = await query('SELECT id, numero, lista_nominal, municipio_id FROM secciones WHERE estado_id=$1 AND distrito_federal=$2', [estadoId, numero]);
  } else if (tipo === 'distrito_local') {
    secciones = await query('SELECT id, numero, lista_nominal, municipio_id FROM secciones WHERE estado_id=$1 AND distrito_local=$2', [estadoId, numero]);
  } else if (tipo === 'municipio') {
    const muni = await query('SELECT id, nombre FROM municipios WHERE estado_id=$1 AND clave_ine=$2', [estadoId, numero]);
    if (!muni.rows[0]) return res.status(404).json({ ok: false, error: 'Municipio no encontrado' });
    secciones = await query('SELECT id, numero, lista_nominal FROM secciones WHERE municipio_id=$1', [muni.rows[0].id]);
    secciones.nombreMunicipio = muni.rows[0].nombre;
  } else {
    return res.status(400).json({ ok: false, error: 'Tipo de territorio no reconocido' });
  }

  if (secciones.rows.length === 0) {
    return res.json({ ok: true, data: { existe: false } });
  }

  const totalListaNominal = secciones.rows.reduce((s, r) => s + (r.lista_nominal || 0), 0);
  const municipiosUnicos = tipo !== 'municipio' ? new Set(secciones.rows.map((r) => r.municipio_id)).size : 1;

  // Si es distrito federal, ya tenemos resultados reales 2024 cargados
  let historico = null;
  if (tipo === 'distrito_federal') {
    const r = await query(
      `SELECT partido, candidato, votos, porcentaje, gano, distrito_cabecera
       FROM resultados_agregados WHERE estado_id=$1 AND tipo_eleccion='dip_federal' AND nivel='distrito_federal' AND distrito_numero=$2
       ORDER BY votos DESC`,
      [estadoId, numero]
    );
    if (r.rows.length > 0) {
      historico = { anio: 2024, cabecera: r.rows[0].distrito_cabecera, resultados: r.rows };
    }
  }

  // 👥 QUIÉN TRABAJA ESTE TERRITORIO Y SI ESTÁ CUMPLIENDO SU META —
  // junta a cualquiera cuyo territorio individual caiga DENTRO de
  // este (un promotor de una sección de este distrito, un enlace
  // asignado directo al distrito completo, etc.), y compara sus
  // promovidos reales contra su meta diaria × los días que lleva
  // dado de alta. Antes esto no existía — solo se sabía "quién es el
  // responsable", nunca si de verdad está cumpliendo.
  const numerosSeccion = secciones.rows.map((s) => s.numero);
  const equipoRes = await query(
    `SELECT u.id, u.nombre, u.rol, u.meta_diaria, u.creado_en, u.territorio_tipo, u.territorio_id,
            COUNT(p.id) as promovidos_reales
     FROM usuarios u
     LEFT JOIN promovidos p ON p.registrado_por = u.id
     WHERE u.campana_id = $1 AND (
       (u.territorio_tipo = $2 AND u.territorio_id = $3)
       OR (u.territorio_tipo = 'seccion' AND u.territorio_id = ANY($4::int[]))
     )
     GROUP BY u.id
     ORDER BY u.rol, u.nombre`,
    [req.usuario.campana_id, tipo, numero, numerosSeccion]
  );
  const equipo = equipoRes.rows.map((m) => {
    const diasActivo = Math.max(1, Math.ceil((Date.now() - new Date(m.creado_en)) / 86400000));
    const metaAcumulada = (m.meta_diaria || 0) * diasActivo;
    const promovidosReales = parseInt(m.promovidos_reales);
    return {
      nombre: m.nombre,
      rol: m.rol,
      nivel: m.territorio_tipo === tipo ? 'responsable_directo' : 'en_el_territorio',
      meta_diaria: m.meta_diaria,
      promovidos_reales: promovidosReales,
      cumplimiento_pct: metaAcumulada > 0 ? Math.min(999, Math.round((promovidosReales / metaAcumulada) * 100)) : null,
    };
  });
  // Cuántas de las secciones de este territorio tienen AL MENOS
  // alguien trabajándolas (vía Sectorización) — el mismo indicador
  // que ya existe en Cobertura, pero aquí acotado a este territorio.
  const coberturaRes = await query(
    `SELECT COUNT(DISTINCT z.seccion_id) as secciones_cubiertas
     FROM zonas_asignadas z JOIN secciones s ON s.id = z.seccion_id
     WHERE z.campana_id = $1 AND s.numero = ANY($2::int[])`,
    [req.usuario.campana_id, numerosSeccion]
  );

  res.json({
    ok: true,
    data: {
      existe: true,
      tipo, numero,
      nombre_municipio: secciones.nombreMunicipio || null,
      total_secciones: secciones.rows.length,
      total_lista_nominal: totalListaNominal,
      municipios_incluidos: municipiosUnicos,
      historico,
      equipo,
      secciones_cubiertas: parseInt(coberturaRes.rows[0].secciones_cubiertas),
    },
  });
});

export default router;

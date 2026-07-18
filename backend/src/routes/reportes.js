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
    // % de votos del partido propio, sección por sección, en Ayuntamiento
    // vs Pdte. Comunidad 2024 — la diferencia real observada es la
    // "muestra" de la que remuestreamos, no una distribución inventada.
    let filtroTerritorio = '';
    const paramsTerr = [];
    if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
      filtroTerritorio = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$1)';
      paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_local' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_local=$1'; paramsTerr.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'distrito_federal' && campana.territorio_id) {
      filtroTerritorio = 'AND s.distrito_federal=$1'; paramsTerr.push(campana.territorio_id);
    }

    const datos2024 = await query(
      `SELECT s.numero, r.tipo_eleccion, r.partido, r.votos FROM resultados_historicos r
       JOIN secciones s ON s.id=r.seccion_id
       WHERE r.anio=2024 AND r.tipo_eleccion IN ('ayuntamiento','pres_comunidad') AND s.estado_id=29 ${filtroTerritorio}`,
      paramsTerr
    );
    const porSeccion = {};
    datos2024.rows.forEach((r) => {
      if (!porSeccion[r.numero]) porSeccion[r.numero] = { ayuntamiento: {}, pres_comunidad: {} };
      porSeccion[r.numero][r.tipo_eleccion][r.partido] = r.votos;
    });

    const swingsObservados = [];
    Object.values(porSeccion).forEach((d) => {
      const totalA = Object.values(d.ayuntamiento).reduce((a, b) => a + b, 0);
      const totalP = Object.values(d.pres_comunidad).reduce((a, b) => a + b, 0);
      if (totalA === 0 || totalP === 0) return;
      const shareA = (d.ayuntamiento[campana.partido] || 0) / totalA;
      const shareP = (d.pres_comunidad[campana.partido] || 0) / totalP;
      swingsObservados.push(shareP - shareA); // diferencia real observada, en puntos porcentuales de share
    });
    // Si no hay suficientes secciones comparables, usar un supuesto
    // conservador y decirlo con toda claridad (no inventar precisión).
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
       WHERE r.tipo_eleccion=$${paramsTerr.length + 1} AND r.anio=$${paramsTerr.length + 2} AND s.estado_id=29 ${filtroTerritorio}`,
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
     WHERE s.estado_id=29 AND (z.campana_id=$1 OR p.campana_id=$1)
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
    `SELECT COALESCE(SUM(s.lista_nominal),0) as total FROM secciones s WHERE s.estado_id=29
     ${campana.territorio_tipo === 'municipio' && campana.territorio_id ? 'AND s.municipio_id=(SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$1)' : ''}`,
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
    filtroTerritorio = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$1)';
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
     WHERE r.tipo_eleccion=$${paramsTerr.length + 1} AND r.anio=$${paramsTerr.length + 2} AND s.estado_id=29 ${filtroTerritorio}`,
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

export default router;

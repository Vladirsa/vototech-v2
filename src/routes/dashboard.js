import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/dashboard/resumen
 * TODO lo que el candidato o el jefe de campaña necesitan ver en un
 * solo lugar — se calcula en el servidor para que el frontend haga
 * UNA sola llamada en vez de diez.
 */
router.get('/resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  try {
    const campanaRes = await query(
      `SELECT nombre_candidato, partido, tipo_eleccion, territorio_tipo, territorio_id, fecha_eleccion, meta_votos
       FROM campanas WHERE id=$1`, [campanaId]
    );
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

    const seccionesRes = await query(
      `SELECT s.id, s.numero, s.lista_nominal, s.distrito_local FROM secciones s WHERE s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`,
      paramsTerr
    );
    const seccionIds = seccionesRes.rows.map((s) => s.id);
    const listaNominalTotal = seccionesRes.rows.reduce((s, r) => s + (r.lista_nominal || 0), 0);

    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;
    let porSeccionVotos = {};
    if (anio && seccionIds.length > 0) {
      const hist = await query(
        `SELECT seccion_id, partido, votos FROM resultados_historicos WHERE tipo_eleccion=$1 AND anio=$2 AND seccion_id = ANY($3)`,
        [campana.tipo_eleccion, anio, seccionIds]
      );
      hist.rows.forEach((r) => {
        if (!porSeccionVotos[r.seccion_id]) porSeccionVotos[r.seccion_id] = {};
        porSeccionVotos[r.seccion_id][r.partido] = r.votos;
      });
    }

    const promosRes = await query(
      `SELECT p.seccion_id, p.clasificacion, p.creado_en, p.comprometido, p.registrado_por
       FROM promovidos p WHERE p.campana_id=$1`,
      [campanaId]
    );

    let seccionesGanadas = 0, seccionesPerdidas = 0, seccionesConPromotores = 0, seccionesSinPromover = 0;
    const promosPorSeccion = {};
    promosRes.rows.forEach((p) => {
      if (!p.seccion_id) return;
      promosPorSeccion[p.seccion_id] = (promosPorSeccion[p.seccion_id] || 0) + 1;
    });

    const secciohesCriticas = [];
    seccionesRes.rows.forEach((s) => {
      const votos = porSeccionVotos[s.id] || {};
      const totalVotos = Object.values(votos).reduce((a, b) => a + b, 0);
      const ganador = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0];
      const votosPartido = votos[campana.partido] || 0;
      const gana = ganador === campana.partido;
      if (totalVotos > 0) { if (gana) seccionesGanadas++; else seccionesPerdidas++; }
      const numPromos = promosPorSeccion[s.id] || 0;
      if (numPromos > 0) seccionesConPromotores++; else seccionesSinPromover++;

      if (totalVotos > 0 && !gana) {
        const votosNecesarios = Math.floor(totalVotos / 2) + 1;
        const deficit = votosNecesarios - votosPartido;
        secciohesCriticas.push({ seccion: s.numero, deficit_votos: deficit });
      }
    });
    secciohesCriticas.sort((a, b) => a.deficit_votos - b.deficit_votos);

    const hoy = new Date().toISOString().slice(0, 10);
    const promovidosHoy = promosRes.rows.filter((p) => p.creado_en?.toISOString().slice(0, 10) === hoy).length;
    const comprometidosHoy = promosRes.rows.filter((p) => p.creado_en?.toISOString().slice(0, 10) === hoy && p.comprometido).length;

    const incidenciasRes = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1 AND estado='activa'`, [campanaId]);
    const incidenciasActivas = parseInt(incidenciasRes.rows[0].total);

    const promovidosSeguros = promosRes.rows.filter((p) => p.clasificacion === 'base' || p.comprometido).length;
    const metaVotos = campana.meta_votos || Math.round(listaNominalTotal * 0.35);
    const faltanParaMeta = Math.max(0, metaVotos - promovidosSeguros);
    const diasRestantes = campana.fecha_eleccion
      ? Math.max(1, Math.ceil((new Date(campana.fecha_eleccion) - new Date()) / 86400000))
      : null;
    const ritmoNecesario = diasRestantes ? Math.ceil(faltanParaMeta / diasRestantes) : null;

    const agendaHoyRes = await query(
      `SELECT titulo, tipo, fecha_inicio, lugar FROM agenda
       WHERE campana_id=$1 AND fecha_inicio::date = CURRENT_DATE ORDER BY fecha_inicio`,
      [campanaId]
    );

    const reportesHoyRes = await query(
      `SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND creado_en::date = CURRENT_DATE`,
      [campanaId]
    );
    const reportesHoy = parseInt(reportesHoyRes.rows[0].total);

    const actividadDistritoRes = await query(
      `SELECT s.distrito_local, COUNT(*) as total
       FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 AND p.creado_en > now() - interval '7 days' AND s.distrito_local IS NOT NULL
       GROUP BY s.distrito_local ORDER BY s.distrito_local`,
      [campanaId]
    );

    const actividadRecienteRes = await query(
      `SELECT p.nombre as promovido, u.nombre as promotor, p.creado_en, s.numero as seccion_numero
       FROM promovidos p JOIN usuarios u ON u.id = p.registrado_por
       LEFT JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 ORDER BY p.creado_en DESC LIMIT 8`,
      [campanaId]
    );

    const mejorPromotorRes = await query(
      `SELECT u.id, u.nombre, COUNT(p.id) as total_promovidos,
              COUNT(p.id) FILTER (WHERE p.comprometido) as comprometidos
       FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
       WHERE u.campana_id=$1 AND u.rol='promotor'
       GROUP BY u.id, u.nombre ORDER BY total_promovidos DESC LIMIT 1`,
      [campanaId]
    );

    const coordinadoresRes = await query(
      `SELECT u.id, u.nombre, u.rol,
              (SELECT COUNT(*) FROM usuarios h WHERE h.parent_id = u.id) as equipo,
              (SELECT COUNT(*) FROM promovidos p2 JOIN usuarios h2 ON h2.id = p2.registrado_por
               WHERE h2.parent_id = u.id AND p2.campana_id=$1) as promovidos_equipo
       FROM usuarios u WHERE u.campana_id=$1 AND u.rol IN ('coord_general','coord_distrital','coord_municipal','coord_seccional')
       ORDER BY promovidos_equipo DESC`,
      [campanaId]
    );

    const activosRes = await query(
      `SELECT tipo, COUNT(*) as total, COALESCE(SUM(cantidad),0) as cantidad_total, COALESCE(SUM(costo),0) as costo_total
       FROM activos WHERE campana_id=$1 GROUP BY tipo`,
      [campanaId]
    );
    const resumenActivos = {};
    activosRes.rows.forEach((a) => { resumenActivos[a.tipo] = { total: parseInt(a.total), cantidad: parseInt(a.cantidad_total), costo: parseFloat(a.costo_total) }; });

    const gastoRes = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
    const gastoTotal = parseFloat(gastoRes.rows[0].total);

    const alertas = [];
    if (seccionesPerdidas > 0) alertas.push({ tipo: 'critica', texto: `Hay ${seccionesPerdidas} secciones en rojo — ritmo de recuperación insuficiente` });
    if (reportesHoy === 0) alertas.push({ tipo: 'advertencia', texto: 'Ningún promotor ha subido reporte hoy — verificar actividad de campo' });
    if (faltanParaMeta > 0 && promovidosSeguros === 0) alertas.push({ tipo: 'meta', texto: 'Meta al 0% — se necesita acelerar el ritmo' });
    alertas.push({ tipo: 'info', texto: `Hoy: ${agendaHoyRes.rows.length} eventos en agenda · ${reportesHoy} reportes de campo` });

    res.json({
      ok: true,
      data: {
        candidato: campana.nombre_candidato,
        meta_electoral: {
          promovidos_registrados: promosRes.rows.length,
          meta_votos: metaVotos,
          faltan_para_meta: faltanParaMeta,
          porcentaje: metaVotos > 0 ? +((promovidosSeguros / metaVotos) * 100).toFixed(1) : 0,
          ritmo_necesario: ritmoNecesario,
          dias_restantes: diasRestantes,
        },
        kpis: {
          secciones_ganadas: seccionesGanadas,
          secciones_perdidas: seccionesPerdidas,
          secciones_con_promotores: seccionesConPromotores,
          secciones_sin_promover: seccionesSinPromover,
          total_secciones: seccionesRes.rows.length,
          promovidos_hoy: promovidosHoy,
          comprometidos_hoy: comprometidosHoy,
          incidencias_activas: incidenciasActivas,
          promovidos_seguros: promovidosSeguros,
        },
        alertas,
        secciones_criticas: secciohesCriticas.slice(0, 6),
        agenda_hoy: agendaHoyRes.rows,
        actividad_por_distrito: actividadDistritoRes.rows,
        actividad_reciente: actividadRecienteRes.rows,
        mejor_promotor: mejorPromotorRes.rows[0] || null,
        coordinadores: coordinadoresRes.rows,
        activos: resumenActivos,
        gasto_total: gastoTotal,
      },
    });
  } catch (e) {
    console.error('Error en resumen de dashboard:', e);
    res.status(500).json({ ok: false, error: 'Error al calcular el resumen' });
  }
});

/**
 * GET /api/dashboard/ejecutivo
 * Versión ultra simplificada para el candidato — 5 indicadores, nada
 * más. La idea no es esconder información, es que quien no tiene
 * tiempo de leer veinte gráficas pueda ver en 5 segundos cómo va todo.
 */
router.get('/ejecutivo', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campanaRes = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id, meta_votos FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];

  let filtroTerritorio = '';
  const paramsTerr = [];
  if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
    filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)`;
    paramsTerr.push(campana.territorio_id);
  }

  // ── 1. % DE COBERTURA TERRITORIAL ──
  const totalSeccionesRes = await query(`SELECT COUNT(*) as total FROM secciones s WHERE s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}`, paramsTerr);
  // Filtro de territorio con su propio índice de parámetro — $1 aquí
  // es campana_id, así que el filtro de territorio (si aplica) debe
  // correrse a $2 para no chocar (mismo tipo de bug que ya corregimos
  // antes en el bootstrap de Estadística).
  const filtroTerritorioCorrido = filtroTerritorio.replace('$1', '$2');
  const seccionesConPresenciaRes = await query(
    `SELECT COUNT(DISTINCT p.seccion_id) as total FROM promovidos p JOIN secciones s ON s.id=p.seccion_id
     WHERE p.campana_id=$1 ${filtroTerritorioCorrido}`,
    [campanaId, ...paramsTerr]
  );
  const totalSecciones = parseInt(totalSeccionesRes.rows[0].total) || 1;
  const seccionesConPresencia = parseInt(seccionesConPresenciaRes.rows[0].total) || 0;
  const coberturaPct = Math.round((seccionesConPresencia / totalSecciones) * 100);

  // ── 2. VOTO ESTIMADO ──
  const comprometidosRes = await query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido=true`, [campanaId]);
  const votoEstimado = parseInt(comprometidosRes.rows[0].total);

  // ── 3. MUNICIPIOS EN RIESGO — donde el histórico dice que vas perdiendo ──
  const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
  const anio = anioRes.rows[0]?.anio;
  let municipiosRiesgo = 0, totalMunicipios = 0;
  if (anio) {
    // Igual que antes: $1 y $2 ya están usados (tipo_eleccion, año),
    // así que el filtro de territorio necesita correrse a $3.
    const filtroTerritorioCorrido3 = filtroTerritorio.replace('$1', '$3');
    const porMunicipio = await query(
      `SELECT m.nombre, r.partido, SUM(r.votos) as votos
       FROM resultados_historicos r JOIN secciones s ON s.id=r.seccion_id JOIN municipios m ON m.id=s.municipio_id
       WHERE r.tipo_eleccion=$1 AND r.anio=$2 AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorioCorrido3}
       GROUP BY m.nombre, r.partido`,
      [campana.tipo_eleccion, anio, ...paramsTerr]
    );
    const agrupado = {};
    porMunicipio.rows.forEach((r) => {
      if (!agrupado[r.nombre]) agrupado[r.nombre] = {};
      agrupado[r.nombre][r.partido] = parseInt(r.votos);
    });
    totalMunicipios = Object.keys(agrupado).length;
    Object.values(agrupado).forEach((votos) => {
      const ganador = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
      if (ganador && ganador[0] !== campana.partido) municipiosRiesgo++;
    });
  }

  // ── 4. ESTRUCTURA ACTIVA — % de promotores con actividad en 7 días ──
  const totalPromotoresRes = await query(`SELECT COUNT(*) as total FROM usuarios WHERE campana_id=$1 AND rol='promotor' AND activo != false`, [campanaId]);
  const promotoresActivosRes = await query(
    `SELECT COUNT(DISTINCT registrado_por) as total FROM promovidos WHERE campana_id=$1 AND creado_en > now() - interval '7 days'`,
    [campanaId]
  );
  const totalPromotores = parseInt(totalPromotoresRes.rows[0].total) || 1;
  const promotoresActivos = parseInt(promotoresActivosRes.rows[0].total) || 0;
  const estructuraActivaPct = Math.round((promotoresActivos / totalPromotores) * 100);

  // ── 5. AVANCE DIARIO — promedio de últimos 7 días ──
  const avanceRes = await query(
    `SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND creado_en > now() - interval '7 days'`,
    [campanaId]
  );
  const avanceDiario = +(parseInt(avanceRes.rows[0].total) / 7).toFixed(1);

  res.json({
    ok: true,
    data: {
      cobertura_pct: coberturaPct,
      secciones_con_presencia: seccionesConPresencia,
      total_secciones: totalSecciones,
      voto_estimado: votoEstimado,
      meta_votos: campana.meta_votos,
      municipios_riesgo: municipiosRiesgo,
      total_municipios: totalMunicipios,
      estructura_activa_pct: estructuraActivaPct,
      promotores_activos: promotoresActivos,
      total_promotores: totalPromotores,
      avance_diario: avanceDiario,
    },
  });
});

export default router;

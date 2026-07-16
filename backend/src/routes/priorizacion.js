import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/priorizacion
 * El corazón estratégico del sistema: cruza resultados históricos
 * reales con el avance actual de promovidos, y clasifica cada
 * sección del territorio del candidato en:
 *
 *   CRÍTICA     — perdimos por poco, alto impacto por cada promovido
 *   RECUPERABLE — perdimos, pero es posible con más esfuerzo
 *   DISPUTA     — empate técnico, puede irse para cualquier lado
 *   CONSOLIDAR  — ya ganamos, no descuidar
 *   PERDIDA     — perdimos por mucho, no gastar recursos aquí
 *
 * A diferencia de la v1, aquí el "score" prioritario también
 * pesa cuántos DÍAS quedan para la elección — mientras menos
 * días, más urgente se vuelve cerrar el déficit en las secciones
 * críticas (el ritmo diario necesario sube).
 */
router.get('/', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const diasParam = parseInt(req.query.dias) || null;

  try {
    // 1. Traer la campaña para saber su territorio, partido y tipo de elección
    const campanaRes = await query(
      `SELECT partido, tipo_eleccion, territorio_tipo, territorio_id, fecha_eleccion
       FROM campanas WHERE id = $1`,
      [campanaId]
    );
    const campana = campanaRes.rows[0];
    if (!campana) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });

    const diasRestantes = diasParam || (campana.fecha_eleccion
      ? Math.max(1, Math.ceil((new Date(campana.fecha_eleccion) - new Date()) / 86400000))
      : 365);

    // 2. Traer resultados históricos reales del tipo de elección de esta campaña,
    //    limitados al territorio del candidato (municipio/sección/todo el estado)
    let filtroTerritorio = '';
    const params = [campana.tipo_eleccion];
    if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
      filtroTerritorio = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=29 AND clave_ine=$2)';
      params.push(campana.territorio_id);
    } else if (campana.territorio_tipo === 'seccion' && campana.territorio_id) {
      filtroTerritorio = 'AND s.numero = $2';
      params.push(campana.territorio_id);
    }

    const anioReciente = await query(
      `SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1`,
      [campana.tipo_eleccion]
    );
    const anio = anioReciente.rows[0]?.anio;
    if (!anio) {
      return res.json({ ok: true, data: [], mensaje: 'Sin datos históricos para este tipo de elección todavía' });
    }
    params.push(anio);

    const historico = await query(
      `SELECT s.id as seccion_id, s.numero as seccion, s.lista_nominal,
              r.partido, r.votos
       FROM resultados_historicos r
       JOIN secciones s ON s.id = r.seccion_id
       WHERE r.tipo_eleccion = $1 ${filtroTerritorio} AND r.anio = $${params.length}
       ORDER BY s.numero`,
      params
    );

    // 3. Traer promovidos actuales por sección (agrupados + con clasificación)
    const promosRes = await query(
      `SELECT s.numero as seccion, p.clasificacion, COUNT(*) as total
       FROM promovidos p
       JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id = $1
       GROUP BY s.numero, p.clasificacion`,
      [campanaId]
    );
    const promosPorSeccion = {};
    for (const fila of promosRes.rows) {
      if (!promosPorSeccion[fila.seccion]) promosPorSeccion[fila.seccion] = { base: 0, persuadible: 0, adversario: 0 };
      promosPorSeccion[fila.seccion][fila.clasificacion] = parseInt(fila.total);
    }

    // 4. Agrupar histórico por sección
    const porSeccion = {};
    for (const fila of historico.rows) {
      if (!porSeccion[fila.seccion]) {
        porSeccion[fila.seccion] = { seccion_id: fila.seccion_id, lista_nominal: fila.lista_nominal, votos: {}, total: 0 };
      }
      porSeccion[fila.seccion].votos[fila.partido] = fila.votos;
      porSeccion[fila.seccion].total += fila.votos;
    }

    // 5. Calcular análisis por sección
    const CONVERSION_PROMOVIDO_A_VOTO = 0.65; // cada promovido comprometido aporta ~0.65 votos seguros
    const analisis = [];

    for (const [seccNum, datos] of Object.entries(porSeccion)) {
      const votosPartido = datos.votos[campana.partido] || 0;
      const votosOposicion = datos.total - votosPartido;
      const ganador = Object.entries(datos.votos).sort((a, b) => b[1] - a[1])[0]?.[0];
      const margenPct = datos.total > 0 ? (votosPartido / datos.total * 100 - 50) : 0;

      const promos = promosPorSeccion[seccNum] || { base: 0, persuadible: 0, adversario: 0 };
      const votosConPromovidos = votosPartido + (promos.base + promos.persuadible) * CONVERSION_PROMOVIDO_A_VOTO;
      const votosNecesarios = Math.floor(datos.total / 2) + 1;
      const deficit = Math.max(0, votosNecesarios - votosConPromovidos);
      const promosNecesarios = Math.ceil(deficit / CONVERSION_PROMOVIDO_A_VOTO);
      const ritmoDiario = diasRestantes > 0 ? +(promosNecesarios / diasRestantes).toFixed(1) : promosNecesarios;

      let prioridad, score;
      const gana = ganador === campana.partido;

      if (gana && Math.abs(margenPct) <= 10) { prioridad = 'consolidar'; score = 40; }
      else if (gana) { prioridad = 'consolidar'; score = 15; }
      else if (Math.abs(margenPct) <= 8) { prioridad = 'critica'; score = 100 - Math.abs(margenPct); }
      else if (Math.abs(margenPct) <= 20) { prioridad = 'recuperable'; score = 70 - Math.abs(margenPct); }
      else if (Math.abs(margenPct) <= 5) { prioridad = 'disputa'; score = 85; }
      else { prioridad = 'perdida'; score = 5; }

      // Ajustar score: entre más faltan días, más urgente (multiplicador)
      const factorUrgencia = diasRestantes < 30 ? 1.5 : diasRestantes < 90 ? 1.2 : 1;
      score = score * factorUrgencia * (1 - Math.min(0.7, (promos.base + promos.persuadible) / Math.max(1, promosNecesarios) * 0.5));

      analisis.push({
        seccion: parseInt(seccNum),
        lista_nominal: datos.lista_nominal,
        votos_totales: datos.total,
        votos_partido: votosPartido,
        ganador_historico: ganador,
        margen_pct: +margenPct.toFixed(1),
        promovidos_base: promos.base,
        promovidos_persuadibles: promos.persuadible,
        promovidos_adversarios: promos.adversario,
        deficit_votos: Math.round(deficit),
        promovidos_necesarios: promosNecesarios,
        ritmo_diario_necesario: ritmoDiario,
        prioridad,
        score: +score.toFixed(1),
      });
    }

    analisis.sort((a, b) => b.score - a.score);

    res.json({
      ok: true,
      data: analisis,
      dias_restantes: diasRestantes,
      resumen: {
        criticas: analisis.filter(a => a.prioridad === 'critica').length,
        recuperables: analisis.filter(a => a.prioridad === 'recuperable').length,
        disputa: analisis.filter(a => a.prioridad === 'disputa').length,
        consolidar: analisis.filter(a => a.prioridad === 'consolidar').length,
        perdidas: analisis.filter(a => a.prioridad === 'perdida').length,
        promovidos_necesarios_total: analisis.reduce((s, a) => s + a.promovidos_necesarios, 0),
      },
    });
  } catch (e) {
    console.error('Error en priorización:', e);
    res.status(500).json({ ok: false, error: 'Error calculando priorización' });
  }
});

/**
 * GET /api/priorizacion/hoy
 * "¿Qué hacer hoy?" — traduce el análisis de priorización en UNA
 * recomendación clara y accionable, según la fase de la campaña
 * (identificación / persuasión / cierre / movilización).
 */
router.get('/hoy', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  try {
    const campanaRes = await query('SELECT fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
    const fechaEleccion = campanaRes.rows[0]?.fecha_eleccion;
    const dias = fechaEleccion
      ? Math.max(0, Math.ceil((new Date(fechaEleccion) - new Date()) / 86400000))
      : null;

    let fase, mensaje, icono;
    if (dias === null) {
      fase = 'sin_fecha'; icono = '📅';
      mensaje = 'Configura la fecha de tu elección para recibir recomendaciones diarias.';
    } else if (dias > 180) {
      fase = 'identificacion'; icono = '🔍';
      mensaje = 'Fase de identificación: enfócate en registrar promovidos y detectar quién es Base, Persuadible o Adversario en cada sección.';
    } else if (dias > 30) {
      fase = 'persuasion'; icono = '🤝';
      mensaje = 'Fase de persuasión: dale seguimiento a tus Persuadibles. Cada contacto extra suma — no dejes que pasen 15 días sin hablarles.';
    } else if (dias > 7) {
      fase = 'cierre'; icono = '🎯';
      mensaje = 'Fase de cierre: concentra el 80% del esfuerzo en las secciones Críticas y en Disputa. Ya no es momento de dispersarse.';
    } else if (dias > 0) {
      fase = 'movilizacion'; icono = '📢';
      mensaje = 'Última semana: confirma con todos tus Base que sepan dónde votar. Ya no busques persuadir, asegura que SALGAN A VOTAR.';
    } else {
      fase = 'dia_d'; icono = '🗳️';
      mensaje = '¡Es el día! Activa la lista de cacería: identifica quién de tus confirmados no ha votado.';
    }

    // Sección más urgente ahora mismo (la de mayor score)
    const topSeccion = await query(
      `SELECT s.numero FROM secciones s WHERE s.estado_id=29 LIMIT 1` // placeholder simplificado
    );

    res.json({ ok: true, data: { dias_restantes: dias, fase, icono, mensaje } });
  } catch (e) {
    console.error('Error en recomendación diaria:', e);
    res.status(500).json({ ok: false, error: 'Error calculando recomendación' });
  }
});

export default router;

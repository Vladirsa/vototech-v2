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

/**
 * GET /api/priorizacion/seccion/:numero
 * Ficha técnica completa de UNA sección: padrón, resultados históricos
 * reales, promovidos actuales por clasificación, y qué falta para
 * ganarla — todo lo que el equipo necesita ver al tocar una sección
 * en el mapa.
 */
router.get('/seccion/:numero', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const numero = parseInt(req.params.numero);

  try {
    const campanaRes = await query('SELECT partido, tipo_eleccion, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
    const campana = campanaRes.rows[0];

    const seccionRes = await query(
      `SELECT s.id, s.numero, s.lista_nominal, s.distrito_federal, s.distrito_local, m.nombre as municipio
       FROM secciones s JOIN municipios m ON m.id=s.municipio_id
       WHERE s.estado_id=29 AND s.numero=$1`,
      [numero]
    );
    if (!seccionRes.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
    const seccion = seccionRes.rows[0];

    // Resultados históricos reales (año más reciente disponible)
    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;
    let votos = {}, totalVotos = 0, ganador = null;
    if (anio) {
      const historico = await query(
        `SELECT partido, votos FROM resultados_historicos WHERE seccion_id=$1 AND tipo_eleccion=$2 AND anio=$3 ORDER BY votos DESC`,
        [seccion.id, campana.tipo_eleccion, anio]
      );
      historico.rows.forEach((r) => { votos[r.partido] = r.votos; totalVotos += r.votos; });
      ganador = historico.rows[0]?.partido || null;
    }

    // Promovidos actuales de esta sección, por clasificación
    const promosRes = await query(
      `SELECT clasificacion, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND seccion_id=$2 GROUP BY clasificacion`,
      [campanaId, seccion.id]
    );
    const promos = { base: 0, persuadible: 0, adversario: 0 };
    promosRes.rows.forEach((r) => { promos[r.clasificacion] = parseInt(r.total); });

    // Cálculo de déficit — misma fórmula que el Motor de Priorización general
    const CONVERSION = 0.65;
    const votosPartido = votos[campana.partido] || 0;
    const votosConPromovidos = votosPartido + (promos.base + promos.persuadible) * CONVERSION;
    const votosNecesarios = totalVotos > 0 ? Math.floor(totalVotos / 2) + 1 : 0;
    const deficit = Math.max(0, votosNecesarios - votosConPromovidos);
    const promovidosNecesarios = Math.ceil(deficit / CONVERSION);

    const diasRestantes = campana.fecha_eleccion
      ? Math.max(1, Math.ceil((new Date(campana.fecha_eleccion) - new Date()) / 86400000))
      : null;

    res.json({
      ok: true,
      data: {
        seccion: seccion.numero,
        municipio: seccion.municipio,
        lista_nominal: seccion.lista_nominal,
        distrito_federal: seccion.distrito_federal,
        distrito_local: seccion.distrito_local,
        anio_historico: anio,
        votos_historicos: votos,
        total_votos_historico: totalVotos,
        ganador_historico: ganador,
        promovidos: promos,
        total_promovidos: promos.base + promos.persuadible + promos.adversario,
        deficit_votos: Math.round(deficit),
        promovidos_necesarios: promovidosNecesarios,
        ritmo_diario: diasRestantes ? +(promovidosNecesarios / diasRestantes).toFixed(1) : null,
      },
    });
  } catch (e) {
    console.error('Error en ficha técnica de sección:', e);
    res.status(500).json({ ok: false, error: 'Error al cargar la ficha técnica' });
  }
});

/**
 * GET /api/priorizacion/municipio/:claveIne
 * Ficha técnica del MUNICIPIO completo: cuántas secciones tiene,
 * quién lo gobierna actualmente, población electoral agregada,
 * semáforo de cuántas secciones se ganan/disputan/hay que recuperar,
 * y resultados históricos acumulados de todo el municipio.
 */
router.get('/municipio/:claveIne', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const claveIne = parseInt(req.params.claveIne);

  try {
    const campanaRes = await query('SELECT partido, tipo_eleccion FROM campanas WHERE id=$1', [campanaId]);
    const campana = campanaRes.rows[0];

    const municipioRes = await query('SELECT nombre FROM municipios WHERE estado_id=29 AND clave_ine=$1', [claveIne]);
    if (!municipioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Municipio no encontrado' });

    const secciones = await query(
      `SELECT s.id, s.numero, s.lista_nominal FROM secciones s
       JOIN municipios m ON m.id=s.municipio_id WHERE m.estado_id=29 AND m.clave_ine=$1`,
      [claveIne]
    );
    const seccionIds = secciones.rows.map((s) => s.id);
    const listaNominalTotal = secciones.rows.reduce((s, r) => s + (r.lista_nominal || 0), 0);

    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;

    let votosPorPartido = {}, totalVotos = 0, totalCasillas = 0, ganador = null;
    let semaforo = { ganamos: 0, disputa: 0, recuperar: 0 };

    if (anio && seccionIds.length > 0) {
      const historico = await query(
        `SELECT seccion_id, partido, votos, casillas FROM resultados_historicos
         WHERE tipo_eleccion=$1 AND anio=$2 AND seccion_id = ANY($3)`,
        [campana.tipo_eleccion, anio, seccionIds]
      );

      const porSeccion = {};
      const casillasVistas = new Set();
      historico.rows.forEach((r) => {
        votosPorPartido[r.partido] = (votosPorPartido[r.partido] || 0) + r.votos;
        totalVotos += r.votos;
        if (!porSeccion[r.seccion_id]) porSeccion[r.seccion_id] = {};
        porSeccion[r.seccion_id][r.partido] = r.votos;
        if (!casillasVistas.has(`${r.seccion_id}`)) { casillasVistas.add(`${r.seccion_id}`); totalCasillas += r.casillas || 0; }
      });

      ganador = Object.entries(votosPorPartido).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Semáforo: clasificar cada sección según margen del partido de la campaña
      Object.values(porSeccion).forEach((votos) => {
        const totalSecc = Object.values(votos).reduce((s, v) => s + v, 0);
        const votosPartido = votos[campana.partido] || 0;
        const ordenados = Object.entries(votos).sort((a, b) => b[1] - a[1]);
        const ganadorSecc = ordenados[0]?.[0];
        const margen = totalSecc > 0 ? (votosPartido / totalSecc * 100 - 50) : 0;

        if (ganadorSecc === campana.partido) semaforo.ganamos++;
        else if (Math.abs(margen) <= 10) semaforo.disputa++;
        else semaforo.recuperar++;
      });
    }

    // Promovidos actuales del municipio completo
    const promosRes = await query(
      `SELECT clasificacion, COUNT(*) as total FROM promovidos p
       JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 AND s.id = ANY($2) GROUP BY clasificacion`,
      [campanaId, seccionIds]
    );
    const promovidos = { base: 0, persuadible: 0, adversario: 0 };
    promosRes.rows.forEach((r) => { promovidos[r.clasificacion] = parseInt(r.total); });
    const totalPromovidos = promovidos.base + promovidos.persuadible + promovidos.adversario;

    res.json({
      ok: true,
      data: {
        municipio: municipioRes.rows[0].nombre,
        clave_ine: claveIne,
        total_secciones: secciones.rows.length,
        gobierna_actualmente: ganador,
        poblacion_electoral: {
          lista_nominal: listaNominalTotal,
          votos_totales: totalVotos,
          participacion_pct: listaNominalTotal > 0 ? +((totalVotos / listaNominalTotal) * 100).toFixed(1) : null,
          casillas: totalCasillas,
        },
        semaforo,
        resultados_historicos: { anio, votos_por_partido: votosPorPartido, total_votos: totalVotos },
        promovidos,
        total_promovidos: totalPromovidos,
        penetracion_pct: listaNominalTotal > 0 ? +((totalPromovidos / listaNominalTotal) * 100).toFixed(2) : 0,
      },
    });
  } catch (e) {
    console.error('Error en ficha técnica de municipio:', e);
    res.status(500).json({ ok: false, error: 'Error al cargar la ficha técnica del municipio' });
  }
});

export default router;

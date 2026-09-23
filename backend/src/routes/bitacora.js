import { Router } from 'express';
import { condicionAlcance, filtroAlcance } from '../lib/alcance.js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(requiereAuth);

// 🆕 sub-fase 1d — mismo cliente de IA que ya usa Reportes
// (resumen-ejecutivo-ia) — no se duplica configuración.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * 🆕 MÓDULO BITÁCORA DIARIA (Etapa 1 del rediseño)
 * ─────────────────────────────────────────────────
 * Registro cronológico de lo que pasa en la campaña, día a día.
 * Es la pieza que faltaba: hoy sabes CUÁNTOS promovidos hay, pero no
 * sabes "qué pasó hoy a las 11:20 en la sección 034". Esta bitácora
 * reconstruye la jornada, y se conecta con Estructura, Incidencias y
 * (en la Etapa 3) Actividad de Campo.
 *
 * Toda ruta de aquí para abajo YA pasó por requiereAuth, así que
 * req.usuario.sub = quién soy, req.usuario.campana_id = mi tenant.
 */

// 🆕 AMPLIADO — antes solo había 5 tipos. Se agregan los que pide el
// Banco de Ideas (Visita, Evento, Asignación, Cambio de responsable,
// Tarea, Seguimiento, Evidencia, Otro), sin quitar ni renombrar los
// que ya existían — así ningún registro viejo se queda "huérfano".
const ETIQUETA_TIPO = {
  recorrido: 'Recorrido',
  reunion: 'Reunión',
  incidencia: 'Incidencia',
  pendiente: 'Pendiente',
  nota: 'Nota',
  visita: 'Visita',
  evento: 'Evento',
  asignacion: 'Asignación',
  cambio_responsable: 'Cambio de responsable',
  tarea: 'Tarea',
  seguimiento: 'Seguimiento',
  evidencia: 'Evidencia',
  otro: 'Otro',
  cierre_jornada: 'Cierre de jornada',
};
const ICONO_TIPO = {
  recorrido: '🚶', reunion: '🤝', incidencia: '⚠️', pendiente: '📌', nota: '📝',
  visita: '🚪', evento: '🎪', asignacion: '🧩', cambio_responsable: '🔄',
  tarea: '✅', seguimiento: '🔎', evidencia: '📷', otro: '📄', cierre_jornada: '🌙',
};

// ═══════════════════════════════════════════════════════════════
// GET /api/bitacora — Línea de tiempo
// Filtros opcionales por querystring: ?fecha=2026-09-19&seccion_numero=34
// &usuario_id=<uuid>&tipo=recorrido. Sin ?fecha, regresa HOY.
// 🆕 CORREGIDO — el filtro usa 'seccion_numero' (el número real de
// la sección, ej. 034, que es lo único que la persona conoce y lo
// que manda el frontend) y compara contra s.numero, NO contra
// b.seccion_id (que es el id interno de la tabla secciones — un
// número completamente distinto, aunque a veces coincida por
// casualidad en secciones bajas). Mismo criterio que ya usa
// incidencias.js para no confundir ambos números.
// Un coord_seccional solo ve su propia bitácora + la de su rama
// directa (mismo criterio de aislamiento que ya usa Estructura).
// ═══════════════════════════════════════════════════════════════
// 🆕 AMPLIADO — antes solo se podía ver UN día (?fecha=...) y filtrar
// por sección/usuario/tipo. Ahora también acepta:
//   - ?fecha_inicio=...&fecha_fin=... → rango (para las vistas
//     Semana/Mes del frontend). Si no se manda, sigue funcionando
//     exactamente igual que antes (un solo día, hoy por defecto).
//   - ?municipio_id=..., ?distrito_federal=..., ?distrito_local=...
//     → filtros territoriales (antes solo existía por sección).
//   - ?rol=coord_seccional → filtro organizativo por cargo.
//   - ?texto=algo → buscador libre sobre título y descripción.
router.get('/', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const condiciones = ['b.campana_id = $1'];
  const valores = [campanaId];
  let i = 2;

  if (req.query.fecha_inicio && req.query.fecha_fin) {
    condiciones.push(`b.creado_en::date BETWEEN $${i++} AND $${i++}`);
    valores.push(req.query.fecha_inicio, req.query.fecha_fin);
  } else {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    condiciones.push(`b.creado_en::date = $${i++}`);
    valores.push(fecha);
  }

  if (req.query.seccion_numero) { condiciones.push(`s.numero = $${i++}`); valores.push(parseInt(req.query.seccion_numero)); }
  if (req.query.usuario_id) { condiciones.push(`b.usuario_id = $${i++}`); valores.push(req.query.usuario_id); }
  if (req.query.tipo) { condiciones.push(`b.tipo = $${i++}`); valores.push(req.query.tipo); }
  if (req.query.municipio_id) {
    condiciones.push(`(b.municipio_id = $${i} OR s.municipio_id = $${i})`);
    valores.push(parseInt(req.query.municipio_id)); i++;
  }
  if (req.query.distrito_federal) { condiciones.push(`s.distrito_federal = $${i++}`); valores.push(parseInt(req.query.distrito_federal)); }
  if (req.query.distrito_local) { condiciones.push(`s.distrito_local = $${i++}`); valores.push(parseInt(req.query.distrito_local)); }
  if (req.query.rol) { condiciones.push(`u.rol = $${i++}`); valores.push(req.query.rol); }
  if (req.query.texto) {
    condiciones.push(`(b.titulo ILIKE $${i} OR b.descripcion ILIKE $${i})`);
    valores.push(`%${req.query.texto}%`); i++;
  }

  // Un promotor / coord_seccional sin gente a cargo solo ve lo suyo.
  // 🔒 Territorio + equipo (lib/alcance.js). Antes solo promotor y
  // representante estaban limitados; un coordinador o encargado veía
  // la bitácora (con ubicaciones GPS) de toda la campaña.
  if (req.usuario.rol !== 'encargado_juridico') {
    const cond = await condicionAlcance(req.usuario, valores, { personas: ['b.usuario_id'], seccion: 'b.seccion_id' });
    if (cond !== 'TRUE') { condiciones.push(cond); i = valores.length + 1; }
  }

  const resultado = await query(
    `SELECT b.id, b.tipo, b.titulo, b.descripcion, b.prioridad, b.estado,
            b.seccion_id, s.numero as seccion_numero, s.distrito_federal, s.distrito_local,
            b.municipio_id, COALESCE(m.nombre, mSeccion.nombre) as municipio_nombre,
            b.vinculado_tipo, b.vinculado_id, b.ubicacion_lat, b.ubicacion_lng,
            b.creado_en, b.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol,
            (SELECT COUNT(*) FROM fotos f WHERE f.contexto='bitacora' AND f.referencia_id = b.id) as total_evidencias
     FROM bitacora_eventos b
     JOIN usuarios u ON u.id = b.usuario_id
     LEFT JOIN secciones s ON s.id = b.seccion_id
     LEFT JOIN municipios m ON m.id = b.municipio_id
     LEFT JOIN municipios mSeccion ON mSeccion.id = s.municipio_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY b.creado_en DESC`,
    valores
  );

  res.json({
    ok: true,
    data: resultado.rows.map((r) => ({ ...r, etiqueta: ETIQUETA_TIPO[r.tipo], icono: ICONO_TIPO[r.tipo] })),
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/bitacora/filtros — catálogos para llenar los selectores
// de filtro del frontend (municipios, distritos, roles que sí tienen
// gente dada de alta) — así el filtro nunca muestra opciones vacías
// que no llevan a ningún resultado.
// ═══════════════════════════════════════════════════════════════
router.get('/filtros', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const [municipios, distritosFederales, distritosLocales, roles] = await Promise.all([
    query(`SELECT id, nombre FROM municipios WHERE estado_id=$1 ORDER BY nombre`, [req.usuario.estado_id]),
    query(`SELECT DISTINCT distrito_federal FROM secciones WHERE estado_id=$1 AND distrito_federal IS NOT NULL ORDER BY distrito_federal`, [req.usuario.estado_id]),
    query(`SELECT DISTINCT distrito_local FROM secciones WHERE estado_id=$1 AND distrito_local IS NOT NULL ORDER BY distrito_local`, [req.usuario.estado_id]),
    query(`SELECT DISTINCT rol FROM usuarios WHERE campana_id=$1 AND activo != false ORDER BY rol`, [campanaId]),
  ]);
  res.json({
    ok: true,
    data: {
      municipios: municipios.rows,
      distritos_federales: distritosFederales.rows.map((r) => r.distrito_federal),
      distritos_locales: distritosLocales.rows.map((r) => r.distrito_local),
      roles: roles.rows.map((r) => r.rol),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/bitacora/resumen-dia — para las tarjetas de arriba del
// módulo (y reutilizable luego en el Dashboard/Ficha de Sección).
// ═══════════════════════════════════════════════════════════════
router.get('/resumen-dia', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);

  const resultado = await query(
    `SELECT tipo, COUNT(*) as total FROM bitacora_eventos
     WHERE campana_id=$1 AND creado_en::date=$2 GROUP BY tipo`,
    [campanaId, fecha]
  );
  const pendientesAbiertos = await query(
    `SELECT COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND tipo='pendiente' AND estado != 'resuelto'`,
    [campanaId]
  );
  const cierreHoy = await query(
    `SELECT id, usuario_id FROM bitacora_eventos WHERE campana_id=$1 AND tipo='cierre_jornada' AND creado_en::date=$2 AND usuario_id=$3`,
    [campanaId, fecha, req.usuario.sub]
  );

  const conteos = {};
  resultado.rows.forEach((r) => { conteos[r.tipo] = parseInt(r.total); });

  res.json({
    ok: true,
    data: {
      fecha,
      total_eventos_hoy: resultado.rows.reduce((s, r) => s + parseInt(r.total), 0),
      por_tipo: conteos,
      pendientes_abiertos_total: parseInt(pendientesAbiertos.rows[0].total),
      ya_cerre_hoy: cierreHoy.rows.length > 0,
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 GET /api/bitacora/resumen-texto — sub-fase 1b del Banco de
// Ideas: "¿QUÉ PASÓ HOY?" (resumen en una frase, armado solo con
// conteos reales — nunca se inventa ni interpreta nada) y
// "¿QUÉ CAMBIÓ?" (HOY vs AYER, y ESTA SEMANA vs SEMANA ANTERIOR).
// Nunca se dice si un cambio es "bueno" o "malo" — solo se muestra
// el número, la persona decide cómo leerlo (como pide el documento).
// ═══════════════════════════════════════════════════════════════
router.get('/resumen-texto', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  const ayer = new Date(`${fecha}T00:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const fechaAyer = ayer.toISOString().slice(0, 10);

  const inicioSemana = new Date(`${fecha}T00:00:00`);
  const diaSemana = (inicioSemana.getDay() + 6) % 7;
  inicioSemana.setDate(inicioSemana.getDate() - diaSemana);
  const finSemana = new Date(inicioSemana); finSemana.setDate(inicioSemana.getDate() + 6);
  const inicioSemanaAnterior = new Date(inicioSemana); inicioSemanaAnterior.setDate(inicioSemana.getDate() - 7);
  const finSemanaAnterior = new Date(inicioSemana); finSemanaAnterior.setDate(inicioSemana.getDate() - 1);
  const fISO = (d) => d.toISOString().slice(0, 10);

  // Conteo genérico reutilizable: eventos por tipo en un rango de fechas.
  async function conteoRango(inicio, fin) {
    const r = await query(
      `SELECT tipo, COUNT(*) as total, COUNT(*) FILTER (WHERE seccion_id IS NOT NULL OR municipio_id IS NOT NULL) as con_ubicacion
       FROM bitacora_eventos WHERE campana_id=$1 AND creado_en::date BETWEEN $2 AND $3 GROUP BY tipo`,
      [campanaId, inicio, fin]
    );
    const porTipo = {};
    let total = 0;
    r.rows.forEach((row) => { porTipo[row.tipo] = parseInt(row.total); total += parseInt(row.total); });
    return { total, porTipo };
  }

  const [hoyC, ayerC, semanaC, semanaAnteriorC, pendientesHoy] = await Promise.all([
    conteoRango(fecha, fecha),
    conteoRango(fechaAyer, fechaAyer),
    conteoRango(fISO(inicioSemana), fISO(finSemana)),
    conteoRango(fISO(inicioSemanaAnterior), fISO(finSemanaAnterior)),
    query(`SELECT COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND tipo='pendiente' AND estado != 'resuelto' AND creado_en::date=$2`, [campanaId, fecha]),
  ]);

  const incidenciasHoy = hoyC.porTipo.incidencia || 0;
  const seguimientosHoy = hoyC.porTipo.seguimiento || 0;
  const evidenciasHoy = hoyC.porTipo.evidencia || 0;
  const pendHoy = parseInt(pendientesHoy.rows[0].total);

  // "¿Qué pasó hoy?" — una frase armada solo con los números reales.
  const partesResumen = [`Se registraron ${hoyC.total} movimiento(s) durante el día.`];
  if (incidenciasHoy > 0 || seguimientosHoy > 0) {
    partesResumen.push(`${incidenciasHoy} corresponden a incidencias y ${seguimientosHoy} a seguimientos.`);
  }
  if (evidenciasHoy > 0) partesResumen.push(`Se registraron ${evidenciasHoy} evidencia(s).`);
  if (pendHoy > 0) partesResumen.push(`Permanecen ${pendHoy} asunto(s) pendiente(s) de seguimiento.`);
  const resumenTexto = partesResumen.join(' ');

  // "¿Qué cambió?" — cada renglón es un hecho, sin calificarlo.
  function comparar(actualPorTipo, anteriorPorTipo, actualTotal, anteriorTotal) {
    const tipos = new Set([...Object.keys(actualPorTipo), ...Object.keys(anteriorPorTipo)]);
    const cambios = [...tipos].map((tipo) => ({
      tipo,
      etiqueta: ETIQUETA_TIPO[tipo] || tipo,
      anterior: anteriorPorTipo[tipo] || 0,
      actual: actualPorTipo[tipo] || 0,
      cambio: (actualPorTipo[tipo] || 0) - (anteriorPorTipo[tipo] || 0),
    })).filter((c) => c.anterior > 0 || c.actual > 0)
      .sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio));
    return { anterior: anteriorTotal, actual: actualTotal, cambio: actualTotal - anteriorTotal, detalle: cambios };
  }

  res.json({
    ok: true,
    data: {
      fecha,
      resumen_texto: resumenTexto,
      que_cambio: {
        hoy_vs_ayer: comparar(hoyC.porTipo, ayerC.porTipo, hoyC.total, ayerC.total),
        semana_vs_semana_anterior: comparar(semanaC.porTipo, semanaAnteriorC.porTipo, semanaC.total, semanaAnteriorC.total),
      },
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 GET /api/bitacora/incidencias-abiertas — para el panel de
// Incidencias directamente dentro de la Bitácora (sub-fase 1b), sin
// tener que salir a la pestaña de Incidencias para ver qué sigue
// abierto. Reutiliza la tabla incidencias — no duplica datos.
// ═══════════════════════════════════════════════════════════════
router.get('/incidencias-abiertas', async (req, res) => {
  // 🔒 Mismo alcance que el módulo de Incidencias (antes un promotor las veía todas por aquí).
  const paramsInc = [req.usuario.campana_id];
  const filtroInc = req.usuario.rol === 'encargado_juridico' ? '' : await filtroAlcance(req.usuario, paramsInc, { personas: ['i.reportado_por'], seccion: 'i.seccion_id' });
  const resultado = await query(
    `SELECT i.id, i.tipo, i.urgencia, i.descripcion, i.estado, i.creado_en,
            s.numero as seccion_numero, m.nombre as municipio_nombre,
            u.nombre as reportado_por_nombre
     FROM incidencias i
     LEFT JOIN secciones s ON s.id = i.seccion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     LEFT JOIN usuarios u ON u.id = i.reportado_por
     WHERE i.campana_id=$1 AND i.estado != 'resuelta' ${filtroInc}
     ORDER BY CASE i.urgencia WHEN 'urgente' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, i.creado_en DESC
     LIMIT 50`,
    paramsInc
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/bitacora/pendientes — todos los pendientes abiertos,
// sin importar el día en que se crearon (para la pestaña "Pendientes").
// ═══════════════════════════════════════════════════════════════
router.get('/pendientes', async (req, res) => {
  const resultado = await query(
    `SELECT b.id, b.titulo, b.descripcion, b.prioridad, b.estado, b.creado_en,
            b.seccion_id, s.numero as seccion_numero, b.usuario_id, u.nombre as usuario_nombre
     FROM bitacora_eventos b
     JOIN usuarios u ON u.id = b.usuario_id
     LEFT JOIN secciones s ON s.id = b.seccion_id
     WHERE b.campana_id=$1 AND b.tipo='pendiente' AND b.estado != 'resuelto'
     ORDER BY CASE b.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, b.creado_en ASC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/bitacora — registro rápido (el formulario corto)
// ═══════════════════════════════════════════════════════════════
const esquemaEvento = z.object({
  // 🆕 AMPLIADO — mismos 8 tipos nuevos que ETIQUETA_TIPO/ICONO_TIPO.
  tipo: z.enum([
    'recorrido', 'reunion', 'incidencia', 'pendiente', 'nota',
    'visita', 'evento', 'asignacion', 'cambio_responsable', 'tarea', 'seguimiento', 'evidencia', 'otro',
  ]),
  titulo: z.string().min(3).max(200),
  descripcion: z.string().max(2000).optional(),
  // 🆕 CORREGIDO — se llama 'seccion_numero' (el número real de la
  // sección, ej. 034, que es lo único que la persona en campo conoce
  // y lo que teclea en el formulario). El id interno de la tabla
  // secciones se resuelve aquí abajo, nunca se le pide a la persona
  // ni se manda desde el frontend — mismo criterio que incidencias.js.
  seccion_numero: z.number().int().optional(),
  municipio_id: z.number().int().optional(),
  prioridad: z.enum(['baja', 'media', 'alta']).optional(),
  ubicacion_lat: z.number().optional(),
  ubicacion_lng: z.number().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaEvento.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;
  if (d.tipo === 'pendiente' && !d.prioridad) d.prioridad = 'media';

  // Traduce el número de sección (034) al id interno de la tabla
  // secciones — igual que hace incidencias.js. Si el número no
  // existe en el estado de la campaña, sencillamente se guarda sin
  // sección (nunca se rechaza el registro completo por esto).
  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id || null;
  }

  try {
    const resultado = await query(
      `INSERT INTO bitacora_eventos
        (campana_id, usuario_id, tipo, titulo, descripcion, seccion_id, municipio_id, prioridad, ubicacion_lat, ubicacion_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, tipo, titulo, creado_en`,
      [req.usuario.campana_id, req.usuario.sub, d.tipo, d.titulo, d.descripcion || null,
       seccionId, d.municipio_id || null, d.prioridad || null,
       d.ubicacion_lat ?? null, d.ubicacion_lng ?? null]
    );

    // Si registran una incidencia desde la bitácora, se ESPEJA
    // también en la tabla incidencias (no se duplica el módulo — la
    // bitácora es "dónde se anotó", incidencias sigue siendo la
    // fuente de verdad para el semáforo de secciones). Si algo falla
    // aquí, el evento de bitácora YA quedó guardado — no se pierde.
    if (d.tipo === 'incidencia' && seccionId) {
      try {
        // 🆕 'tipo' usa 'otro' — es el único valor del enum de
        // incidencias.js que no exige más contexto (compra_votos,
        // violencia, irregularidad, etc. necesitarían que la persona
        // ya lo clasificara desde la bitácora, lo cual no pide el
        // formulario corto). 'urgencia' sí puede tomar directo la
        // prioridad elegida — 'baja'/'media'/'alta' son valores
        // válidos en ambas tablas.
        const incidencia = await query(
          `INSERT INTO incidencias (campana_id, seccion_id, tipo, urgencia, descripcion, reportado_por, estado)
           VALUES ($1,$2,'otro',$3,$4,$5,'activa') RETURNING id`,
          [req.usuario.campana_id, seccionId, d.prioridad || 'media', d.descripcion || d.titulo, req.usuario.sub]
        );
        await query(`UPDATE bitacora_eventos SET vinculado_tipo='incidencia', vinculado_id=$1 WHERE id=$2`, [incidencia.rows[0].id, resultado.rows[0].id]);
      } catch (e) {
        console.error('No se pudo espejar la incidencia (el evento de bitácora sí se guardó):', e.message);
      }
    }

    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (e) {
    console.error('Error guardando evento de bitácora:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/bitacora/:id/resolver — marcar un pendiente como
// resuelto (o pasarlo a "en_proceso").
// ═══════════════════════════════════════════════════════════════
const esquemaResolver = z.object({
  estado: z.enum(['en_proceso', 'resuelto']),
  nota_resolucion: z.string().max(1000).optional(),
});

router.patch('/:id/resolver', async (req, res) => {
  const parseado = esquemaResolver.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const resultado = await query(
    `UPDATE bitacora_eventos
     SET estado=$1, nota_resolucion=$2,
         resuelto_en = CASE WHEN $1='resuelto' THEN now() ELSE resuelto_en END,
         resuelto_por = CASE WHEN $1='resuelto' THEN $3 ELSE resuelto_por END
     WHERE id=$4 AND campana_id=$5 AND tipo='pendiente'
     RETURNING id, titulo, estado`,
    [d.estado, d.nota_resolucion || null, req.usuario.sub, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Pendiente no encontrado' });

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'editar', tabla: 'bitacora_eventos', registroId: req.params.id,
    detalle: { nuevo_estado: d.estado }, ip: req.ip,
  });

  res.json({ ok: true, data: resultado.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/bitacora/:id — solo quien lo creó, o un mando alto,
// puede borrar un evento (nunca se borra silenciosamente).
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const evento = await query('SELECT usuario_id FROM bitacora_eventos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!evento.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const esDueno = evento.rows[0].usuario_id === req.usuario.sub;
  const esMandoAlto = ['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol);
  if (!esDueno && !esMandoAlto) {
    return res.status(403).json({ ok: false, error: 'Solo quien lo registró, o un mando alto, puede borrarlo' });
  }

  await query('DELETE FROM bitacora_eventos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/bitacora/cierre-jornada — cierra el día con un resumen.
// Un solo cierre por usuario/día (si ya cerró, regresa 409 — no se
// sobreescribe el cierre anterior sin querer).
// ═══════════════════════════════════════════════════════════════
const esquemaCierre = z.object({
  resumen: z.string().max(2000).optional(),
});

router.post('/cierre-jornada', async (req, res) => {
  const parseado = esquemaCierre.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });

  const hoy = new Date().toISOString().slice(0, 10);
  const yaCerro = await query(
    `SELECT id FROM bitacora_eventos WHERE campana_id=$1 AND usuario_id=$2 AND tipo='cierre_jornada' AND creado_en::date=$3`,
    [req.usuario.campana_id, req.usuario.sub, hoy]
  );
  if (yaCerro.rows.length > 0) {
    return res.status(409).json({ ok: false, error: 'Ya cerraste la jornada de hoy' });
  }

  // Conteo automático del día, para dejarlo grabado en la descripción
  // del cierre (así el cierre sirve como "foto" del día, aunque
  // después se sigan agregando eventos con fecha de hoy).
  const conteo = await query(
    `SELECT tipo, COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND usuario_id=$2 AND creado_en::date=$3 GROUP BY tipo`,
    [req.usuario.campana_id, req.usuario.sub, hoy]
  );
  const resumenConteo = conteo.rows.map((r) => `${ETIQUETA_TIPO[r.tipo]}: ${r.total}`).join(' · ');
  const descripcionFinal = [parseado.data.resumen, resumenConteo].filter(Boolean).join('\n\n');

  const resultado = await query(
    `INSERT INTO bitacora_eventos (campana_id, usuario_id, tipo, titulo, descripcion)
     VALUES ($1,$2,'cierre_jornada','Cierre de jornada',$3) RETURNING id, creado_en`,
    [req.usuario.campana_id, req.usuario.sub, descripcionFinal || null]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 sub-fase 1d — GET /api/bitacora/estadisticas
// Gráficas + heatmap para entender el RITMO de la campaña día a día:
// por tipo de registro, por día (últimos 14), por sección, y un
// heatmap día-de-semana × hora-del-día para ver a qué horas/días se
// captura más (útil para planear brigadas).
// ═══════════════════════════════════════════════════════════════
router.get('/estadisticas', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const [porTipoRes, porDiaRes, porSeccionRes, horaDiaRes] = await Promise.all([
    query(
      `SELECT tipo, COUNT(*) as total FROM bitacora_eventos
       WHERE campana_id=$1 AND creado_en > now() - interval '30 days'
       GROUP BY tipo ORDER BY total DESC`,
      [campanaId]
    ),
    query(
      `SELECT creado_en::date as fecha, COUNT(*) as total FROM bitacora_eventos
       WHERE campana_id=$1 AND creado_en > now() - interval '14 days'
       GROUP BY creado_en::date ORDER BY fecha`,
      [campanaId]
    ),
    query(
      `SELECT s.numero as seccion, COUNT(*) as total FROM bitacora_eventos b
       JOIN secciones s ON s.id = b.seccion_id
       WHERE b.campana_id=$1 AND b.creado_en > now() - interval '30 days'
       GROUP BY s.numero ORDER BY total DESC LIMIT 10`,
      [campanaId]
    ),
    // 🆕 Heatmap: día de la semana (0=domingo..6=sábado) × hora del
    // día (0-23) — dónde se concentra la captura en la semana típica.
    query(
      `SELECT EXTRACT(DOW FROM creado_en) as dia_semana, EXTRACT(HOUR FROM creado_en) as hora, COUNT(*) as total
       FROM bitacora_eventos WHERE campana_id=$1 AND creado_en > now() - interval '30 days'
       GROUP BY dia_semana, hora`,
      [campanaId]
    ),
  ]);

  const porTipo = porTipoRes.rows.map((r) => ({ tipo: r.tipo, etiqueta: ETIQUETA_TIPO[r.tipo] || r.tipo, icono: ICONO_TIPO[r.tipo] || '📄', total: parseInt(r.total) }));
  const porDia = porDiaRes.rows.map((r) => ({ fecha: r.fecha, total: parseInt(r.total) }));
  const porSeccion = porSeccionRes.rows.map((r) => ({ seccion: r.seccion, total: parseInt(r.total) }));

  // Heatmap como matriz 7×24 (0 si no hubo registros esa celda)
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  horaDiaRes.rows.forEach((r) => {
    heatmap[parseInt(r.dia_semana)][parseInt(r.hora)] = parseInt(r.total);
  });

  res.json({ ok: true, data: { por_tipo: porTipo, por_dia: porDia, por_seccion: porSeccion, heatmap_dia_hora: heatmap } });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 sub-fase 1d — GET /api/bitacora/analizar-jornada (IA)
// Mismo patrón que /api/reportes/resumen-ejecutivo-ia: solo usa
// números reales de la bitácora de HOY, nunca inventa cifras.
// ═══════════════════════════════════════════════════════════════
router.get('/analizar-jornada', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const hoy = new Date().toISOString().slice(0, 10);

  const [eventosHoyRes, porTipoRes, pendientesAbiertosRes, incidenciasRes] = await Promise.all([
    query(`SELECT COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND creado_en::date=$2::date`, [campanaId, hoy]),
    query(`SELECT tipo, COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND creado_en::date=$2::date GROUP BY tipo`, [campanaId, hoy]),
    query(`SELECT COUNT(*) as total FROM bitacora_eventos WHERE campana_id=$1 AND tipo='pendiente' AND estado != 'resuelto'`, [campanaId]),
    query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE urgencia IN ('urgente','alta')) as urgentes FROM incidencias WHERE campana_id=$1 AND estado != 'resuelta'`, [campanaId]),
  ]);

  const datosParaIA = {
    fecha: hoy,
    total_eventos_hoy: parseInt(eventosHoyRes.rows[0].total),
    por_tipo_hoy: porTipoRes.rows.reduce((acc, r) => ({ ...acc, [ETIQUETA_TIPO[r.tipo] || r.tipo]: parseInt(r.total) }), {}),
    pendientes_abiertos_total: parseInt(pendientesAbiertosRes.rows[0].total),
    incidencias_abiertas_total: parseInt(incidenciasRes.rows[0].total),
    incidencias_urgentes: parseInt(incidenciasRes.rows[0].urgentes),
  };

  try {
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Eres analista de campana politica en Mexico. Con estos datos REALES de la bitacora de HOY de una campana, escribe un analisis breve de 2-3 parrafos cortos, en espanol claro, dirigido al candidato o coordinador.

Datos de hoy:
${JSON.stringify(datosParaIA, null, 2)}

Estructura sugerida:
1. Que tan activa estuvo la jornada (cuanto se registro, de que tipo).
2. Si hay pendientes o incidencias abiertas, explica que implican y si urge atenderlas.
3. Una recomendacion concreta para manana.

Reglas OBLIGATORIAS:
- Usa UNICAMENTE los numeros del JSON, nunca inventes una cifra.
- Si un numero es 0, dilo con naturalidad (ej. "no hubo incidencias hoy"), no lo omitas.
- Se directo, no autocomplaciente.`,
      }],
    });
    const texto = respuesta.content[0]?.text || '';
    res.json({ ok: true, data: { analisis: texto, datos_usados: datosParaIA } });
  } catch (e) {
    console.error('Error analizando jornada con IA:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar el análisis. Intenta de nuevo.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🆕 sub-fase 1d — GET /api/bitacora/detectar-inconsistencias
// Mismo espíritu que /api/reportes/auditoria-inconsistencias, pero
// enfocado en la bitácora: pendientes olvidados, posibles registros
// duplicados, y secciones mencionadas sin responsable asignado.
// ═══════════════════════════════════════════════════════════════
router.get('/detectar-inconsistencias', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const [pendientesViejos, duplicadosPosibles, seccionesSinResponsable] = await Promise.all([
    // Pendientes abiertos hace más de 3 días — se están "enfriando"
    query(
      `SELECT titulo, prioridad, creado_en FROM bitacora_eventos
       WHERE campana_id=$1 AND tipo='pendiente' AND estado != 'resuelto' AND creado_en < now() - interval '3 days'
       ORDER BY creado_en ASC LIMIT 20`,
      [campanaId]
    ),
    // Mismo usuario, mismo tipo, mismo título, en menos de 5 minutos — probable doble captura
    query(
      `SELECT b1.titulo, b1.tipo, u.nombre as usuario_nombre, COUNT(*) as total
       FROM bitacora_eventos b1
       JOIN bitacora_eventos b2 ON b2.campana_id = b1.campana_id AND b2.usuario_id = b1.usuario_id
         AND b2.titulo = b1.titulo AND b2.tipo = b1.tipo AND b2.id != b1.id
         AND ABS(EXTRACT(EPOCH FROM (b2.creado_en - b1.creado_en))) < 300
       JOIN usuarios u ON u.id = b1.usuario_id
       WHERE b1.campana_id=$1 AND b1.creado_en > now() - interval '30 days'
       GROUP BY b1.titulo, b1.tipo, u.nombre
       LIMIT 20`,
      [campanaId]
    ).catch(() => ({ rows: [] })),
    // Secciones que aparecen en la bitácora pero sin nadie de la estructura asignado a esa sección
    query(
      `SELECT DISTINCT s.numero FROM bitacora_eventos b
       JOIN secciones s ON s.id = b.seccion_id
       WHERE b.campana_id=$1 AND NOT EXISTS (
         SELECT 1 FROM usuarios u WHERE u.campana_id=$1 AND u.territorio_tipo='seccion' AND u.territorio_id=s.numero AND u.activo != false
       ) LIMIT 20`,
      [campanaId]
    ).catch(() => ({ rows: [] })),
  ]);

  const hallazgos = [];
  if (pendientesViejos.rows.length > 0) {
    hallazgos.push({
      nivel: 'IMPORTANTE', modulo: 'Bitácora', que: `${pendientesViejos.rows.length} pendiente(s) llevan más de 3 días sin resolverse`,
      donde: pendientesViejos.rows.slice(0, 5).map((p) => p.titulo).join(', '),
    });
  }
  if (duplicadosPosibles.rows.length > 0) {
    hallazgos.push({
      nivel: 'ATENCIÓN', modulo: 'Bitácora', que: `${duplicadosPosibles.rows.length} posible(s) registro(s) duplicado(s) (mismo título y tipo, capturados en menos de 5 minutos)`,
      donde: duplicadosPosibles.rows.slice(0, 5).map((d) => `"${d.titulo}" por ${d.usuario_nombre}`).join(', '),
    });
  }
  if (seccionesSinResponsable.rows.length > 0) {
    hallazgos.push({
      nivel: 'ATENCIÓN', modulo: 'Bitácora', que: `${seccionesSinResponsable.rows.length} sección(es) mencionadas en la bitácora sin nadie de tu equipo asignado ahí`,
      donde: seccionesSinResponsable.rows.slice(0, 10).map((s) => String(s.numero).padStart(3, '0')).join(', '),
    });
  }

  res.json({ ok: true, data: { hallazgos, total: hallazgos.length, fecha_deteccion: new Date().toISOString() } });
});

export default router;

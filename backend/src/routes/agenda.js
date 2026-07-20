import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as creado_por_nombre
     FROM agenda a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.creado_por
     WHERE a.campana_id = $1
     ORDER BY a.fecha_inicio ASC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaEvento = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(['evento', 'reunion', 'recorrido', 'entrevista']).default('evento'),
  fecha_inicio: z.string(),
  fecha_fin: z.string().optional(),
  lugar: z.string().max(255).optional(),
  seccion_numero: z.number().int().optional(),
  descripcion: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Ficha de la reunión — para que el candidato llegue sabiendo con
  // quién está hablando, no improvisando en la puerta.
  anfitrion_nombre: z.string().max(200).optional(),
  anfitrion_telefono: z.string().max(20).optional(),
  estructura_relacionada: z.string().max(150).optional(),
  duracion_minutos: z.number().int().positive().optional(),
  grupo_social: z.string().max(150).optional(),
  ofrece_aperitivo: z.boolean().optional(),
  detalle_aperitivo: z.string().max(200).optional(),
  personas_esperadas: z.number().int().positive().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaEvento.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  let seccionId = null;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id || null;
  }

  const resultado = await query(
    `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, fecha_fin, lugar, seccion_id, descripcion, creado_por, lat, lng,
       anfitrion_nombre, anfitrion_telefono, estructura_relacionada, duracion_minutos, grupo_social, ofrece_aperitivo, detalle_aperitivo, personas_esperadas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.tipo, d.fecha_inicio, d.fecha_fin || null,
     d.lugar || null, seccionId, d.descripcion || null, req.usuario.sub, d.lat || null, d.lng || null,
     d.anfitrion_nombre || null, d.anfitrion_telefono || null, d.estructura_relacionada || null,
     d.duracion_minutos || null, d.grupo_social || null, d.ofrece_aperitivo || false,
     d.detalle_aperitivo || null, d.personas_esperadas || null]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM agenda WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

const esquemaEditar = z.object({
  titulo: z.string().min(2).max(200).optional(),
  tipo: z.enum(['evento', 'reunion', 'recorrido', 'entrevista']).optional(),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  lugar: z.string().max(255).optional(),
  seccion_numero: z.number().int().optional(),
  descripcion: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  anfitrion_nombre: z.string().max(200).optional(),
  anfitrion_telefono: z.string().max(20).optional(),
  estructura_relacionada: z.string().max(150).optional(),
  duracion_minutos: z.number().int().positive().optional(),
  grupo_social: z.string().max(150).optional(),
  ofrece_aperitivo: z.boolean().optional(),
  detalle_aperitivo: z.string().max(200).optional(),
  personas_esperadas: z.number().int().positive().optional(),
});

/**
 * PATCH /api/agenda/:id
 * Corregir un evento (cambió la hora, el lugar, etc.) sin tener
 * que borrarlo y crearlo de nuevo.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let seccionId;
  if (d.seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [d.seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id;
  }

  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) {
    if (campo === 'seccion_numero') continue;
    campos.push(`${campo}=$${i}`);
    valores.push(valor);
    i++;
  }
  if (seccionId) { campos.push(`seccion_id=$${i}`); valores.push(seccionId); i++; }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });

  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(
    `UPDATE agenda SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * PATCH /api/agenda/:id/completar
 * Marca un evento como realizado — esto es lo que alimenta
 * "reuniones realizadas" como concepto medible, no solo la agenda
 * a futuro.
 */
router.patch('/:id/completar', async (req, res) => {
  const resultado = await query(
    `UPDATE agenda SET realizado = true WHERE id=$1 AND campana_id=$2 RETURNING *`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

// ── TABLERO DE ANUNCIOS INTERNOS — avisos fijos del equipo, no eventos ──
router.get('/anuncios/lista', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, u.nombre as creado_por_nombre FROM anuncios a
     JOIN usuarios u ON u.id = a.creado_por
     WHERE a.campana_id=$1 ORDER BY a.importante DESC, a.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.post('/anuncios/lista', async (req, res) => {
  const { titulo, mensaje, importante } = req.body;
  if (!titulo || !mensaje) return res.status(400).json({ ok: false, error: 'Falta título o mensaje' });
  const resultado = await query(
    `INSERT INTO anuncios (campana_id, titulo, mensaje, importante, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.usuario.campana_id, titulo, mensaje, !!importante, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/anuncios/lista/:id', async (req, res) => {
  await query('DELETE FROM anuncios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

/** Reúne los mismos datos para la vista JSON y para el PDF — una sola fuente de verdad. */
async function reunirFichaTecnica(eventoId, campanaId) {
  const evento = await query(
    `SELECT a.*, s.numero as seccion_numero, m.nombre as municipio, u.nombre as creado_por_nombre
     FROM agenda a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     LEFT JOIN usuarios u ON u.id = a.creado_por
     WHERE a.id=$1 AND a.campana_id=$2`,
    [eventoId, campanaId]
  );
  if (!evento.rows[0]) return null;
  const e = evento.rows[0];

  let fichaSeccion = null, promovidosResumen = null, encuestasResumen = null;

  if (e.seccion_id) {
    const historico = await query(
      `SELECT tipo_eleccion, anio, partido, votos, lista_nominal FROM resultados_historicos
       WHERE seccion_id=$1 ORDER BY anio DESC, votos DESC`,
      [e.seccion_id]
    );
    const porAnio = {};
    historico.rows.forEach((r) => {
      const clave = `${r.tipo_eleccion}_${r.anio}`;
      if (!porAnio[clave]) porAnio[clave] = { tipo_eleccion: r.tipo_eleccion, anio: r.anio, partidos: [], lista_nominal: r.lista_nominal };
      porAnio[clave].partidos.push({ partido: r.partido, votos: r.votos });
    });
    fichaSeccion = Object.values(porAnio).map((a) => ({
      ...a, ganador: a.partidos.sort((x, y) => y.votos - x.votos)[0]?.partido,
    })).slice(0, 3);

    const promos = await query(
      `SELECT clasificacion, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND seccion_id=$2 GROUP BY clasificacion`,
      [campanaId, e.seccion_id]
    );
    promovidosResumen = { total: promos.rows.reduce((s, r) => s + parseInt(r.total), 0), por_clasificacion: promos.rows };

    const encRes = await query(
      `SELECT er.respuestas FROM encuesta_respuestas er
       JOIN encuestas en ON en.id = er.encuesta_id
       WHERE en.campana_id=$1 AND er.seccion_id=$2`,
      [campanaId, e.seccion_id]
    );
    encuestasResumen = { total_respuestas: encRes.rows.length, respuestas: encRes.rows.map((r) => r.respuestas) };
  }

  return { evento: e, ficha_seccion: fichaSeccion, promovidos: promovidosResumen, encuestas: encuestasResumen };
}

/**
 * GET /api/agenda/:id/ficha-tecnica
 * Todo lo que el candidato necesita saber ANTES de llegar: quién es
 * el anfitrión, con qué estructura se relaciona, cuánta gente va a
 * haber, y el contexto real de esa sección (histórico + cuántos
 * promovidos ya tiene ahí + qué dice la gente en las encuestas) —
 * para que no llegue a improvisar, llegue informado.
 */
router.get('/:id/ficha-tecnica', async (req, res) => {
  const datos = await reunirFichaTecnica(req.params.id, req.usuario.campana_id);
  if (!datos) return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  res.json({ ok: true, data: datos });
});

const TIPO_ELECCION_LABEL_AGENDA = { ayuntamiento: 'Ayuntamiento', pres_comunidad: 'Pdte. Comunidad', dip_local: 'Dip. Local', dip_federal: 'Dip. Federal', gobernador: 'Gobernador' };

/**
 * GET /api/agenda/:id/pdf
 * La "tarjeta informativa" en PDF — pensada para leerse en el coche
 * de camino al evento, no como un reporte largo.
 */
router.get('/:id/pdf', async (req, res) => {
  const datos = await reunirFichaTecnica(req.params.id, req.usuario.campana_id);
  if (!datos) return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  const { evento: e, ficha_seccion, promovidos, encuestas } = datos;

  const doc = new PDFDocument({ margin: 45 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=tarjeta_${e.titulo.replace(/\s+/g, '_')}.pdf`);
  doc.pipe(res);

  doc.fontSize(9).fillColor('#94a3b8').text('TARJETA INFORMATIVA — VotoTech', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(18).fillColor('#1e1b4b').font('Helvetica-Bold').text(e.titulo, { align: 'center' });
  doc.fontSize(10).fillColor('#64748b').font('Helvetica').text(
    `${new Date(e.fecha_inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — ${new Date(e.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
    { align: 'center' }
  );
  doc.moveDown(1);
  doc.moveTo(45, doc.y).lineTo(550, doc.y).strokeColor('#e2e8f0').stroke();
  doc.moveDown(0.8);

  const fila = (etiqueta, valor) => { if (!valor) return; doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text(etiqueta, { continued: true }); doc.font('Helvetica').fillColor('#1e293b').text(`  ${valor}`); doc.moveDown(0.3); };

  doc.fontSize(12).fillColor('#4338ca').font('Helvetica-Bold').text('👤 Con quién vas a hablar');
  doc.moveDown(0.3);
  fila('Anfitrión:', e.anfitrion_nombre);
  fila('Teléfono:', e.anfitrion_telefono);
  fila('Estructura:', e.estructura_relacionada);
  fila('Grupo social:', e.grupo_social);
  fila('Personas esperadas:', e.personas_esperadas);
  fila('Duración estimada:', e.duracion_minutos ? `${e.duracion_minutos} minutos` : null);
  fila('Aperitivo:', e.ofrece_aperitivo ? (e.detalle_aperitivo || 'Sí') : 'No');
  fila('Lugar:', e.lugar);
  if (e.descripcion) { doc.moveDown(0.2); doc.fontSize(9).fillColor('#475569').text(e.descripcion, { width: 500 }); }

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#4338ca').font('Helvetica-Bold').text(`📍 Sección ${e.seccion_numero || '—'}${e.municipio ? ` · ${e.municipio}` : ''}`);
  doc.moveDown(0.3);
  if (ficha_seccion && ficha_seccion.length > 0) {
    ficha_seccion.forEach((f) => {
      doc.fontSize(9).fillColor('#1e293b').font('Helvetica').text(
        `${TIPO_ELECCION_LABEL_AGENDA[f.tipo_eleccion] || f.tipo_eleccion} ${f.anio}: ganó ${f.ganador?.toUpperCase()} (lista nominal ${f.lista_nominal?.toLocaleString() || '—'})`
      );
    });
  } else {
    doc.fontSize(9).fillColor('#94a3b8').text('Sin datos históricos para esta sección todavía.');
  }

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#4338ca').font('Helvetica-Bold').text('🗳️ Tu avance ahí');
  doc.moveDown(0.3);
  if (promovidos && promovidos.total > 0) {
    doc.fontSize(9).fillColor('#1e293b').font('Helvetica').text(`${promovidos.total} promovidos capturados en esta sección:`);
    promovidos.por_clasificacion.forEach((p) => doc.text(`  • ${p.clasificacion}: ${p.total}`));
  } else {
    doc.fontSize(9).fillColor('#94a3b8').text('Todavía sin promovidos registrados en esta sección.');
  }

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#4338ca').font('Helvetica-Bold').text('📋 Lo que dice la gente (encuestas)');
  doc.moveDown(0.3);
  if (encuestas && encuestas.total_respuestas > 0) {
    doc.fontSize(9).fillColor('#1e293b').font('Helvetica').text(`${encuestas.total_respuestas} respuestas de encuesta capturadas en esta sección — revisa el detalle completo en Promovidos → Encuestas.`);
  } else {
    doc.fontSize(9).fillColor('#94a3b8').text('Sin respuestas de encuesta en esta sección todavía.');
  }

  doc.end();
});

export default router;

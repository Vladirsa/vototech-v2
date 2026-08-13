import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * 🆕 ¿Puede esta persona aprobar/rechazar una reunión propuesta?
 * SOLO el Candidato y el Secretario Particular (un coord_general con
 * ese puesto específico) — nadie más, para que la agenda del
 * candidato no se llene sin control de cualquier coordinador.
 */
function puedeAprobarAgenda(usuario) {
  if (usuario.rol === 'candidato') return true;
  if (usuario.rol === 'coord_general' && /secretari[oa] particular/i.test(usuario.puesto || '')) return true;
  return false;
}

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, s.numero as seccion_numero, u.nombre as creado_por_nombre,
            p.nombre as propuesto_por_nombre, ap.nombre as aprobado_por_nombre,
            (SELECT COUNT(*) FROM agenda_documentos WHERE evento_id=a.id) as total_documentos,
            (SELECT COUNT(*) FROM agenda_compromisos WHERE evento_id=a.id AND completado=false) as compromisos_pendientes
     FROM agenda a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN usuarios u ON u.id = a.creado_por
     LEFT JOIN usuarios p ON p.id = a.propuesto_por
     LEFT JOIN usuarios ap ON ap.id = a.aprobado_por
     WHERE a.campana_id = $1
     ORDER BY a.fecha_inicio ASC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows, puede_aprobar: puedeAprobarAgenda(req.usuario) });
});

const COLORES_VALIDOS = ['indigo', 'emerald', 'amber', 'red', 'purple', 'pink', 'cyan', 'slate'];

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
  anfitrion_nombre: z.string().max(200).optional(),
  anfitrion_telefono: z.string().max(20).optional(),
  estructura_relacionada: z.string().max(150).optional(),
  duracion_minutos: z.number().int().positive().optional(),
  grupo_social: z.string().max(150).optional(),
  ofrece_aperitivo: z.boolean().optional(),
  detalle_aperitivo: z.string().max(200).optional(),
  personas_esperadas: z.number().int().positive().optional(),
  color_alerta: z.enum(COLORES_VALIDOS).optional(),
  etiquetas: z.array(z.string()).default([]),
  responsable_nombres: z.string().max(150).optional(),
  responsable_apellido_paterno: z.string().max(80).optional(),
  responsable_apellido_materno: z.string().max(80).optional(),
  referencias_ubicacion: z.string().max(300).optional(),
  tipo_lugar: z.enum(['calle', 'auditorio', 'deportivo', 'parque', 'otro']).optional(),
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

  const puedeAprobarDirecto = puedeAprobarAgenda(req.usuario);
  const estado = puedeAprobarDirecto ? 'confirmado' : 'propuesto';

  const resultado = await query(
    `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, fecha_fin, lugar, seccion_id, descripcion, creado_por, lat, lng,
       anfitrion_nombre, anfitrion_telefono, estructura_relacionada, duracion_minutos, grupo_social, ofrece_aperitivo, detalle_aperitivo, personas_esperadas,
       color_alerta, etiquetas, responsable_nombres, responsable_apellido_paterno, responsable_apellido_materno, referencias_ubicacion, tipo_lugar,
       estado, propuesto_por, aprobado_por, aprobado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.tipo, d.fecha_inicio, d.fecha_fin || null,
     d.lugar || null, seccionId, d.descripcion || null, req.usuario.sub, d.lat || null, d.lng || null,
     d.anfitrion_nombre || null, d.anfitrion_telefono || null, d.estructura_relacionada || null,
     d.duracion_minutos || null, d.grupo_social || null, d.ofrece_aperitivo || false,
     d.detalle_aperitivo || null, d.personas_esperadas || null,
     d.color_alerta || null, d.etiquetas, d.responsable_nombres || null, d.responsable_apellido_paterno || null,
     d.responsable_apellido_materno || null, d.referencias_ubicacion || null, d.tipo_lugar || null,
     estado, puedeAprobarDirecto ? null : req.usuario.sub, puedeAprobarDirecto ? req.usuario.sub : null, puedeAprobarDirecto ? new Date() : null]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/aprobar', async (req, res) => {
  if (!puedeAprobarAgenda(req.usuario)) {
    return res.status(403).json({ ok: false, error: 'Solo el Candidato o el Secretario Particular pueden aprobar reuniones.' });
  }
  const resultado = await query(
    `UPDATE agenda SET estado='confirmado', aprobado_por=$1, aprobado_en=now()
     WHERE id=$2 AND campana_id=$3 RETURNING *`,
    [req.usuario.sub, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/rechazar', async (req, res) => {
  if (!puedeAprobarAgenda(req.usuario)) {
    return res.status(403).json({ ok: false, error: 'Solo el Candidato o el Secretario Particular pueden rechazar reuniones.' });
  }
  const { motivo } = req.body;
  const resultado = await query(
    `UPDATE agenda SET estado='cancelado', aprobado_por=$1, aprobado_en=now(), motivo_cancelacion=$2
     WHERE id=$3 AND campana_id=$4 RETURNING *`,
    [req.usuario.sub, motivo || null, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM agenda WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

const esquemaEditar = esquemaEvento.partial();

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

router.patch('/:id/completar', async (req, res) => {
  const resultado = await query(
    `UPDATE agenda SET realizado = true WHERE id=$1 AND campana_id=$2 RETURNING *`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

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

router.get('/tiempos-traslado', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  const eventos = await query(
    `SELECT id, titulo, fecha_inicio, lat, lng FROM agenda
     WHERE campana_id=$1 AND fecha_inicio::date=$2 AND estado != 'cancelado' AND lat IS NOT NULL AND lng IS NOT NULL
     ORDER BY fecha_inicio ASC`,
    [req.usuario.campana_id, fecha]
  );

  const llave = process.env.ORS_API_KEY;
  const tramos = [];
  for (let i = 1; i < eventos.rows.length; i++) {
    const anterior = eventos.rows[i - 1];
    const actual = eventos.rows[i];
    let minutos = null, fuente = 'estimado';

    if (llave) {
      try {
        const respuesta = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
          method: 'POST',
          headers: { Authorization: llave, 'Content-Type': 'application/json' },
          body: JSON.stringify({ coordinates: [[anterior.lng, anterior.lat], [actual.lng, actual.lat]] }),
        });
        if (respuesta.ok) {
          const datos = await respuesta.json();
          minutos = Math.round(datos.routes[0].summary.duration / 60);
          fuente = 'real';
        }
      } catch (e) { /* usa el respaldo de abajo */ }
    }
    if (minutos === null) {
      const R = 6371;
      const dLat = (actual.lat - anterior.lat) * Math.PI / 180;
      const dLng = (actual.lng - anterior.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(anterior.lat * Math.PI / 180) * Math.cos(actual.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      minutos = Math.round((km / 30) * 60);
    }

    const minutosDisponibles = Math.round((new Date(actual.fecha_inicio) - new Date(anterior.fecha_inicio)) / 60000);
    tramos.push({
      de: anterior.titulo, a: actual.titulo, minutos_traslado: minutos, fuente,
      minutos_disponibles: minutosDisponibles,
      riesgo: minutosDisponibles < minutos ? 'alto' : minutosDisponibles < minutos + 10 ? 'medio' : 'bajo',
    });
  }
  res.json({ ok: true, data: tramos });
});

router.get('/:id/documentos', async (req, res) => {
  const resultado = await query(
    `SELECT d.*, u.nombre as subido_por_nombre FROM agenda_documentos d
     LEFT JOIN usuarios u ON u.id = d.subido_por WHERE d.evento_id=$1 ORDER BY d.creado_en DESC`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows });
});
router.post('/:id/documentos', upload.single('archivo'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });

  const ruta = `${req.usuario.campana_id}/agenda-documentos/${crypto.randomBytes(8).toString('hex')}-${req.file.originalname}`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir el archivo' });
  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);

  const resultado = await query(
    `INSERT INTO agenda_documentos (evento_id, nombre_archivo, url, subido_por) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, req.file.originalname, urlData.publicUrl, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});
router.delete('/documentos/:docId', async (req, res) => {
  await query('DELETE FROM agenda_documentos WHERE id=$1', [req.params.docId]);
  res.json({ ok: true });
});

router.get('/:id/compromisos', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, r.nombre as responsable_nombre FROM agenda_compromisos c
     LEFT JOIN usuarios r ON r.id = c.responsable_id WHERE c.evento_id=$1 ORDER BY c.completado, c.fecha_limite`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows });
});
router.post('/:id/compromisos', async (req, res) => {
  const { descripcion, responsable_id, fecha_limite } = req.body;
  if (!descripcion) return res.status(400).json({ ok: false, error: 'Falta la descripción del compromiso' });
  const resultado = await query(
    `INSERT INTO agenda_compromisos (evento_id, campana_id, descripcion, responsable_id, fecha_limite, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.usuario.campana_id, descripcion, responsable_id || null, fecha_limite || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});
router.patch('/compromisos/:compId/completar', async (req, res) => {
  const resultado = await query(
    `UPDATE agenda_compromisos SET completado=true, completado_en=now() WHERE id=$1 RETURNING *`,
    [req.params.compId]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});
router.delete('/compromisos/:compId', async (req, res) => {
  await query('DELETE FROM agenda_compromisos WHERE id=$1', [req.params.compId]);
  res.json({ ok: true });
});

router.get('/compromisos-pendientes', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, r.nombre as responsable_nombre, a.titulo as evento_titulo
     FROM agenda_compromisos c
     LEFT JOIN usuarios r ON r.id = c.responsable_id
     JOIN agenda a ON a.id = c.evento_id
     WHERE c.campana_id=$1 AND c.completado=false
     ORDER BY c.fecha_limite ASC NULLS LAST`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/exportar-ine', async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  let filtroFecha = '';
  const params = [req.usuario.campana_id];
  if (fecha_inicio && fecha_fin) {
    filtroFecha = `AND a.fecha_inicio::date BETWEEN $2 AND $3`;
    params.push(fecha_inicio, fecha_fin);
  }
  const eventos = await query(
    `SELECT a.*, s.numero as seccion_numero, m.nombre as municipio, s.distrito_local, s.distrito_federal
     FROM agenda a
     LEFT JOIN secciones s ON s.id = a.seccion_id
     LEFT JOIN municipios m ON m.id = s.municipio_id
     WHERE a.campana_id=$1 AND a.estado='confirmado' ${filtroFecha}
     ORDER BY a.fecha_inicio ASC`,
    params
  );

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Agenda de Eventos SIF');
  hoja.columns = [
    { header: 'Fecha del evento', key: 'fecha', width: 14 },
    { header: 'Hora inicio (24h)', key: 'hora_inicio', width: 14 },
    { header: 'Hora fin (24h)', key: 'hora_fin', width: 14 },
    { header: 'Tipo de evento', key: 'tipo', width: 18 },
    { header: 'Nombre(s) del Responsable', key: 'resp_nombres', width: 20 },
    { header: 'Primer Apellido del Responsable', key: 'resp_paterno', width: 20 },
    { header: 'Segundo Apellido (opcional)', key: 'resp_materno', width: 20 },
    { header: 'Entidad', key: 'entidad', width: 12 },
    { header: 'Municipio', key: 'municipio', width: 22 },
    { header: 'Distrito Local', key: 'distrito_local', width: 12 },
    { header: 'Distrito Federal', key: 'distrito_federal', width: 12 },
    { header: 'Dirección', key: 'direccion', width: 30 },
    { header: 'Referencias', key: 'referencias', width: 30 },
    { header: 'Lugar exacto', key: 'lugar_exacto', width: 16 },
  ];
  const TIPO_LUGAR_LABEL = { calle: 'Calle', auditorio: 'Auditorio', deportivo: 'Deportivo', parque: 'Parque', otro: 'Otro' };
  eventos.rows.forEach((e) => {
    hoja.addRow({
      fecha: new Date(e.fecha_inicio).toLocaleDateString('es-MX'),
      hora_inicio: new Date(e.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
      hora_fin: e.fecha_fin ? new Date(e.fecha_fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      tipo: e.tipo,
      resp_nombres: e.responsable_nombres || '',
      resp_paterno: e.responsable_apellido_paterno || '',
      resp_materno: e.responsable_apellido_materno || '',
      entidad: 'Tlaxcala',
      municipio: e.municipio || '',
      distrito_local: e.distrito_local || '',
      distrito_federal: e.distrito_federal || '',
      direccion: e.lugar || '',
      referencias: e.referencias_ubicacion || '',
      lugar_exacto: TIPO_LUGAR_LABEL[e.tipo_lugar] || '',
    });
  });
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  hoja.getRow(1).height = 24;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=agenda_ine_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

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

router.get('/:id/ficha-tecnica', async (req, res) => {
  const datos = await reunirFichaTecnica(req.params.id, req.usuario.campana_id);
  if (!datos) return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  res.json({ ok: true, data: datos });
});

const TIPO_ELECCION_LABEL_AGENDA = { ayuntamiento: 'Ayuntamiento', pres_comunidad: 'Pdte. Comunidad', dip_local: 'Dip. Local', dip_federal: 'Dip. Federal', gobernador: 'Gobernador' };

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

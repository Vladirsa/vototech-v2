import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 🆕 QUITADO — el envío automático por Twilio (WhatsApp Business API)
// se eliminó por completo. Mandar mensajes de campaña a gente que
// nunca dio opt-in específico de WhatsApp (distinto al consentimiento
// de privacidad LFPDPPP) es justo lo que Meta sanciona con
// suspensión de cuenta. El modo de enlaces (wa.me, cada persona del
// equipo manda desde su propio WhatsApp) es el único que se queda —
// imita cómo ya opera de verdad una campaña real, sin ese riesgo.

// ═══════════════════════════════════════════════════════════════
// PLANTILLAS
// ═══════════════════════════════════════════════════════════════

router.get('/plantillas', async (req, res) => {
  const resultado = await query('SELECT * FROM marketing_plantillas WHERE campana_id=$1 ORDER BY creado_en DESC', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaPlantilla = z.object({
  categoria: z.enum(['motivacional', 'informativo', 'recordatorio', 'urgente']).default('informativo'),
  titulo: z.string().min(2).max(150),
  mensaje: z.string().min(2).max(2000),
});

router.post('/plantillas', async (req, res) => {
  const parseado = esquemaPlantilla.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO marketing_plantillas (campana_id, categoria, titulo, mensaje) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.usuario.campana_id, d.categoria, d.titulo, d.mensaje]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/plantillas/:id', async (req, res) => {
  await query('DELETE FROM marketing_plantillas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// AUDIENCIA
// ═══════════════════════════════════════════════════════════════

async function calcularAudiencia(campanaId, tipo, filtros = {}, estadoId = 29) {
  if (tipo === 'promovidos') {
    let sql = `SELECT p.id, p.nombre, p.telefono FROM promovidos p WHERE p.campana_id=$1 AND p.telefono IS NOT NULL AND p.telefono != ''`;
    const params = [campanaId];
    if (filtros.clasificacion) { params.push(filtros.clasificacion); sql += ` AND p.clasificacion=$${params.length}`; }
    if (filtros.seccion_numero) {
      params.push(filtros.seccion_numero);
      params.push(estadoId);
      sql += ` AND p.seccion_id = (SELECT id FROM secciones WHERE estado_id=$${params.length} AND numero=$${params.length - 1})`;
    }
    if (filtros.partido) { params.push(filtros.partido); sql += ` AND p.partido=$${params.length}`; }
    if (filtros.comprometido !== undefined) { params.push(filtros.comprometido); sql += ` AND p.comprometido=$${params.length}`; }
    // 🆕 Filtros nuevos — necesarios para que los segmentos sugeridos
    // (ver /segmentos-sugeridos) se puedan aplicar de verdad al mandar.
    if (filtros.temperatura) { params.push(filtros.temperatura); sql += ` AND p.temperatura=$${params.length}`; }
    if (filtros.ya_voto !== undefined) { params.push(filtros.ya_voto); sql += ` AND p.ya_voto=$${params.length}`; }
    if (filtros.dias_sin_contacto_min) { params.push(filtros.dias_sin_contacto_min); sql += ` AND p.creado_en < now() - ($${params.length}::text || ' days')::interval`; }
    const r = await query(sql, params);
    return r.rows;
  }
  if (tipo === 'estructura') {
    let sql = `SELECT id, nombre, telefono FROM usuarios WHERE campana_id=$1 AND telefono IS NOT NULL AND telefono != '' AND activo != false`;
    const params = [campanaId];
    if (filtros.rol) { params.push(filtros.rol); sql += ` AND rol=$${params.length}`; }
    if (filtros.solo_promotores) { sql += ` AND rol='promotor'`; }
    const r = await query(sql, params);
    return r.rows;
  }
  return [];
}

router.post('/audiencia/previsualizar', async (req, res) => {
  const { tipo, filtros } = req.body;
  if (!['promovidos', 'estructura'].includes(tipo)) return res.status(400).json({ ok: false, error: 'Tipo de audiencia inválido' });
  const gente = await calcularAudiencia(req.usuario.campana_id, tipo, filtros || {}, req.usuario.estado_id);
  res.json({ ok: true, total: gente.length, muestra: gente.slice(0, 5) });
});

/**
 * 🆕 GET /api/marketing/segmentos-sugeridos
 * El "asesor de segmentos" — en vez de armar un filtro a ciegas,
 * analiza tus promovidos reales y sugiere A QUIÉN conviene mandarle
 * QUÉ TIPO de mensaje, con la razón — para mejor eficiencia en vez
 * de mandar el mismo mensaje a todos por igual.
 */
router.get('/segmentos-sugeridos', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const definiciones = [
    {
      id: 'base_sin_comprometer',
      nombre: 'Base sin comprometer todavía',
      razon: 'Ya se identificaron como afines, pero no han confirmado su voto — el mensaje correcto es invitarlos a comprometerse, no venderles el candidato desde cero.',
      tipo_mensaje_sugerido: 'mensaje_dia',
      filtro: { clasificacion: 'base', comprometido: false },
    },
    {
      id: 'persuadibles',
      nombre: 'Persuadibles',
      razon: 'Todavía no decidieron — aquí sí conviene un mensaje con argumentos y propuestas concretas, no solo una invitación.',
      tipo_mensaje_sugerido: 'argumentario',
      filtro: { clasificacion: 'persuadible' },
    },
    {
      id: 'calientes_sin_comprometer',
      nombre: 'Temperatura caliente, sin comprometer',
      razon: 'Mostraron mucho interés en persona pero todavía no se registran como comprometidos — están listos para un mensaje directo de cierre, no de introducción.',
      tipo_mensaje_sugerido: 'mensaje_dia',
      filtro: { temperatura: 'caliente', comprometido: false },
    },
    {
      id: 'comprometidos_sin_contacto',
      nombre: 'Comprometidos, sin contacto en 15+ días',
      razon: 'Ya dijeron que sí, pero lleva tiempo sin haber ningún seguimiento — se enfrían solos si se les deja de lado. Conviene un mensaje de reactivación, recordándoles que sigues contando con ellos.',
      tipo_mensaje_sugerido: 'storytelling',
      filtro: { comprometido: true, dias_sin_contacto_min: 15 },
    },
    {
      id: 'comprometidos_sin_voto_confirmado',
      nombre: 'Comprometidos que no han confirmado su voto',
      razon: 'El grupo más importante para el día de la elección — ya están comprometidos, falta el empujón final para que de verdad vayan a votar.',
      tipo_mensaje_sugerido: 'mensaje_dia',
      filtro: { comprometido: true, ya_voto: false },
    },
  ];

  const segmentos = await Promise.all(definiciones.map(async (def) => {
    const gente = await calcularAudiencia(campanaId, 'promovidos', def.filtro, req.usuario.estado_id);
    return { ...def, total: gente.length };
  }));

  // Solo se muestran los segmentos que de verdad tienen gente — no
  // tiene sentido sugerir mandarle algo a 0 personas.
  res.json({ ok: true, data: segmentos.filter((s) => s.total > 0).sort((a, b) => b.total - a.total) });
});

// ═══════════════════════════════════════════════════════════════
// ENVÍOS MASIVOS
// ═══════════════════════════════════════════════════════════════

router.get('/envios', async (req, res) => {
  const resultado = await query(
    `SELECT id, titulo, modo, audiencia_tipo, total, enviados, fallidos, estado, creado_en FROM marketing_envios
     WHERE campana_id=$1 ORDER BY creado_en DESC LIMIT 50`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/envios/:id', async (req, res) => {
  const resultado = await query('SELECT * FROM marketing_envios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

function rellenarVariables(plantilla, persona) {
  return plantilla.replace(/\{nombre\}/gi, persona.nombre?.split(' ')[0] || '');
}

const esquemaEnvio = z.object({
  titulo: z.string().min(2).max(150),
  modo: z.enum(['enlace']).default('enlace'),
  plantilla_id: z.string().uuid().optional(),
  mensaje_base: z.string().min(2).max(2000),
  audiencia_tipo: z.enum(['promovidos', 'estructura']),
  audiencia_filtro: z.record(z.any()).default({}),
  // 🆕 Enlaces de imágenes ya subidas (con /subir-imagen-envio) — se
  // agregan al final del mensaje de cada persona, para que WhatsApp
  // muestre su vista previa sola.
  imagenes: z.array(z.string().url()).max(5).default([]),
});

/**
 * 🆕 POST /api/marketing/subir-imagen-envio
 * Sube una imagen para incluir en un mensaje de WhatsApp — como los
 * enlaces (wa.me) solo mandan texto, la imagen se sube a un lugar
 * público y su enlace se pega en el mensaje. WhatsApp muestra sola
 * una vista previa bonita de esa imagen, aunque técnicamente sea un
 * link de texto, no un archivo adjunto real.
 */
router.post('/subir-imagen-envio', upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna imagen' });
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  const ruta = `${req.usuario.campana_id}/envios-whatsapp/${crypto.randomBytes(8).toString('hex')}-${req.file.originalname}`;
  const { error } = await supabase.storage.from('blog-publico').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la imagen' });
  const url = supabase.storage.from('blog-publico').getPublicUrl(ruta).data.publicUrl;
  res.status(201).json({ ok: true, data: { url } });
});

router.post('/envios', async (req, res) => {
  const parseado = esquemaEnvio.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const gente = await calcularAudiencia(req.usuario.campana_id, d.audiencia_tipo, d.audiencia_filtro, req.usuario.estado_id);
  if (gente.length === 0) return res.status(400).json({ ok: false, error: 'No hay destinatarios con ese filtro (revisa que tengan teléfono registrado)' });

  const destinatarios = gente.map((p) => ({
    id: p.id, nombre: p.nombre, telefono: p.telefono,
    // 🆕 Las imágenes se agregan como enlaces al final del mensaje
    // (uno por línea) — WhatsApp les muestra su vista previa sola.
    mensaje: rellenarVariables(d.mensaje_base, p) + (d.imagenes.length > 0 ? '\n\n' + d.imagenes.join('\n') : ''),
    estado: 'pendiente', enviado_en: null, enviado_por: null, numero_usado: null,
  }));

  // 🆕 Ahora es el ÚNICO modo — cada persona de tu equipo abre su
  // propio WhatsApp y toca cada enlace. Se quitó el envío automático
  // (era el riesgo real de que Meta suspendiera el número por mandar
  // a gente sin opt-in específico de WhatsApp).
  const envioRes = await query(
    `INSERT INTO marketing_envios (campana_id, titulo, modo, plantilla_id, mensaje_base, audiencia_tipo, audiencia_filtro, destinatarios, total, estado, creado_por)
     VALUES ($1,$2,'enlace',$3,$4,$5,$6,$7,$8,'completado',$9) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.plantilla_id || null, d.mensaje_base, d.audiencia_tipo, JSON.stringify(d.audiencia_filtro), JSON.stringify(destinatarios), destinatarios.length, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: envioRes.rows[0] });
});

router.patch('/envios/:id/marcar/:destinatarioId', async (req, res) => {
  const envioRes = await query('SELECT * FROM marketing_envios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!envioRes.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const envio = envioRes.rows[0];
  const lista = envio.destinatarios;
  const persona = lista.find((p) => p.id === req.params.destinatarioId);
  if (!persona) return res.status(404).json({ ok: false, error: 'Destinatario no encontrado en este envío' });

  persona.estado = 'enviado';
  persona.enviado_en = new Date().toISOString();
  persona.enviado_por = req.usuario.nombre;

  const enviados = lista.filter((p) => p.estado === 'enviado').length;
  const estadoGeneral = enviados === lista.length ? 'completado' : 'en_progreso';

  await query(`UPDATE marketing_envios SET destinatarios=$1, enviados=$2, estado=$3 WHERE id=$4`, [JSON.stringify(lista), enviados, estadoGeneral, envio.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 BASE DE PERIODISTAS
// ═══════════════════════════════════════════════════════════════

router.get('/periodistas', async (req, res) => {
  const resultado = await query('SELECT * FROM periodistas WHERE campana_id=$1 ORDER BY nombre', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaPeriodista = z.object({
  nombre: z.string().min(2).max(200),
  medio: z.string().max(200).optional(),
  tipo_medio: z.enum(['prensa', 'radio', 'tv', 'digital']).default('digital'),
  telefono: z.string().max(20).optional(),
  email: z.string().email().max(150).optional().or(z.literal('')),
  notas: z.string().max(500).optional(),
});

router.post('/periodistas', async (req, res) => {
  const parseado = esquemaPeriodista.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO periodistas (campana_id, nombre, medio, tipo_medio, telefono, email, notas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.usuario.campana_id, d.nombre, d.medio || null, d.tipo_medio, d.telefono || null, d.email || null, d.notas || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/periodistas/:id', async (req, res) => {
  const parseado = esquemaPeriodista.partial().safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) { campos.push(`${campo}=$${i++}`); valores.push(valor); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE periodistas SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/periodistas/:id', async (req, res) => {
  await query('DELETE FROM periodistas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 BOLETINES DE PRENSA
// ═══════════════════════════════════════════════════════════════

router.get('/boletines', async (req, res) => {
  const resultado = await query(
    `SELECT b.*, u.nombre as creado_por_nombre,
            (SELECT COUNT(*) FROM boletines_envios WHERE boletin_id=b.id) as total_enviados
     FROM boletines b LEFT JOIN usuarios u ON u.id = b.creado_por
     WHERE b.campana_id=$1 ORDER BY b.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaBoletin = z.object({
  titulo: z.string().min(3).max(250),
  contenido: z.string().min(10),
});

router.post('/boletines', async (req, res) => {
  const parseado = esquemaBoletin.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO boletines (campana_id, titulo, contenido, creado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.contenido, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.post('/boletines/:id/enviar', async (req, res) => {
  const { periodista_ids } = req.body;
  const boletin = await query('SELECT id FROM boletines WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!boletin.rows[0]) return res.status(404).json({ ok: false, error: 'Boletín no encontrado' });

  let periodistas;
  if (periodista_ids?.length > 0) {
    periodistas = await query('SELECT id FROM periodistas WHERE campana_id=$1 AND id = ANY($2)', [req.usuario.campana_id, periodista_ids]);
  } else {
    periodistas = await query('SELECT id FROM periodistas WHERE campana_id=$1', [req.usuario.campana_id]);
  }
  if (periodistas.rows.length === 0) return res.status(400).json({ ok: false, error: 'No hay periodistas registrados todavía — agrégalos en la pestaña Periodistas.' });

  for (const p of periodistas.rows) {
    await query(`INSERT INTO boletines_envios (boletin_id, periodista_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, p.id]);
  }
  await query(`UPDATE boletines SET estado='enviado', enviado_en=now() WHERE id=$1`, [req.params.id]);
  res.json({ ok: true, data: { total: periodistas.rows.length } });
});

router.delete('/boletines/:id', async (req, res) => {
  await query('DELETE FROM boletines WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 BIBLIOTECA DE CONTENIDO
// ═══════════════════════════════════════════════════════════════

router.get('/biblioteca', async (req, res) => {
  const resultado = await query('SELECT * FROM contenido_biblioteca WHERE campana_id=$1 ORDER BY creado_en DESC', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

router.post('/biblioteca', upload.single('archivo'), async (req, res) => {
  const { tipo, titulo, texto, etiquetas } = req.body;
  if (!tipo || !titulo) return res.status(400).json({ ok: false, error: 'Falta el tipo o el título' });

  let url = null;
  if (req.file) {
    const supabase = clienteSupabase();
    if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
    const ruta = `${req.usuario.campana_id}/biblioteca/${crypto.randomBytes(8).toString('hex')}-${req.file.originalname}`;
    const { error } = await supabase.storage.from('blog-publico').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
    if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir el archivo' });
    url = supabase.storage.from('blog-publico').getPublicUrl(ruta).data.publicUrl;
  }

  const etiquetasArr = etiquetas ? (typeof etiquetas === 'string' ? JSON.parse(etiquetas) : etiquetas) : [];
  const resultado = await query(
    `INSERT INTO contenido_biblioteca (campana_id, tipo, titulo, url, texto, etiquetas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.usuario.campana_id, tipo, titulo, url, texto || null, etiquetasArr, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/biblioteca/:id', async (req, res) => {
  await query('DELETE FROM contenido_biblioteca WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 GENERACIÓN DE CONTENIDO CON IA
// ═══════════════════════════════════════════════════════════════

const TIPO_CONTENIDO_IA = {
  discurso: { instruccion: 'Escribe un discurso de 3 minutos (aprox. 400 palabras) para leer en voz alta ante esta audiencia.' },
  argumentario: { instruccion: 'Escribe un argumentario: 5-8 puntos clave de mensaje, cada uno con 1-2 líneas de explicación, listos para que un vocero los use en entrevistas.' },
  pregunta_dificil: { instruccion: 'Genera las 5 preguntas más difíciles/incómodas que un periodista o adversario podría hacer sobre este tema, cada una con una respuesta sugerida honesta y firme (no evasiva).' },
  mensaje_dia: { instruccion: 'Escribe un mensaje corto (máximo 3 líneas) para compartir hoy en redes sociales y WhatsApp — directo, cercano, sin tecnicismos.' },
  storytelling: { instruccion: 'Escribe una historia breve (150-200 palabras) contada en primera persona por un ciudadano común, que ilustre este tema de forma emotiva y creíble — no debe sonar a propaganda.' },
};

const esquemaGenerarIA = z.object({
  tipo_contenido: z.enum(Object.keys(TIPO_CONTENIDO_IA)),
  tema: z.string().min(3).max(500),
  audiencia: z.string().max(200).optional(),
  tono: z.string().max(100).optional(),
});

router.post('/generar-contenido-ia', async (req, res) => {
  const parseado = esquemaGenerarIA.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const config = TIPO_CONTENIDO_IA[d.tipo_contenido];

  try {
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Eres redactor de una campaña política municipal/estatal en México (Tlaxcala). ${config.instruccion}

Tema: ${d.tema}
${d.audiencia ? `Audiencia: ${d.audiencia}` : ''}
${d.tono ? `Tono deseado: ${d.tono}` : ''}

Reglas importantes:
- Nunca inventes cifras, promesas de presupuesto específico, ni datos que no te haya dado el usuario — usa lenguaje genérico donde falte información concreta.
- No ataques a personas por nombre, mantente en el terreno de las ideas y propuestas.
- Escribe en español de México, natural, no acartonado.
- Esto es un BORRADOR para que el equipo de campaña lo revise y ajuste — no es la versión final.`,
      }],
    });
    const texto = respuesta.content[0]?.text || '';
    res.json({ ok: true, data: { contenido: texto } });
  } catch (e) {
    console.error('Error generando contenido con IA:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar el contenido. Intenta de nuevo.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🆕 MONITOREO DE REDES SOCIALES — reporte manual de tus propios
// encargados de redes, no escucha automática. Sencillo a propósito:
// alguien ve algo (mención negativa, nota falsa, tendencia) y lo
// registra con evidencia, para que quede un historial consultable
// en vez de perderse en conversaciones sueltas de WhatsApp.
// ═══════════════════════════════════════════════════════════════

router.get('/monitoreo-redes', async (req, res) => {
  const filtroTipo = req.query.tipo ? 'AND tipo=$2' : '';
  const params = req.query.tipo ? [req.usuario.campana_id, req.query.tipo] : [req.usuario.campana_id];
  const resultado = await query(
    `SELECT mr.*, u.nombre as creado_por_nombre FROM monitoreo_redes mr
     LEFT JOIN usuarios u ON u.id = mr.creado_por
     WHERE mr.campana_id=$1 ${filtroTipo} ORDER BY mr.creado_en DESC LIMIT 200`,
    params
  );
  const resumen = await query(
    `SELECT tipo, COUNT(*) as total FROM monitoreo_redes WHERE campana_id=$1 GROUP BY tipo`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows, resumen: Object.fromEntries(resumen.rows.map((r) => [r.tipo, parseInt(r.total)])) });
});

const esquemaMonitoreo = z.object({
  tipo: z.enum(['mencion_negativa', 'nota_falsa', 'tendencia', 'mencion_positiva', 'otro']).default('otro'),
  plataforma: z.enum(['x', 'facebook', 'tiktok', 'instagram', 'whatsapp', 'otra']).default('otra'),
  descripcion: z.string().min(3).max(2000),
  url_post: z.string().max(500).optional(),
  urgencia: z.enum(['baja', 'media', 'alta']).default('media'),
});

router.post('/monitoreo-redes', upload.single('captura'), async (req, res) => {
  const parseado = esquemaMonitoreo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  let capturaUrl = null;
  if (req.file) {
    const supabase = clienteSupabase();
    if (supabase) {
      const ruta = `${req.usuario.campana_id}/monitoreo-redes/${crypto.randomBytes(8).toString('hex')}.jpg`;
      const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
      if (!error) capturaUrl = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
    }
  }

  const resultado = await query(
    `INSERT INTO monitoreo_redes (campana_id, tipo, plataforma, descripcion, url_post, captura_url, urgencia, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.usuario.campana_id, d.tipo, d.plataforma, d.descripcion, d.url_post || null, capturaUrl, d.urgencia, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/monitoreo-redes/:id/atender', async (req, res) => {
  const resultado = await query(
    `UPDATE monitoreo_redes SET estado='atendida' WHERE id=$1 AND campana_id=$2 RETURNING *`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/monitoreo-redes/:id', async (req, res) => {
  await query('DELETE FROM monitoreo_redes WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

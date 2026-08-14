import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
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

// ═══════════════════════════════════════════════════════════════
// NÚMEROS DE WHATSAPP (varios por campaña, con rotación)
// ═══════════════════════════════════════════════════════════════

router.get('/numeros', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const numeros = await query('SELECT id, alias, numero_whatsapp, activo, limite_diario FROM whatsapp_numeros WHERE campana_id=$1 ORDER BY creado_en', [req.usuario.campana_id]);
  const conUso = await Promise.all(numeros.rows.map(async (n) => {
    const uso = await query(`SELECT COUNT(*) as total FROM whatsapp_envios_log WHERE numero_id=$1 AND enviado_en::date = CURRENT_DATE`, [n.id]);
    return { ...n, usados_hoy: parseInt(uso.rows[0].total) };
  }));
  res.json({ ok: true, data: conUso });
});

const esquemaNumero = z.object({
  alias: z.string().min(2).max(100),
  numero_whatsapp: z.string().min(8),
  account_sid: z.string().min(5).optional(),
  auth_token: z.string().min(5).optional(),
  limite_diario: z.number().int().min(1).max(100000).default(250),
});

router.post('/numeros', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const parseado = esquemaNumero.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO whatsapp_numeros (campana_id, alias, numero_whatsapp, account_sid, auth_token, limite_diario)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, alias, numero_whatsapp, activo, limite_diario`,
    [req.usuario.campana_id, d.alias, d.numero_whatsapp, d.account_sid || null, d.auth_token || null, d.limite_diario]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/numeros/:id', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const { activo, limite_diario } = req.body;
  const campos = [];
  const valores = [];
  let i = 1;
  if (activo !== undefined) { campos.push(`activo=$${i++}`); valores.push(activo); }
  if (limite_diario !== undefined) { campos.push(`limite_diario=$${i++}`); valores.push(limite_diario); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  await query(`UPDATE whatsapp_numeros SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1}`, valores);
  res.json({ ok: true });
});

router.delete('/numeros/:id', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  await query('DELETE FROM whatsapp_numeros WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

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
  modo: z.enum(['twilio', 'enlace']),
  plantilla_id: z.string().uuid().optional(),
  mensaje_base: z.string().min(2).max(2000),
  audiencia_tipo: z.enum(['promovidos', 'estructura']),
  audiencia_filtro: z.record(z.any()).default({}),
});

router.post('/envios', async (req, res) => {
  const parseado = esquemaEnvio.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const gente = await calcularAudiencia(req.usuario.campana_id, d.audiencia_tipo, d.audiencia_filtro, req.usuario.estado_id);
  if (gente.length === 0) return res.status(400).json({ ok: false, error: 'No hay destinatarios con ese filtro (revisa que tengan teléfono registrado)' });

  const destinatarios = gente.map((p) => ({
    id: p.id, nombre: p.nombre, telefono: p.telefono,
    mensaje: rellenarVariables(d.mensaje_base, p),
    estado: 'pendiente', enviado_en: null, enviado_por: null, numero_usado: null,
  }));

  const envioRes = await query(
    `INSERT INTO marketing_envios (campana_id, titulo, modo, plantilla_id, mensaje_base, audiencia_tipo, audiencia_filtro, destinatarios, total, estado, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'en_progreso',$10) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.modo, d.plantilla_id || null, d.mensaje_base, d.audiencia_tipo, JSON.stringify(d.audiencia_filtro), JSON.stringify(destinatarios), destinatarios.length, req.usuario.sub]
  );
  const envio = envioRes.rows[0];

  if (d.modo === 'enlace') {
    return res.status(201).json({ ok: true, data: envio });
  }

  const numeros = await query('SELECT * FROM whatsapp_numeros WHERE campana_id=$1 AND activo=true', [req.usuario.campana_id]);
  if (numeros.rows.length === 0) {
    await query(`UPDATE marketing_envios SET estado='pendiente' WHERE id=$1`, [envio.id]);
    return res.status(400).json({ ok: false, error: 'No tienes números de WhatsApp configurados. Agrega al menos uno en la pestaña Números.' });
  }

  const usoHoy = {};
  for (const n of numeros.rows) {
    const u = await query(`SELECT COUNT(*) as total FROM whatsapp_envios_log WHERE numero_id=$1 AND enviado_en::date = CURRENT_DATE`, [n.id]);
    usoHoy[n.id] = parseInt(u.rows[0].total);
  }

  const lista = envio.destinatarios;
  let enviados = 0, fallidos = 0;

  for (const persona of lista) {
    const disponibles = numeros.rows.filter((n) => usoHoy[n.id] < n.limite_diario);
    if (disponibles.length === 0) { persona.estado = 'fallido'; persona.mensaje_error = 'Todos los números llegaron a su límite diario'; fallidos++; continue; }
    disponibles.sort((a, b) => usoHoy[a.id] - usoHoy[b.id]);
    const numero = disponibles[0];

    if (!numero.account_sid || !numero.auth_token) {
      persona.estado = 'fallido'; persona.mensaje_error = 'Número sin credenciales de Twilio configuradas'; fallidos++; continue;
    }

    try {
      const cliente = twilio(numero.account_sid, numero.auth_token);
      const from = numero.numero_whatsapp.startsWith('whatsapp:') ? numero.numero_whatsapp : `whatsapp:${numero.numero_whatsapp}`;
      let tel = persona.telefono.replace(/\D/g, '');
      if (tel.length === 10) tel = '52' + tel;
      await cliente.messages.create({ from, to: `whatsapp:+${tel}`, body: persona.mensaje });

      persona.estado = 'enviado'; persona.enviado_en = new Date().toISOString(); persona.numero_usado = numero.alias;
      await query('INSERT INTO whatsapp_envios_log (numero_id) VALUES ($1)', [numero.id]);
      usoHoy[numero.id]++;
      enviados++;
    } catch (e) {
      persona.estado = 'fallido'; persona.mensaje_error = 'Error al enviar'; fallidos++;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const actualizado = await query(
    `UPDATE marketing_envios SET destinatarios=$1, enviados=$2, fallidos=$3, estado='completado' WHERE id=$4 RETURNING *`,
    [JSON.stringify(lista), enviados, fallidos, envio.id]
  );

  res.status(201).json({ ok: true, data: actualizado.rows[0] });
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

export default router;

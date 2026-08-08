import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// ═══════════════════════════════════════════════════════════════
// NÚMEROS DE WHATSAPP (varios por campaña, con rotación)
// ═══════════════════════════════════════════════════════════════

router.get('/numeros', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const numeros = await query('SELECT id, alias, numero_whatsapp, activo, limite_diario FROM whatsapp_numeros WHERE campana_id=$1 ORDER BY creado_en', [req.usuario.campana_id]);

  // Cuántos lleva cada uno hoy — para ver salud de cada línea de un vistazo
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
// AUDIENCIA — quién va a recibir el mensaje, según filtros
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
// ENVÍOS MASIVOS — modo 'enlace' (gratis) o 'twilio' (automático)
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

/**
 * POST /api/marketing/envios
 * Crea el envío con TODOS los destinatarios ya resueltos. Si es
 * modo 'twilio', lo manda de inmediato rotando entre los números
 * disponibles y respetando el límite diario de cada uno. Si es
 * modo 'enlace', solo deja la cola lista para que el equipo la
 * trabaje manualmente desde sus celulares (gratis).
 */
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
    // No se manda nada solo — el equipo lo trabaja desde /marketing/envios/:id
    return res.status(201).json({ ok: true, data: envio });
  }

  // ── MODO TWILIO: rotación entre números disponibles ──
  const numeros = await query('SELECT * FROM whatsapp_numeros WHERE campana_id=$1 AND activo=true', [req.usuario.campana_id]);
  if (numeros.rows.length === 0) {
    await query(`UPDATE marketing_envios SET estado='pendiente' WHERE id=$1`, [envio.id]);
    return res.status(400).json({ ok: false, error: 'No tienes números de WhatsApp configurados. Agrega al menos uno en la pestaña Números.' });
  }

  // Cuántos lleva cada número hoy, para no rebasar su límite
  const usoHoy = {};
  for (const n of numeros.rows) {
    const u = await query(`SELECT COUNT(*) as total FROM whatsapp_envios_log WHERE numero_id=$1 AND enviado_en::date = CURRENT_DATE`, [n.id]);
    usoHoy[n.id] = parseInt(u.rows[0].total);
  }

  const lista = envio.destinatarios;
  let enviados = 0, fallidos = 0;

  for (const persona of lista) {
    // Elegir el número con MÁS margen disponible hoy (rotación por menor uso)
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
    await new Promise((r) => setTimeout(r, 250)); // evitar rate limit de Twilio
  }

  const actualizado = await query(
    `UPDATE marketing_envios SET destinatarios=$1, enviados=$2, fallidos=$3, estado='completado' WHERE id=$4 RETURNING *`,
    [JSON.stringify(lista), enviados, fallidos, envio.id]
  );

  res.status(201).json({ ok: true, data: actualizado.rows[0] });
});

/**
 * PATCH /api/marketing/envios/:id/marcar/:destinatarioId
 * Modo 'enlace' — un miembro del equipo toca "abrí y mandé" después
 * de darle a WhatsApp de verdad, y esto marca su parte de la cola.
 */
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

export default router;

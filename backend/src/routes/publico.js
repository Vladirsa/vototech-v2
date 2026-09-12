import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { getIo } from '../io.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const clienteSupabase = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
};
// 🆕 Límite propio para afiliación — es un formulario PÚBLICO que
// además acepta fotos de identificación, así que necesita un control
// más estricto que el límite general de la plataforma (300/15min).
// 8 intentos por hora por IP es suficiente para uso legítimo (nadie
// se afilia 8 veces en una hora) y frena el abuso automatizado.
const limiteAfiliacion = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

/**
 * GET /api/publico/confirmar-voto/:id
 * Público — SIN autenticación, para que un promovido confirme desde
 * un enlace de WhatsApp que YA VOTÓ, sin necesitar cuenta ni
 * contraseña. Solo confirma ASISTENCIA (dato público, visible en la
 * fila de la casilla) — nunca pregunta ni registra por quién votó,
 * eso es secreto por ley y esta plataforma nunca lo pide.
 */
router.get('/confirmar-voto/:id', async (req, res) => {
  const resultado = await query('SELECT id, nombre, ya_voto FROM promovidos WHERE id=$1', [req.params.id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.post('/confirmar-voto/:id', async (req, res) => {
  const resultado = await query(
    `UPDATE promovidos SET ya_voto = true, hora_voto = now() WHERE id=$1 RETURNING id, nombre, campana_id`,
    [req.params.id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });

  getIo().to(`campana:${resultado.rows[0].campana_id}`).emit('voto_confirmado', resultado.rows[0]);
  res.json({ ok: true, mensaje: `¡Gracias ${resultado.rows[0].nombre}! Quedó registrado.` });
});

/**
 * 🆕 GET/POST /api/publico/confirmar-evento/:agendaId/:promovidoId
 * Mismo patrón que confirmar-voto — público, sin cuenta — pero para
 * que un promovido confirme si va o no a un evento (mitin, reunión),
 * en vez de que nadie sepa de verdad quién va a llegar hasta que ya
 * es tarde para organizarse.
 */
router.get('/confirmar-evento/:agendaId/:promovidoId', async (req, res) => {
  const evento = await query('SELECT id, titulo, fecha_inicio, lugar FROM agenda WHERE id=$1', [req.params.agendaId]);
  if (!evento.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  const promovido = await query('SELECT id, nombre FROM promovidos WHERE id=$1', [req.params.promovidoId]);
  if (!promovido.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  const confirmacion = await query('SELECT va FROM agenda_confirmaciones WHERE agenda_id=$1 AND promovido_id=$2', [req.params.agendaId, req.params.promovidoId]);
  res.json({ ok: true, data: { evento: evento.rows[0], nombre: promovido.rows[0].nombre, va: confirmacion.rows[0]?.va ?? null } });
});

router.post('/confirmar-evento/:agendaId/:promovidoId', async (req, res) => {
  const { va } = req.body;
  if (typeof va !== 'boolean') return res.status(400).json({ ok: false, error: 'Falta indicar si va o no' });
  const evento = await query('SELECT id, campana_id, titulo FROM agenda WHERE id=$1', [req.params.agendaId]);
  if (!evento.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  await query(
    `INSERT INTO agenda_confirmaciones (agenda_id, promovido_id, va) VALUES ($1,$2,$3)
     ON CONFLICT (agenda_id, promovido_id) DO UPDATE SET va=$3, confirmado_en=now()`,
    [req.params.agendaId, req.params.promovidoId, va]
  );
  const promovido = await query('SELECT nombre FROM promovidos WHERE id=$1', [req.params.promovidoId]);
  getIo().to(`campana:${evento.rows[0].campana_id}`).emit('confirmacion_evento', { agenda_id: req.params.agendaId, promovido_id: req.params.promovidoId, va });
  res.json({ ok: true, mensaje: va ? `¡Gracias ${promovido.rows[0]?.nombre}! Te esperamos.` : 'Gracias por avisarnos.' });
});

/**
 * GET /api/publico/encuesta/:id
 * Público — para que alguien conteste una encuesta desde un enlace
 * de WhatsApp, sin necesitar cuenta.
 */
router.get('/encuesta/:id', async (req, res) => {
  const encuesta = await query('SELECT id, titulo, descripcion, activa FROM encuestas WHERE id=$1', [req.params.id]);
  if (!encuesta.rows[0]) return res.status(404).json({ ok: false, error: 'Encuesta no encontrada' });
  if (!encuesta.rows[0].activa) return res.status(403).json({ ok: false, error: 'Esta encuesta ya no está activa' });
  const preguntas = await query('SELECT id, tipo, texto, opciones FROM encuesta_preguntas WHERE encuesta_id=$1 ORDER BY orden', [req.params.id]);
  res.json({ ok: true, data: { ...encuesta.rows[0], preguntas: preguntas.rows } });
});

router.post('/encuesta/:id/responder', async (req, res) => {
  const { respuestas, lat, lng } = req.body;
  if (!respuestas || typeof respuestas !== 'object') return res.status(400).json({ ok: false, error: 'Respuestas inválidas' });
  const encuesta = await query('SELECT id, activa FROM encuestas WHERE id=$1', [req.params.id]);
  if (!encuesta.rows[0]) return res.status(404).json({ ok: false, error: 'Encuesta no encontrada' });
  if (!encuesta.rows[0].activa) return res.status(403).json({ ok: false, error: 'Esta encuesta ya no está activa' });

  await query(
    `INSERT INTO encuesta_respuestas (encuesta_id, respuestas, origen, lat, lng) VALUES ($1,$2,'enlace',$3,$4)`,
    [req.params.id, JSON.stringify(respuestas), lat || null, lng || null]
  );
  res.status(201).json({ ok: true, mensaje: '¡Gracias por responder!' });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 AFILIACIÓN PÚBLICA — cualquier ciudadano se registra él mismo
// como simpatizante desde un enlace (WhatsApp, redes, QR), sin
// necesitar que un promotor lo capture a mano. Entra directo al CRM
// de Promovidos, marcado como "auto-registrado".
//
// El candidato/campaña es el RESPONSABLE de estos datos frente al
// titular (igual que ya establece tu Aviso de Privacidad) — VotoTech
// solo los procesa como Encargado. El consentimiento se pide
// explícito y por separado para la credencial, al ser un dato de
// identificación más sensible que nombre/teléfono.
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/publico/campana/:subdominio
 * Datos mínimos para mostrar en el formulario público — nunca
 * información interna, solo lo necesario para que la persona sepa a
 * quién se está afiliando.
 */
router.get('/campana/:subdominio', async (req, res) => {
  const resultado = await query(
    `SELECT id, nombre_candidato, partido, activa FROM campanas WHERE subdominio=$1`,
    [req.params.subdominio]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  if (!resultado.rows[0].activa) return res.status(403).json({ ok: false, error: 'Esta campaña ya no está activa' });
  res.json({ ok: true, data: { id: resultado.rows[0].id, nombre_candidato: resultado.rows[0].nombre_candidato, partido: resultado.rows[0].partido } });
});

/**
 * POST /api/publico/afiliar/:subdominio
 * Registro público de afiliación — con foto de credencial opcional
 * (frente y reverso), consentimiento explícito, y verificación de
 * duplicados por teléfono dentro de la misma campaña.
 */
router.post('/afiliar/:subdominio', limiteAfiliacion, upload.fields([{ name: 'credencial_frente', maxCount: 1 }, { name: 'credencial_reverso', maxCount: 1 }]), async (req, res) => {
  const { nombre, telefono, calle, lat, lng, consentimiento, consentimiento_credencial } = req.body;

  if (!nombre || nombre.trim().length < 3) return res.status(400).json({ ok: false, error: 'Falta el nombre completo' });
  if (!telefono || telefono.replace(/\D/g, '').length < 10) return res.status(400).json({ ok: false, error: 'Falta un teléfono válido a 10 dígitos' });
  if (consentimiento !== 'true' && consentimiento !== true) {
    return res.status(400).json({ ok: false, error: 'Es necesario aceptar el aviso de privacidad para continuar' });
  }

  const campanaRes = await query('SELECT id, activa, estado_id FROM campanas WHERE subdominio=$1', [req.params.subdominio]);
  if (!campanaRes.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  if (!campanaRes.rows[0].activa) return res.status(403).json({ ok: false, error: 'Esta campaña ya no está activa' });
  const campanaId = campanaRes.rows[0].id;
  const estadoId = campanaRes.rows[0].estado_id;

  // Evitar que el mismo teléfono se registre 2 veces en esta misma campaña
  const telefonoLimpio = telefono.replace(/\D/g, '');
  const existente = await query(
    `SELECT id FROM promovidos WHERE campana_id=$1 AND telefono=$2`,
    [campanaId, telefonoLimpio]
  );
  if (existente.rows[0]) {
    return res.status(409).json({ ok: false, error: 'Este teléfono ya está registrado en esta campaña — si crees que es un error, contacta directamente a la campaña.' });
  }

  // Resolver sección por coordenadas, si se mandaron — usando la
  // misma técnica de "ray casting" que ya usa el sistema en otros
  // lados, pero contra la geometría real de la BASE DE DATOS (no un
  // archivo fijo de un solo estado), para que esto funcione con
  // cualquier estado que ya tenga su cartografía cargada.
  let seccionId = null;
  if (lat && lng) {
    const latNum = parseFloat(lat), lngNum = parseFloat(lng);
    const seccionesConGeo = await query(
      `SELECT id, geometria FROM secciones WHERE estado_id=$1 AND geometria IS NOT NULL`,
      [estadoId]
    );
    const puntoEnPoligono = (geometry) => {
      const anillos = geometry.type === 'Polygon' ? [geometry.coordinates[0]]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates.map((p) => p[0]) : [];
      for (const anillo of anillos) {
        let dentro = false;
        for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
          const [xi, yi] = anillo[i]; const [xj, yj] = anillo[j];
          const interseca = (yi > latNum) !== (yj > latNum) && lngNum < ((xj - xi) * (latNum - yi)) / (yj - yi) + xi;
          if (interseca) dentro = !dentro;
        }
        if (dentro) return true;
      }
      return false;
    };
    const encontrada = seccionesConGeo.rows.find((s) => puntoEnPoligono(s.geometria));
    seccionId = encontrada?.id || null;
  }

  // Fotos de credencial — SOLO si la persona dio su consentimiento
  // explícito para esto específicamente (aparte del consentimiento
  // general). Se guardan en un bucket privado, nunca público.
  let credencialFrenteUrl = null, credencialReversoUrl = null;
  const consintioCredencial = consentimiento_credencial === 'true' || consentimiento_credencial === true;
  if (consintioCredencial && (req.files?.credencial_frente || req.files?.credencial_reverso)) {
    const supabase = clienteSupabase();
    if (supabase) {
      if (req.files.credencial_frente) {
        const archivo = req.files.credencial_frente[0];
        const ruta = `${campanaId}/afiliaciones/${crypto.randomBytes(8).toString('hex')}-frente.jpg`;
        const { error } = await supabase.storage.from('documentos').upload(ruta, archivo.buffer, { contentType: archivo.mimetype });
        if (!error) credencialFrenteUrl = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
      }
      if (req.files.credencial_reverso) {
        const archivo = req.files.credencial_reverso[0];
        const ruta = `${campanaId}/afiliaciones/${crypto.randomBytes(8).toString('hex')}-reverso.jpg`;
        const { error } = await supabase.storage.from('documentos').upload(ruta, archivo.buffer, { contentType: archivo.mimetype });
        if (!error) credencialReversoUrl = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
      }
    }
  }

  const resultado = await query(
    `INSERT INTO promovidos
      (campana_id, nombre, telefono, calle, lat, lng, seccion_id, comprometido, clasificacion, consentimiento,
       auto_registrado, consentimiento_credencial, credencial_frente_url, credencial_reverso_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,'base',true,true,$8,$9,$10)
     RETURNING id`,
    [campanaId, nombre.trim(), telefonoLimpio, calle || null, lat || null, lng || null, seccionId,
     consintioCredencial, credencialFrenteUrl, credencialReversoUrl]
  );

  getIo().to(`campana:${campanaId}`).emit('nuevo_afiliado', { id: resultado.rows[0].id, nombre: nombre.trim() });
  res.status(201).json({ ok: true, mensaje: `¡Gracias ${nombre.trim()}! Tu registro fue recibido correctamente.` });
});

export default router;

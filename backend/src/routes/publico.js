import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { getIo } from '../io.js';
import { subirPrivado } from '../lib/almacenamientoPrivado.js';

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
// 🔒 Límites propios para lo público (antes solo aplicaba el general de
// 1,500 por IP, así que alguien podía llenar una encuesta miles de veces).
const limiteRespuestasPublicas = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Demasiadas respuestas desde tu conexión. Intenta más tarde.' } });
const limiteContacto = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Ya recibimos tu solicitud. Te contactaremos pronto.' } });

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

router.post('/confirmar-voto/:id', limiteRespuestasPublicas, async (req, res) => {
  // 🔒 Solo se puede marcar "ya voté" el día de la elección (±1 día por
  // husos horarios) — antes cualquiera con el enlace reenviado podía
  // marcarlo en cualquier momento y ensuciar la lista de movilización.
  const ventana = await query(
    `SELECT c.fecha_eleccion FROM promovidos p JOIN campanas c ON c.id = p.campana_id WHERE p.id=$1`,
    [req.params.id]
  );
  if (!ventana.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  const fechaEleccion = ventana.rows[0].fecha_eleccion ? new Date(ventana.rows[0].fecha_eleccion) : null;
  if (fechaEleccion && Math.abs(Date.now() - fechaEleccion.getTime()) > 36 * 60 * 60 * 1000) {
    return res.status(403).json({ ok: false, error: 'Este enlace solo funciona el día de la elección.' });
  }
  const resultado = await query(
    `UPDATE promovidos SET ya_voto = true, hora_voto = now() WHERE id=$1 RETURNING id, nombre, campana_id`,
    [req.params.id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });

  getIo().to(`campana:${resultado.rows[0].campana_id}`).emit('voto_confirmado', { id: resultado.rows[0].id });
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

router.post('/confirmar-evento/:agendaId/:promovidoId', limiteRespuestasPublicas, async (req, res) => {
  const { va } = req.body;
  if (typeof va !== 'boolean') return res.status(400).json({ ok: false, error: 'Falta indicar si va o no' });
  const evento = await query('SELECT id, campana_id, titulo FROM agenda WHERE id=$1', [req.params.agendaId]);
  if (!evento.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
  // 🔒 La persona debe ser de la MISMA campaña que el evento.
  const mismaCampana = await query('SELECT 1 FROM promovidos WHERE id=$1 AND campana_id=$2', [req.params.promovidoId, evento.rows[0].campana_id]);
  if (!mismaCampana.rows[0]) return res.status(404).json({ ok: false, error: 'Enlace inválido' });
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

router.post('/encuesta/:id/responder', limiteRespuestasPublicas, async (req, res) => {
  const { respuestas, lat, lng } = req.body;
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) return res.status(400).json({ ok: false, error: 'Respuestas inválidas' });
  // 🔒 Una encuesta real cabe de sobra en 10,000 caracteres (antes se aceptaban hasta 2 MB por respuesta).
  if (JSON.stringify(respuestas).length > 10000 || Object.keys(respuestas).length > 100) {
    return res.status(413).json({ ok: false, error: 'Respuesta demasiado grande' });
  }
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
  // 🔒 Límites de tamaño y sin "<" ">" (el nombre se muestra en pantallas del equipo).
  if (nombre.length > 200 || /[<>]/.test(nombre) || String(calle || '').length > 255 || String(telefono).length > 20) {
    return res.status(400).json({ ok: false, error: 'Revisa los datos: hay un campo demasiado largo o con caracteres no permitidos.' });
  }
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
  // general).
  // 🔒 Ahora SÍ van a la carpeta privada (antes el comentario decía
  // "privado" pero el código las subía a una carpeta PÚBLICA con enlace
  // permanente). Solo se aceptan imágenes.
  let credencialFrenteUrl = null, credencialReversoUrl = null;
  const consintioCredencial = consentimiento_credencial === 'true' || consentimiento_credencial === true;
  const esImagen = (a) => ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(a?.mimetype);
  if (consintioCredencial) {
    const frente = req.files?.credencial_frente?.[0];
    const reverso = req.files?.credencial_reverso?.[0];
    if (frente && esImagen(frente)) {
      credencialFrenteUrl = await subirPrivado(`${campanaId}/afiliaciones/${crypto.randomBytes(8).toString('hex')}-frente`, frente.buffer, frente.mimetype);
    }
    if (reverso && esImagen(reverso)) {
      credencialReversoUrl = await subirPrivado(`${campanaId}/afiliaciones/${crypto.randomBytes(8).toString('hex')}-reverso`, reverso.buffer, reverso.mimetype);
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

// ═══════════════════════════════════════════════════════════════
// 🆕 COTIZADOR PÚBLICO — calcula un precio estimado sin que Vlado
// tenga que investigar el tope de gasto manualmente cada vez. Usa
// la misma lógica de siempre: tamaño real del territorio → rango de
// precio. Es un ESTIMADO, no un precio final — por eso siempre es
// un rango, nunca un número exacto.
// ═══════════════════════════════════════════════════════════════

// 🆕 NUEVA TABLA — cobro MENSUAL, con 2 planes (Básico y Premium),
// escalando según tipo de elección y número real de electores. Ya
// no es un precio único por campaña — es una suscripción mientras
// dure el contrato.
const TABLA_MUNICIPAL = [
  { hasta: 10000, basico: 4000, premium: 9000 },
  { hasta: 30000, basico: 6000, premium: 14000 },
  { hasta: 80000, basico: 12000, premium: 27000 },
  { hasta: 200000, basico: 25000, premium: 55000 },
  { hasta: Infinity, basico: 40000, premium: 75000 },
];
const TABLA_JUDICIAL = {
  juez: { basico: 4000, premium: 8000 },
  magistrado: { basico: 8000, premium: 16000 },
  ministro: { basico: 15000, premium: 30000 },
};
const TABLA_DISTRITAL = { basico: 20000, premium: 45000 };
const TABLA_ESTATAL = { basico: 50000, premium: 115000 }; // punto medio del rango $80k-$150k premium

router.post('/cotizar', async (req, res) => {
  const { tipo_eleccion, estado_id, electores_aproximados, cargo_judicial } = req.body;
  if (!tipo_eleccion) return res.status(400).json({ ok: false, error: 'Falta el tipo de elección' });

  let basico, premium, nota = '';

  if (tipo_eleccion === 'judicial') {
    const t = TABLA_JUDICIAL[cargo_judicial] || TABLA_JUDICIAL.juez;
    basico = t.basico; premium = t.premium;
    nota = 'Las elecciones judiciales tienen topes de gasto mucho menores por ley — por eso el precio es más bajo que una campaña política tradicional.';
  } else if (tipo_eleccion === 'gobernador' || tipo_eleccion === 'senador') {
    basico = TABLA_ESTATAL.basico; premium = TABLA_ESTATAL.premium;
    nota = 'Cubre todo el estado — el precio final varía según el tamaño real del padrón electoral estatal.';
  } else if (tipo_eleccion === 'dip_local' || tipo_eleccion === 'dip_federal') {
    basico = TABLA_DISTRITAL.basico; premium = TABLA_DISTRITAL.premium;
    nota = 'Un distrito agrupa varios municipios — el precio final depende de cuántas secciones tiene tu distrito específico.';
  } else {
    // Municipal / Presidente de Comunidad — por número real de electores (lista nominal)
    const electores = parseInt(electores_aproximados) || 0;
    const tramo = TABLA_MUNICIPAL.find((t) => electores <= t.hasta) || TABLA_MUNICIPAL[TABLA_MUNICIPAL.length - 1];
    basico = tramo.basico; premium = tramo.premium;
    nota = `Con base en ~${electores.toLocaleString()} electores — el precio final se confirma con el padrón oficial de tu municipio.`;
  }

  res.json({ ok: true, data: { basico, premium, nota, periodo: 'mensual' } });
});

/**
 * 🆕 POST /api/publico/solicitar-contacto
 * El prospecto ya vio su rango de precio y quiere que le contacten
 * — se guarda como lead, para que Vlado lo revise cuando pueda, sin
 * tener que estar pendiente de un chat en vivo.
 */
router.post('/solicitar-contacto', limiteContacto, async (req, res) => {
  const { nombre, telefono, email, tipo_eleccion, estado_id, electores_aproximados, cargo_judicial, basico, premium } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ ok: false, error: 'Falta nombre y teléfono' });
  // 🔒 Tamaños razonables — evita que alguien llene la lista de prospectos con basura enorme.
  if (String(nombre).length > 200 || String(telefono).length > 20 || String(email || '').length > 200 || String(tipo_eleccion || '').length > 40) {
    return res.status(400).json({ ok: false, error: 'Revisa los datos: hay un campo demasiado largo.' });
  }
  await query(
    // 🆕 Se reusan las mismas columnas precio_min/precio_max — ahora
    // significan "básico" y "premium" en vez de un rango de un solo
    // precio, para no necesitar una migración de tabla.
    `INSERT INTO leads_comerciales (nombre, telefono, email, tipo_eleccion, estado_id, poblacion_aproximada, cargo_judicial, precio_min, precio_max)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [nombre, telefono, email || null, tipo_eleccion, estado_id || null, electores_aproximados || null, cargo_judicial || null, basico || null, premium || null]
  );
  res.status(201).json({ ok: true, mensaje: '¡Gracias! Te contactaremos pronto.' });
});

export default router;

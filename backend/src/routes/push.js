import { Router } from 'express';
import webpush from 'web-push';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:soporte@vototech.mx', VAPID_PUBLIC, VAPID_PRIVATE);
}

/**
 * Envía una notificación push real a TODOS los dispositivos donde
 * esa persona haya dado permiso — funciona con el celular bloqueado
 * o la app cerrada, a diferencia del aviso de "pestaña abierta" que
 * ya teníamos para el chat. Cualquier módulo puede llamar esto.
 */
export async function enviarPush(usuarioId, { titulo, cuerpo, url = '/' }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // no configurado en este entorno, se ignora silenciosamente

  const suscripciones = await query('SELECT * FROM push_suscripciones WHERE usuario_id=$1', [usuarioId]);
  const payload = JSON.stringify({ titulo, cuerpo, url });

  for (const s of suscripciones.rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      // Código 410/404 = el navegador invalidó esa suscripción (desinstaló
      // la app, borró datos, etc.) — se limpia sola, no es un error real.
      if (e.statusCode === 410 || e.statusCode === 404) {
        await query('DELETE FROM push_suscripciones WHERE id=$1', [s.id]);
      } else {
        console.error('Error enviando push:', e.message);
      }
    }
  }
}

/** Igual que enviarPush pero a VARIAS personas de un jalón. */
export async function enviarPushMasivo(usuarioIds, datos) {
  await Promise.all(usuarioIds.map((id) => enviarPush(id, datos)));
}

router.use(requiereAuth);

router.get('/vapid-public-key', (req, res) => {
  res.json({ ok: true, publicKey: VAPID_PUBLIC || null });
});

// 🔒 El servidor ENVÍA peticiones a la dirección "endpoint". Antes se
// aceptaba cualquiera: alguien podía registrar una dirección interna
// y usar tu servidor para tocar otros sistemas (ataque SSRF). Ahora
// solo se aceptan los servicios de notificaciones reales de Google,
// Mozilla, Apple y Microsoft.
const SERVICIOS_PUSH = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
function endpointValido(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && SERVICIOS_PUSH.some((r) => r.test(u.hostname)) && endpoint.length <= 800;
  } catch { return false; }
}

router.post('/suscribir', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ ok: false, error: 'Suscripción inválida' });
  if (typeof endpoint !== 'string' || !endpointValido(endpoint)
      || String(keys.p256dh).length > 200 || String(keys.auth).length > 100) {
    return res.status(400).json({ ok: false, error: 'Suscripción inválida' });
  }

  await query(
    `INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (usuario_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [req.usuario.sub, endpoint, keys.p256dh, keys.auth]
  );
  res.status(201).json({ ok: true });
});

router.post('/desuscribir', async (req, res) => {
  const { endpoint } = req.body;
  await query('DELETE FROM push_suscripciones WHERE usuario_id=$1 AND endpoint=$2', [req.usuario.sub, endpoint]);
  res.json({ ok: true });
});

/** Botón "mandar notificación de prueba" — para que la persona
 * confirme que sí le está llegando antes de confiar en el sistema. */
router.post('/prueba', async (req, res) => {
  await enviarPush(req.usuario.sub, { titulo: '🗳️ VotoTech', cuerpo: 'Así se ven tus notificaciones — ¡todo listo!', url: '/dashboard' });
  res.json({ ok: true });
});

export default router;

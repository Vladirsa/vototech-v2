import crypto from 'crypto';

// El "super admin" eres tú (el dueño de VotoTech) — no está atado a
// ninguna campaña, así que no usa el sistema de usuarios normal.
// Se protege con una clave secreta que solo tú conoces, guardada
// como variable de entorno (SUPER_ADMIN_KEY), nunca en el código.
//
// 🔒 Reforzado:
//  - La comparación de la clave es "de tiempo constante" (no se puede
//    adivinar letra por letra midiendo cuánto tarda el servidor).
//  - Después de 10 claves incorrectas desde la misma IP en 15 minutos,
//    esa IP queda bloqueada 15 minutos (antes se podía probar sin fin).
//  - Cada intento fallido queda en los registros del servidor.
const fallosPorIp = new Map(); // ip → { conteo, hasta }
const MAX_FALLOS = 10;
const VENTANA_MS = 15 * 60 * 1000;

function igualSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function requiereSuperAdmin(req, res, next) {
  const clave = req.headers['x-admin-key'];
  const claveReal = process.env.SUPER_ADMIN_KEY;

  if (!claveReal) {
    return res.status(500).json({ ok: false, error: 'SUPER_ADMIN_KEY no está configurada en el servidor' });
  }

  const ip = req.ip || 'desconocida';
  const registro = fallosPorIp.get(ip);
  if (registro && registro.hasta > Date.now() && registro.conteo >= MAX_FALLOS) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  if (!clave || !igualSeguro(clave, claveReal)) {
    const actual = registro && registro.hasta > Date.now() ? registro : { conteo: 0, hasta: Date.now() + VENTANA_MS };
    actual.conteo++;
    fallosPorIp.set(ip, actual);
    if (fallosPorIp.size > 10000) fallosPorIp.clear();
    console.warn(`⚠️ Clave de super admin incorrecta desde ${ip} (${actual.conteo}/${MAX_FALLOS})`);
    return res.status(403).json({ ok: false, error: 'Clave de administrador incorrecta' });
  }
  next();
}

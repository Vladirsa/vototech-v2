import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';

/**
 * 🔒 TOPE DE USO DE LA IA (Anthropic) — protege tu factura.
 *
 * Antes cualquier usuario (incluida la cuenta DEMO, cuya contraseña
 * está publicada en vototech.com.mx) podía llamar a la IA sin límite
 * y con textos de hasta 2 MB: alguien podía dejar un programa
 * repitiendo llamadas y generarte cientos de dólares por hora, además
 * de agotar la cuota y dejar sin IA a todas las campañas reales.
 *
 * Tres candados:
 *  1) Tamaño: el texto que se manda a la IA no puede pasar de ~12,000
 *     caracteres (unas 4 páginas).
 *  2) Por persona: máximo 20 llamadas cada 10 minutos.
 *  3) Por campaña al día: IA_TOPE_DIARIO_CAMPANA (300 por defecto) y
 *     solo 40 para campañas demo. Se puede ajustar en Render →
 *     Environment sin tocar código.
 *
 * El conteo diario vive en memoria (se reinicia si el servidor se
 * reinicia) — suficiente para frenar abuso sin crear tablas nuevas.
 */
const TOPE_DIARIO = parseInt(process.env.IA_TOPE_DIARIO_CAMPANA || '300', 10);
const TOPE_DIARIO_DEMO = parseInt(process.env.IA_TOPE_DIARIO_DEMO || '40', 10);
const MAX_CARACTERES = 12000;

const usoPorCampanaDia = new Map(); // "campana|AAAA-MM-DD" → llamadas
const cacheEsDemo = new Map(); // campana → { esDemo, hasta }

async function esCampanaDemo(campanaId) {
  const c = cacheEsDemo.get(campanaId);
  if (c && c.hasta > Date.now()) return c.esDemo;
  const r = await query('SELECT es_demo FROM campanas WHERE id=$1', [campanaId]);
  const esDemo = !!r.rows[0]?.es_demo;
  cacheEsDemo.set(campanaId, { esDemo, hasta: Date.now() + 10 * 60 * 1000 });
  return esDemo;
}

const limitePorPersona = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `ia|${req.usuario?.sub || req.ip}`,
  message: { ok: false, error: 'Llegaste al límite de uso de la IA por ahora. Espera unos minutos.' },
});

async function topeDiarioYTamano(req, res, next) {
  if (req.is('application/json') && JSON.stringify(req.body || {}).length > MAX_CARACTERES) {
    return res.status(413).json({ ok: false, error: 'El texto es demasiado largo para la IA. Resúmelo un poco (máximo ~4 páginas).' });
  }
  const campanaId = req.usuario?.campana_id;
  if (!campanaId) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const hoy = new Date().toISOString().slice(0, 10);
  const llave = `${campanaId}|${hoy}`;
  const tope = (await esCampanaDemo(campanaId)) ? TOPE_DIARIO_DEMO : TOPE_DIARIO;
  const usados = usoPorCampanaDia.get(llave) || 0;
  if (usados >= tope) {
    return res.status(429).json({ ok: false, error: `Tu campaña llegó al límite diario de uso de la IA (${tope}). Se renueva mañana; si necesitas más, contacta a VotoTech.` });
  }
  usoPorCampanaDia.set(llave, usados + 1);

  // Limpieza: se borran los contadores de días anteriores.
  if (usoPorCampanaDia.size > 5000) {
    for (const k of usoPorCampanaDia.keys()) if (!k.endsWith(hoy)) usoPorCampanaDia.delete(k);
  }
  next();
}

/** Usar DESPUÉS de requiereAuth (necesita req.usuario). */
export const limiteIA = [limitePorPersona, topeDiarioYTamano];

/** Rutas que llaman a la IA de pago — si se agrega otra, sumarla aquí. */
export const RUTAS_IA = [
  '/api/ia/leer-acta',
  '/api/ia/leer-credencial',
  '/api/ia/estado',
  '/api/marketing/generar-contenido-ia',
  '/api/marketing/generar-post-social',
  '/api/centro-decisiones/asistente',
  '/api/juridico/redactar-ia',
  '/api/reportes/resumen-ejecutivo-ia',
  '/api/bitacora/analizar-jornada',
];

export { esCampanaDemo };

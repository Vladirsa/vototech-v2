import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requiereAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(requiereAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * POST /api/ia/leer-acta
 * Lee la foto de un acta de escrutinio y extrae los votos por
 * partido — pero SOLO como sugerencia para que el representante
 * confirme o corrija, nunca se guarda automático. Un acta mal leída
 * por la IA es un resultado electoral incorrecto, así que el humano
 * siempre tiene la última palabra; esto solo le ahorra estar
 * tecleando número por número con el celular en la mano en la calle.
 */
router.post('/leer-acta', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `Esta es una foto de un acta de escrutinio de una casilla electoral mexicana. Extrae los votos por partido/coalición que puedas leer con claridad.

Responde ÚNICAMENTE con un objeto JSON (nada de texto antes o después, sin bloques de código) con esta forma exacta:
{"votos": {"morena": 0, "pan": 0, "pri": 0, "prd": 0, "mc": 0, "pvem": 0, "pt": 0}, "nulos": 0, "casilla": "texto si es legible o null", "confianza": "alta|media|baja", "advertencia": "texto si algo no se pudo leer bien, o null"}

Reglas:
- Solo incluye partidos que de verdad aparezcan en el acta con un número junto — si un partido no aparece o no se alcanza a leer, pon 0 y bájale a "confianza".
- Si la imagen está borrosa, mal iluminada, o el acta no es legible en general, pon "confianza":"baja" y explica por qué en "advertencia".
- NUNCA inventes un número que no puedas leer con razonable certeza — es preferible 0 con advertencia que un número incorrecto.`,
          },
        ],
      }],
    });

    const textoRespuesta = respuesta.content[0]?.text?.trim() || '{}';
    // Por si Claude envuelve la respuesta en un bloque de código pese a la instrucción
    const jsonLimpio = textoRespuesta.replace(/^```json\s*|```\s*$/g, '').trim();
    let datosExtraidos;
    try {
      datosExtraidos = JSON.parse(jsonLimpio);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'La IA no pudo leer el acta con suficiente claridad. Captúralo a mano.' });
    }

    res.json({ ok: true, data: datosExtraidos });
  } catch (e) {
    console.error('Error leyendo acta:', e);
    res.status(500).json({ ok: false, error: 'No se pudo leer el acta. Captúralo a mano.' });
  }
});

/**
 * POST /api/ia/leer-credencial
 * Lee una credencial de elector (INE) y extrae SOLO los datos que
 * ya se capturan a mano en el formulario de Promovidos: nombre
 * completo, sección electoral, distritos, y domicilio.
 *
 * 🔒 LA FOTO NUNCA SE GUARDA — llega en memoria (multer
 * memoryStorage), se manda una sola vez a Claude para leerla, y se
 * descarta al terminar la petición. No se sube a ningún bucket, no
 * se guarda ninguna referencia a la imagen en la base de datos —
 * solo los datos de texto que el usuario ve y decide guardar (o no)
 * en el formulario, exactamente como si los hubiera tecleado él mismo.
 *
 * Igual que con las actas: esto es SOLO una sugerencia. El promotor
 * siempre revisa y confirma antes de guardar — una credencial mal
 * leída no debe convertirse en un dato incorrecto en el CRM.
 */
router.post('/leer-credencial', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `Esta es una foto de una credencial para votar del INE (México). Extrae ÚNICAMENTE estos datos, tal como aparecen impresos:

Responde SOLO con un objeto JSON (nada de texto antes o después, sin bloques de código) con esta forma exacta:
{"nombre_completo": "texto o null", "seccion": "número o null", "distrito_federal": "número o null", "distrito_local": "número o null", "municipio": "texto o null", "domicilio": "calle, número y colonia, texto o null", "confianza": "alta|media|baja", "advertencia": "texto si algo no se pudo leer bien, o null"}

Reglas:
- NUNCA inventes un dato que no puedas leer con razonable certeza — es preferible null con advertencia que un dato incorrecto.
- No incluyas la CURP, clave de elector, ni ningún otro dato distinto a los 6 campos de arriba — no se necesitan y no deben aparecer en tu respuesta.
- Si la imagen no es una credencial de elector legible, o está muy borrosa, pon "confianza":"baja" y explica en "advertencia".`,
          },
        ],
      }],
    });

    const textoRespuesta = respuesta.content[0]?.text?.trim() || '{}';
    const jsonLimpio = textoRespuesta.replace(/^```json\s*|```\s*$/g, '').trim();
    let datosExtraidos;
    try {
      datosExtraidos = JSON.parse(jsonLimpio);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'La IA no pudo leer la credencial con suficiente claridad. Captúralo a mano.' });
    }

    res.json({ ok: true, data: datosExtraidos });
  } catch (e) {
    console.error('Error leyendo credencial:', e);
    res.status(500).json({ ok: false, error: 'No se pudo leer la credencial. Captúralo a mano.' });
  }
  // 🔒 req.file.buffer nunca se referencia después de este punto —
  // se pierde con el fin de la petición, no queda ninguna copia.
});

/**
 * GET /api/ia/estado
 * Diagnóstico real, no adivinanza — para saber en 2 segundos si el
 * Centro IA no funciona por falta de la llave (configuración) o por
 * otra cosa (un bug de verdad).
 */
router.get('/estado', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      ok: true,
      data: { funciona: false, causa: 'sin_llave', mensaje: 'ANTHROPIC_API_KEY no está configurada en el servidor. Agrégala en las variables de entorno de Render.' },
    });
  }
  try {
    await anthropic.messages.create({ model: 'claude-sonnet-5', max_tokens: 10, messages: [{ role: 'user', content: 'di "ok"' }] });
    res.json({ ok: true, data: { funciona: true, mensaje: 'El Centro IA está funcionando correctamente.' } });
  } catch (e) {
    res.json({
      ok: true,
      data: { funciona: false, causa: 'error_api', mensaje: `La llave está configurada pero Anthropic respondió con un error: ${e.message}` },
    });
  }
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requiereAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(requiereAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * Redimensiona a 1568px en su lado más largo (tamaño óptimo para
 * Claude Vision) y comprime a JPEG calidad 85 — todo en memoria,
 * nunca se guarda en disco.
 */
async function comprimirParaClaude(bufferOriginal) {
  const bufferComprimido = await sharp(bufferOriginal)
    .rotate()
    .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { buffer: bufferComprimido, mediaType: 'image/jpeg' };
}

router.post('/leer-acta', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  try {
    const { buffer, mediaType } = await comprimirParaClaude(req.file.buffer);
    const base64 = buffer.toString('base64');

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
 *
 * 🆕 ESTA VEZ SÍ TIENE EL DIAGNÓSTICO DETALLADO — separa el error en
 * 2 posibles causas (falla al comprimir la imagen vs. falla al
 * llamar a Claude) y te dice cuál fue exactamente, en vez del mensaje
 * genérico de siempre. Es temporal, para encontrar la causa real —
 * en cuanto la encontremos, se vuelve a poner un mensaje bonito.
 */
router.post('/leer-credencial', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  let buffer, mediaType;
  try {
    const resultado = await comprimirParaClaude(req.file.buffer);
    buffer = resultado.buffer;
    mediaType = resultado.mediaType;
  } catch (e) {
    console.error('Error comprimiendo la imagen de credencial:', e);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar la imagen. Intenta con otra foto.' });
  }

  try {
    const base64 = buffer.toString('base64');

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
{"nombre_completo": "texto o null", "seccion": "número o null", "distrito_federal": "número o null", "distrito_local": "número o null", "municipio": "texto o null", "calle_numero": "solo calle y número, texto o null", "colonia": "SOLO el nombre de la colonia/fraccionamiento/barrio, texto o null", "codigo_postal": "5 dígitos o null", "confianza": "alta|media|baja", "advertencia": "texto si algo no se pudo leer bien, o null"}

Reglas:
- La credencial del INE imprime el domicilio en varias líneas (calle y número, luego colonia, luego a veces C.P. y localidad) — sepáralos en sus propios campos, no los mezcles todos en uno solo.
- "colonia" es SOLO el nombre del barrio/fraccionamiento/colonia — no repitas ahí la calle ni el municipio.
- NUNCA inventes un dato que no puedas leer con razonable certeza — es preferible null con advertencia que un dato incorrecto.
- No incluyas la CURP, clave de elector, ni ningún otro dato distinto a los de arriba.
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
      console.error('Respuesta de Claude no era JSON válido:', textoRespuesta.slice(0, 300));
      return res.status(500).json({ ok: false, error: 'La IA no pudo leer la credencial con suficiente claridad. Captúralo a mano.' });
    }

    res.json({ ok: true, data: datosExtraidos });
  } catch (e) {
    console.error('Error leyendo credencial (llamada a Claude):', e);
    res.status(500).json({ ok: false, error: 'No se pudo leer la credencial. Captúralo a mano.' });
  }
});

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

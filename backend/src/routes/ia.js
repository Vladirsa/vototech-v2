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
 * POST /api/ia/redactar
 * Asistente CONTEXTUAL — no es una pantalla aparte que nadie visita,
 * se llama desde dentro de otros módulos (Promovidos, WhatsApp, Agenda)
 * para ayudar a redactar mensajes según lo que se esté haciendo ahí.
 *
 * contexto puede ser: 'mensaje_persuasion', 'invitacion_evento',
 * 'agradecimiento_voto', 'convocatoria_whatsapp'
 */
const esquemaRedactar = z.object({
  contexto: z.enum(['mensaje_persuasion', 'invitacion_evento', 'agradecimiento_voto', 'convocatoria_whatsapp', 'redactar_queja', 'libre']),
  detalles: z.string().max(1500).optional(),
  nombre_destinatario: z.string().max(100).optional(),
});

const PROMPTS_CONTEXTO = {
  mensaje_persuasion: 'Escribe un mensaje corto de WhatsApp (máximo 3 líneas) para persuadir a un votante indeciso a apoyar al candidato. Cálido, cercano, sin sonar a spam político genérico.',
  invitacion_evento: 'Escribe una invitación corta de WhatsApp a un evento de campaña. Debe generar entusiasmo sin ser exagerado.',
  agradecimiento_voto: 'Escribe un mensaje breve de agradecimiento a alguien que confirmó su apoyo. Sincero, no genérico.',
  convocatoria_whatsapp: 'Escribe un mensaje corto para convocar promotores a una actividad de campaña. Motivador y claro en la acción a tomar.',
  redactar_queja: 'Redacta la sección de HECHOS de una queja/denuncia electoral formal ante la autoridad electoral (ITE/INE), con base en los hechos que se describen abajo. Tono formal, objetivo, en tercera persona, sin acusaciones que no estén sustentadas en los hechos dados. Estructura en párrafos numerados si aplica. Esto es un BORRADOR de apoyo — no es un documento legal validado, y así se le debe hacer saber al usuario por fuera de este texto.',
  libre: 'Ayuda con lo que se pida a continuación, en el contexto de una campaña electoral en México.',
};

router.post('/redactar', async (req, res) => {
  const parseado = esquemaRedactar.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  try {
    // Traer contexto real de la campaña para que el mensaje no sea genérico
    const campana = await query('SELECT nombre_candidato, partido, tipo_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
    const c = campana.rows[0];

    const instruccion = PROMPTS_CONTEXTO[d.contexto];
    const prompt = `${instruccion}

Candidato: ${c.nombre_candidato}
Partido: ${c.partido || 'independiente'}
Cargo al que aspira: ${c.tipo_eleccion}
${d.nombre_destinatario ? `Nombre del destinatario: ${d.nombre_destinatario}` : ''}
${d.detalles ? `Detalles adicionales: ${d.detalles}` : ''}

Responde ÚNICAMENTE con el texto del mensaje, sin explicaciones ni comillas.`;

    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = respuesta.content[0]?.text?.trim() || '';
    res.json({ ok: true, data: { mensaje: texto } });
  } catch (e) {
    console.error('Error del asistente IA:', e);
    res.status(500).json({ ok: false, error: 'El asistente no pudo generar el mensaje. Intenta de nuevo.' });
  }
});

/**
 * POST /api/ia/interpretar-tendencia
 * A diferencia de /redactar (que genera texto libre), aquí la IA
 * NUNCA inventa números — solo recibe cifras que YA calculamos con
 * SQL determinista y las convierte en 2-3 oraciones de interpretación
 * en español sencillo. Mismo principio que el Motor de Inteligencia
 * Electoral: las reglas fijas calculan, la IA solo narra.
 */
const esquemaInterpretar = z.object({
  datos: z.record(z.any()), // los números YA calculados que se le mandan a interpretar
  titulo_seccion: z.string().max(100).optional(),
});

router.post('/interpretar-tendencia', async (req, res) => {
  const parseado = esquemaInterpretar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  try {
    const prompt = `Eres un analista de campañas electorales explicándole datos a alguien que no es técnico. Con base ÚNICAMENTE en los siguientes datos reales ya calculados (no inventes ni supongas números que no estén aquí), escribe una interpretación de 2 a 3 oraciones, en español sencillo y directo, con un tono práctico (qué significa esto para la campaña, no solo describir los números).

Sección: ${d.titulo_seccion || 'Datos de campaña'}
Datos: ${JSON.stringify(d.datos, null, 2)}

Responde ÚNICAMENTE con la interpretación, sin encabezados ni comillas.`;

    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = respuesta.content[0]?.text?.trim() || '';
    res.json({ ok: true, data: { interpretacion: texto } });
  } catch (e) {
    console.error('Error interpretando tendencia:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar la interpretación. Intenta de nuevo.' });
  }
});

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

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requiereAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(requiereAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  contexto: z.enum(['mensaje_persuasion', 'invitacion_evento', 'agradecimiento_voto', 'convocatoria_whatsapp', 'libre']),
  detalles: z.string().max(500).optional(),
  nombre_destinatario: z.string().max(100).optional(),
});

const PROMPTS_CONTEXTO = {
  mensaje_persuasion: 'Escribe un mensaje corto de WhatsApp (máximo 3 líneas) para persuadir a un votante indeciso a apoyar al candidato. Cálido, cercano, sin sonar a spam político genérico.',
  invitacion_evento: 'Escribe una invitación corta de WhatsApp a un evento de campaña. Debe generar entusiasmo sin ser exagerado.',
  agradecimiento_voto: 'Escribe un mensaje breve de agradecimiento a alguien que confirmó su apoyo. Sincero, no genérico.',
  convocatoria_whatsapp: 'Escribe un mensaje corto para convocar promotores a una actividad de campaña. Motivador y claro en la acción a tomar.',
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

export default router;

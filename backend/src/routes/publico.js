import { Router } from 'express';
import { query } from '../db/pool.js';
import { getIo } from '../io.js';

const router = Router();

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

export default router;

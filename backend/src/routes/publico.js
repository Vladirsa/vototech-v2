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

export default router;

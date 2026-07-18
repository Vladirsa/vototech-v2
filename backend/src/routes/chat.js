import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';

const router = Router();
router.use(requiereAuth);

const CANALES_VALIDOS = ['general', 'coordinadores'];

/**
 * GET /api/chat/:canal
 * Últimos 100 mensajes de un canal — "coordinadores" solo lo pueden
 * ver quienes no son promotores.
 */
router.get('/:canal', async (req, res) => {
  const canal = CANALES_VALIDOS.includes(req.params.canal) ? req.params.canal : 'general';
  if (canal === 'coordinadores' && req.usuario.rol === 'promotor') {
    return res.status(403).json({ ok: false, error: 'Este canal es solo para coordinadores' });
  }

  const resultado = await query(
    `SELECT c.id, c.canal, c.texto, c.creado_en, u.nombre as autor_nombre, u.rol as autor_rol, u.puesto as autor_puesto
     FROM chat_mensajes c JOIN usuarios u ON u.id = c.autor_id
     WHERE c.campana_id=$1 AND c.canal=$2
     ORDER BY c.creado_en DESC LIMIT 100`,
    [req.usuario.campana_id, canal]
  );
  res.json({ ok: true, data: resultado.rows.reverse() });
});

/**
 * POST /api/chat/:canal
 * Envía y transmite en vivo por WebSocket a todos los conectados
 * de la misma campaña.
 */
router.post('/:canal', async (req, res) => {
  const canal = CANALES_VALIDOS.includes(req.params.canal) ? req.params.canal : 'general';
  if (canal === 'coordinadores' && req.usuario.rol === 'promotor') {
    return res.status(403).json({ ok: false, error: 'Este canal es solo para coordinadores' });
  }

  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ ok: false, error: 'Mensaje vacío' });
  if (texto.length > 2000) return res.status(400).json({ ok: false, error: 'Mensaje demasiado largo' });

  const resultado = await query(
    `INSERT INTO chat_mensajes (campana_id, canal, autor_id, texto) VALUES ($1,$2,$3,$4)
     RETURNING id, canal, texto, creado_en`,
    [req.usuario.campana_id, canal, req.usuario.sub, texto.trim()]
  );

  const mensajeCompleto = {
    ...resultado.rows[0],
    autor_nombre: req.usuario.nombre,
    autor_rol: req.usuario.rol,
  };

  getIo().to(`campana:${req.usuario.campana_id}`).emit('chat_mensaje', mensajeCompleto);
  res.status(201).json({ ok: true, data: mensajeCompleto });
});

export default router;

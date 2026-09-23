import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';
import { enviarPush } from './push.js';
import { usuarioEsDeMiCampana, ROLES_COORDINACION } from '../lib/pertenencia.js';

const router = Router();
router.use(requiereAuth);

const CANALES_VALIDOS = ['general', 'coordinadores'];

/**
 * Un canal puede ser 'general', 'coordinadores', o un DM con formato
 * "dm-{idMenor}-{idMayor}" (ordenados alfabéticamente para que ambas
 * personas calculen el MISMO nombre de canal sin coordinarse).
 */
function validarCanal(canal, usuarioId, rol) {
  if (CANALES_VALIDOS.includes(canal)) {
    // 🔒 Solo coordinación y mando (antes solo se excluía al promotor; representantes y voluntarios sí entraban).
    if (canal === 'coordinadores' && !ROLES_COORDINACION.includes(rol)) return { ok: false, error: 'Este canal es solo para coordinadores' };
    return { ok: true };
  }
  const match = canal.match(/^dm-([0-9a-f-]{36})-([0-9a-f-]{36})$/);
  if (!match) return { ok: false, error: 'Canal inválido' };
  if (match[1] !== usuarioId && match[2] !== usuarioId) return { ok: false, error: 'No puedes ver esta conversación' };
  return { ok: true };
}


/**
 * GET /api/chat/:canal
 * Últimos 100 mensajes de un canal — "coordinadores" solo lo pueden
 * ver quienes no son promotores.
 */
router.get('/:canal', async (req, res) => {
  const canal = req.params.canal;
  const validacion = validarCanal(canal, req.usuario.sub, req.usuario.rol);
  if (!validacion.ok) return res.status(403).json({ ok: false, error: validacion.error });

  const resultado = await query(
    `SELECT c.id, c.canal, c.texto, c.creado_en, c.autor_id, u.nombre as autor_nombre, u.rol as autor_rol, u.puesto as autor_puesto
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
  const canal = req.params.canal;
  const validacion = validarCanal(canal, req.usuario.sub, req.usuario.rol);
  if (!validacion.ok) return res.status(403).json({ ok: false, error: validacion.error });

  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ ok: false, error: 'Mensaje vacío' });
  if (texto.length > 2000) return res.status(400).json({ ok: false, error: 'Mensaje demasiado largo' });

  // 🔒 En mensajes directos, la otra persona debe ser de MI campaña —
  // antes se podían mandar notificaciones a usuarios de otras campañas.
  let destinatarioId = null;
  if (canal.startsWith('dm-')) {
    const [, idA, idB] = canal.match(/^dm-([0-9a-f-]{36})-([0-9a-f-]{36})$/);
    destinatarioId = idA === req.usuario.sub ? idB : idA;
    if (!(await usuarioEsDeMiCampana(destinatarioId, req.usuario.campana_id))) {
      return res.status(403).json({ ok: false, error: 'Esa persona no pertenece a tu campaña' });
    }
  }

  const resultado = await query(
    `INSERT INTO chat_mensajes (campana_id, canal, autor_id, texto) VALUES ($1,$2,$3,$4)
     RETURNING id, canal, texto, creado_en`,
    [req.usuario.campana_id, canal, req.usuario.sub, texto.trim()]
  );

  const mensajeCompleto = {
    ...resultado.rows[0],
    autor_id: req.usuario.sub,
    autor_nombre: req.usuario.nombre,
    autor_rol: req.usuario.rol,
  };

  // 🔒 Cada mensaje en vivo llega SOLO a quien le corresponde. Antes
  // todo se mandaba a la campaña completa, así que el celular de
  // cualquier promotor recibía los mensajes privados y los del canal
  // de coordinadores (aunque la pantalla no los mostrara).
  const io = getIo();
  if (destinatarioId) {
    io.to(`usuario:${req.usuario.sub}`).to(`usuario:${destinatarioId}`).emit('chat_mensaje', mensajeCompleto);
  } else if (canal === 'coordinadores') {
    io.to(`campana:${req.usuario.campana_id}:coordinadores`).emit('chat_mensaje', mensajeCompleto);
  } else {
    io.to(`campana:${req.usuario.campana_id}`).emit('chat_mensaje', mensajeCompleto);
  }

  // Push real SOLO en mensajes directos — en canales grupales (General,
  // Coordinadores) mandaríamos demasiadas notificaciones y la gente
  // terminaría apagándolas todas, incluyendo las que sí importan.
  if (destinatarioId) {
    enviarPush(destinatarioId, { titulo: `💬 ${req.usuario.nombre}`, cuerpo: texto.trim(), url: '/dashboard' }).catch(() => {});
  }

  res.status(201).json({ ok: true, data: mensajeCompleto });
});

/**
 * GET /api/chat-contactos/lista
 * Toda la gente con la que se puede platicar — para la columna
 * izquierda del chat. El estatus en línea lo maneja el frontend
 * directo por WebSocket (usuarios_en_linea), aquí solo mandamos
 * quién existe.
 */
router.get('/contactos/lista', async (req, res) => {
  const resultado = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios
     WHERE campana_id=$1 AND id != $2 AND activo != false
     ORDER BY CASE rol WHEN 'candidato' THEN 1 WHEN 'jefe_campana' THEN 2 WHEN 'coord_general' THEN 3
       WHEN 'coord_distrital' THEN 4 WHEN 'coord_municipal' THEN 5 WHEN 'coord_seccional' THEN 6 ELSE 7 END, nombre`,
    [req.usuario.campana_id, req.usuario.sub]
  );
  res.json({ ok: true, data: resultado.rows });
});

export default router;

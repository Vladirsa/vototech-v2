import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/zonas
 * Todas las secciones asignadas, con a quién — para pintar la
 * cobertura completa en el mapa de un jalón.
 */
router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT z.id, z.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, s.numero as seccion_numero
     FROM zonas_asignadas z
     JOIN usuarios u ON u.id = z.usuario_id
     JOIN secciones s ON s.id = z.seccion_id
     WHERE z.campana_id = $1`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaAsignar = z.object({
  usuario_id: z.string().uuid(),
  secciones: z.array(z.number().int()).min(1).max(200),
});

/**
 * POST /api/zonas/asignar
 * Asigna VARIAS secciones a un coordinador de un solo golpe — esto
 * es lo que permite "trazar una zona" en el mapa en vez de dar de
 * alta sección por sección.
 */
router.post('/asignar', async (req, res) => {
  const parseado = esquemaAsignar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
  const { usuario_id, secciones } = parseado.data;

  const usuarioValido = await query('SELECT id FROM usuarios WHERE id=$1 AND campana_id=$2', [usuario_id, req.usuario.campana_id]);
  if (!usuarioValido.rows[0]) return res.status(404).json({ ok: false, error: 'Usuario no encontrado en tu campaña' });

  let asignadas = 0;
  for (const numero of secciones) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [numero]);
    if (!s.rows[0]) continue;
    await query(
      `INSERT INTO zonas_asignadas (campana_id, usuario_id, seccion_id, asignado_por)
       VALUES ($1,$2,$3,$4) ON CONFLICT (campana_id, usuario_id, seccion_id) DO NOTHING`,
      [req.usuario.campana_id, usuario_id, s.rows[0].id, req.usuario.sub]
    );
    asignadas++;
  }

  res.json({ ok: true, asignadas });
});

/**
 * DELETE /api/zonas/:usuarioId/:seccionNumero
 * Quitar una sección de la zona de alguien (por si se reasigna).
 */
router.delete('/:usuarioId/:seccionNumero', async (req, res) => {
  const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [req.params.seccionNumero]);
  if (!s.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
  await query(
    'DELETE FROM zonas_asignadas WHERE campana_id=$1 AND usuario_id=$2 AND seccion_id=$3',
    [req.usuario.campana_id, req.params.usuarioId, s.rows[0].id]
  );
  res.json({ ok: true });
});

export default router;

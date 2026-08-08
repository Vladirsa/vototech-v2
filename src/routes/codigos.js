import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, u.nombre as creado_por_nombre
     FROM codigos_invitacion c
     LEFT JOIN usuarios u ON u.id = c.creado_por
     WHERE c.campana_id = $1 ORDER BY c.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaCodigo = z.object({
  rol_asignado: z.enum(['coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor']).default('promotor'),
  usos_maximos: z.number().int().min(1).default(1),
  dias_validez: z.number().int().min(1).max(365).optional(),
});

/**
 * POST /api/codigos
 * Solo roles de coordinación pueden generar códigos — un promotor
 * normal no debería poder invitar gente con rol de coordinador.
 */
router.post('/', requiereRol('candidato', 'jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional'), async (req, res) => {
  const parseado = esquemaCodigo.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  // Código legible: 4 letras + 4 números (fácil de leer/dictar por WhatsApp)
  const codigo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4) +
                 '-' + Math.floor(1000 + Math.random() * 9000);

  const expiraEn = d.dias_validez
    ? new Date(Date.now() + d.dias_validez * 86400000).toISOString()
    : null;

  const resultado = await query(
    `INSERT INTO codigos_invitacion (campana_id, codigo, rol_asignado, creado_por, usos_maximos, expira_en)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.usuario.campana_id, codigo, d.rol_asignado, req.usuario.sub, d.usos_maximos, expiraEn]
  );

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/:id/desactivar', async (req, res) => {
  await query('UPDATE codigos_invitacion SET activo=false WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

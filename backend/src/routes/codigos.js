import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';
import { puedeAsignarRol, MENSAJE_SIN_RANGO } from '../lib/jerarquiaRoles.js';

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
  // 🔒 Cada quien ve solo los códigos que él mismo podría crear (o los
  // que creó). Antes un coordinador seccional veía el código para
  // registrarse como Coordinador General y podía usarlo para darse
  // una cuenta de más rango.
  const visibles = resultado.rows.filter((c) => c.creado_por === req.usuario.sub || puedeAsignarRol(req.usuario, c.rol_asignado));
  res.json({ ok: true, data: visibles });
});

const esquemaCodigo = z.object({
  // Incluye los roles que la pantalla ya ofrecía (voluntario, encargados)
  // y que antes el servidor rechazaba. La jerarquía de abajo decide
  // quién puede invitar a qué.
  rol_asignado: z.enum(['coord_general', 'coord_regional', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor',
    'voluntario', 'encargado_juridico', 'encargado_finanzas', 'representante_casilla']).default('promotor'),
  usos_maximos: z.number().int().min(1).default(1),
  dias_validez: z.number().int().min(1).max(365).optional(),
});

/**
 * POST /api/codigos
 * Solo roles de coordinación pueden generar códigos — un promotor
 * normal no debería poder invitar gente con rol de coordinador.
 */
router.post('/', requiereRol('candidato', 'jefe_campana', 'coord_general', 'coord_regional', 'coord_distrital', 'coord_municipal', 'coord_seccional'), async (req, res) => {
  const parseado = esquemaCodigo.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  // 🔒 Solo se puede invitar a alguien de rango INFERIOR al propio —
  // antes un Coordinador Seccional podía generar un código de
  // Coordinador General, registrarse con él y subir de rango.
  if (!puedeAsignarRol(req.usuario, d.rol_asignado)) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }

  // Código legible: 4 letras + 4 números (fácil de leer/dictar por WhatsApp)
  // 🔒 Con azar criptográfico (antes Math.random, predecible).
  const codigo = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4) +
                 '-' + crypto.randomInt(1000, 10000);

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

// 🔒 Mismos roles que pueden crear códigos (antes cualquiera podía desactivarlos).
router.patch('/:id/desactivar', requiereRol('candidato', 'jefe_campana', 'coord_general', 'coord_regional', 'coord_distrital', 'coord_municipal', 'coord_seccional'), async (req, res) => {
  await query('UPDATE codigos_invitacion SET activo=false WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

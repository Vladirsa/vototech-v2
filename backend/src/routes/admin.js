import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';
import { crearDemo } from '../../seed-demo.js';

const router = Router();
router.use(requiereSuperAdmin); // TODO en este archivo requiere la clave secreta

/**
 * POST /api/admin/codigos-acceso
 * Genera un código de acceso — sin uno de estos, nadie puede
 * siquiera empezar a registrar una campaña nueva.
 */
router.post('/codigos-acceso', async (req, res) => {
  const codigo = 'ACC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const resultado = await query(
    'INSERT INTO codigos_acceso_campana (codigo, nota) VALUES ($1,$2) RETURNING *',
    [codigo, req.body.nota || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.get('/codigos-acceso', async (req, res) => {
  const resultado = await query('SELECT * FROM codigos_acceso_campana ORDER BY creado_en DESC');
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/admin/campanas
 * Todas las campañas registradas en la plataforma, con su estado
 * de aprobación — esto es tu panel de control central.
 */
router.get('/campanas', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, COUNT(u.id) as total_usuarios
     FROM campanas c LEFT JOIN usuarios u ON u.campana_id = c.id
     GROUP BY c.id ORDER BY c.creado_en DESC`
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * PATCH /api/admin/campanas/:id/aprobar
 * Sin esto, la campaña puede haberse registrado con un código
 * válido, pero SIGUE sin poder entrar al sistema hasta que tú,
 * manualmente, le des luz verde aquí.
 */
router.patch('/campanas/:id/aprobar', async (req, res) => {
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='aprobada', activa=true WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/campanas/:id/rechazar', async (req, res) => {
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='rechazada', activa=false WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * POST /api/admin/crear-demo
 * Crea (o reconstruye desde cero) la cuenta demo con datos de ejemplo
 * completos — un solo click desde el panel, sin necesitar terminal.
 */
router.post('/crear-demo', async (req, res) => {
  try {
    const credenciales = await crearDemo();
    res.json({ ok: true, data: credenciales, mensaje: 'Cuenta demo creada correctamente' });
  } catch (e) {
    console.error('Error creando demo:', e);
    res.status(500).json({ ok: false, error: 'No se pudo crear la demo: ' + e.message });
  }
});

export default router;

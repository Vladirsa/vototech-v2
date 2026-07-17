import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';
import { generarToken } from '../middleware/auth.js';
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
    `SELECT c.*, COUNT(u.id) as total_usuarios, MAX(u.ultimo_acceso) as ultimo_acceso
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
 * GET /api/admin/municipios
 * Catálogo de municipios de Tlaxcala, para el selector al generar demos.
 */
router.get('/municipios', async (req, res) => {
  const resultado = await query(
    `SELECT clave_ine, nombre FROM municipios WHERE estado_id=29 ORDER BY nombre`
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * POST /api/admin/crear-demo
 * Crea (o reconstruye desde cero) la cuenta demo con datos de ejemplo
 * completos — ahora personalizable por tipo de elección y municipio,
 * para presentar a cada candidato con SU propio territorio.
 */
router.post('/crear-demo', async (req, res) => {
  try {
    const { tipoEleccion, municipioClaveIne, nombreMunicipio } = req.body;
    const credenciales = await crearDemo({
      tipoEleccion: tipoEleccion || undefined,
      municipioClaveIne: municipioClaveIne ? parseInt(municipioClaveIne) : undefined,
      nombreMunicipio: nombreMunicipio || undefined,
    });
    res.json({ ok: true, data: credenciales, mensaje: 'Cuenta demo creada correctamente' });
  } catch (e) {
    console.error('Error creando demo:', e);
    res.status(500).json({ ok: false, error: 'No se pudo crear la demo: ' + e.message });
  }
});

/**
 * POST /api/admin/campanas/:id/continuar
 * Genera un token válido para entrar a revisar CUALQUIER campaña
 * sin necesitar su contraseña — solo tú, con tu SUPER_ADMIN_KEY,
 * puedes hacer esto. Útil para dar soporte o revisar antes de
 * aprobar/renovar. Entra con el usuario 'candidato' de esa campaña.
 */
router.post('/campanas/:id/continuar', async (req, res) => {
  const usuario = await query(
    `SELECT u.*, c.subdominio FROM usuarios u
     JOIN campanas c ON c.id = u.campana_id
     WHERE u.campana_id = $1 AND u.rol = 'candidato'
     ORDER BY u.creado_en LIMIT 1`,
    [req.params.id]
  );
  if (!usuario.rows[0]) return res.status(404).json({ ok: false, error: 'Esta campaña no tiene un usuario candidato' });

  const token = generarToken(usuario.rows[0]);
  res.json({ ok: true, data: { token, subdominio: usuario.rows[0].subdominio, nombre: usuario.rows[0].nombre } });
});

/**
 * DELETE /api/admin/codigos-acceso/:id
 * Elimina un código de acceso que ya no quieres que se pueda usar
 * (por ejemplo, uno que compartiste por error o ya no aplica).
 */
router.delete('/codigos-acceso/:id', async (req, res) => {
  await query('DELETE FROM codigos_acceso_campana WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;

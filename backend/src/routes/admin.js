import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';
import { generarToken } from '../middleware/auth.js';
import { crearDemo } from '../../seed-demo.js';
import { repararListaNominal } from '../../seed.js';

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
    `SELECT c.*, COUNT(u.id) as total_usuarios, MAX(u.ultimo_acceso) as ultimo_acceso,
            (SELECT telefono FROM usuarios WHERE campana_id=c.id AND rol='candidato' LIMIT 1) as telefono_candidato
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
  // Al aprobar, se activa Y se le da 1 mes de gracia automático desde
  // hoy — el candidato ya puede usar el sistema mientras se coordina
  // el primer pago formal.
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='aprobada', activa=true,
       fecha_activacion=now(), fecha_vencimiento=now() + interval '1 month'
     WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (resultado.rows[0]) {
    await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'aprobada','1 mes de gracia otorgado')`,
      [req.params.id, resultado.rows[0].nombre_candidato]);
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/campanas/:id/rechazar', async (req, res) => {
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='rechazada', activa=false WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (resultado.rows[0]) {
    await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion) VALUES ($1,$2,'rechazada')`,
      [req.params.id, resultado.rows[0].nombre_candidato]);
  }
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
    const { tipoEleccion, municipioClaveIne, nombreMunicipio, distritoNumero } = req.body;
    const credenciales = await crearDemo({
      tipoEleccion: tipoEleccion || undefined,
      municipioClaveIne: municipioClaveIne ? parseInt(municipioClaveIne) : undefined,
      nombreMunicipio: nombreMunicipio || undefined,
      distritoNumero: distritoNumero ? parseInt(distritoNumero) : undefined,
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
    `SELECT u.*, c.subdominio, c.estado_id FROM usuarios u
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

/**
 * PATCH /api/admin/campanas/:id/renovar
 * Extiende el vencimiento — se usa cada vez que el candidato paga
 * su mensualidad. body: { meses: 1 } (o 3, 12, lo que hayan pagado)
 */
router.patch('/campanas/:id/renovar', async (req, res) => {
  const meses = parseInt(req.body.meses) || 1;
  if (meses < 1 || meses > 24) return res.status(400).json({ ok: false, error: 'Meses inválido' });

  // Si ya venció, la renovación cuenta desde HOY (no desde la fecha
  // vieja de vencimiento) — así no se "acumulan" meses fantasma de
  // cuando estuvo suspendida.
  const resultado = await query(
    `UPDATE campanas SET
       fecha_vencimiento = GREATEST(COALESCE(fecha_vencimiento, now()), now()) + ($1 || ' months')::interval,
       activa = true
     WHERE id=$2 RETURNING *`,
    [meses, req.params.id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'renovada',$3)`,
    [req.params.id, resultado.rows[0].nombre_candidato, `+${meses} mes(es)`]);
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * DELETE /api/admin/campanas/:id
 * Borra la campaña por completo — usuarios, promovidos, todo (el
 * CASCADE en las tablas se encarga). No hay reversa, así que el
 * frontend debe confirmar dos veces antes de llamar esto.
 */
router.delete('/campanas/:id', async (req, res) => {
  try {
    const resultado = await query('DELETE FROM campanas WHERE id=$1 RETURNING nombre_candidato', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
    // campana_id queda NULL (la campaña ya no existe) pero el nombre se
    // conserva — así la bitácora sigue teniendo sentido después de borrar.
    await query(`INSERT INTO admin_bitacora (nombre_campana, accion) VALUES ($1,'borrada')`, [resultado.rows[0].nombre_candidato]);
    res.json({ ok: true, mensaje: `Campaña de ${resultado.rows[0].nombre_candidato} eliminada por completo` });
  } catch (e) {
    console.error('Error borrando campaña:', e);
    res.status(500).json({ ok: false, error: 'No se pudo borrar la campaña. Puede tener datos relacionados que lo impiden.' });
  }
});

/**
 * GET /api/admin/bitacora
 * Historial de qué se aprobó, rechazó, renovó o borró, y cuándo.
 */
router.get('/bitacora', async (req, res) => {
  const resultado = await query('SELECT * FROM admin_bitacora ORDER BY creado_en DESC LIMIT 100');
  res.json({ ok: true, data: resultado.rows });
});

/**
 * POST /api/admin/reparar-lista-nominal
 * Corrige bases de datos que se cargaron antes de que el sistema
 * guardara la lista nominal real por sección — un solo click, sin
 * tener que borrar y recargar todo.
 */
router.post('/reparar-lista-nominal', async (req, res) => {
  try {
    const actualizadas = await repararListaNominal();
    res.json({ ok: true, actualizadas, mensaje: `${actualizadas} secciones actualizadas con su lista nominal real` });
  } catch (e) {
    console.error('Error reparando lista nominal:', e);
    res.status(500).json({ ok: false, error: 'No se pudo reparar: ' + e.message });
  }
});

export default router;

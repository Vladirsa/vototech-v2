import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { generarToken } from '../middleware/auth.js';

const router = Router();

// ── VALIDACIÓN DE ENTRADA (zod) ──────────────────────────────
// Nunca confiar en lo que manda el cliente sin validar forma y tipo.
const esquemaRegistroCampana = z.object({
  nombre_candidato: z.string().min(3).max(200),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  partido: z.string().max(50).optional(),
  tipo_eleccion: z.enum(['ayuntamiento', 'dip_local', 'dip_federal', 'gobernador', 'pres_comunidad']),
  estado_id: z.number().int(),
  subdominio: z.string().regex(/^[a-z0-9-]{3,63}$/, 'Solo minúsculas, números y guiones'),
  territorio_tipo: z.enum(['municipio', 'seccion', 'distrito', 'estatal']).optional(),
  territorio_id: z.number().int().optional(),
  fecha_eleccion: z.string().optional(),
});

/**
 * POST /api/auth/registrar-campana
 * Crea una nueva campaña + su primer usuario (candidato/jefe de campaña).
 * Este es el punto de entrada para que un candidato nuevo se dé de alta
 * con su propio subdominio.
 */
router.post('/registrar-campana', async (req, res) => {
  const parseado = esquemaRegistroCampana.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const datos = parseado.data;

  try {
    // ¿El subdominio ya existe?
    const existente = await query('SELECT id FROM campanas WHERE subdominio = $1', [datos.subdominio]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ese subdominio ya está en uso, elige otro' });
    }

    // Crear la campaña
    const campana = await query(
      `INSERT INTO campanas (nombre_candidato, partido, tipo_eleccion, estado_id, subdominio, territorio_tipo, territorio_id, fecha_eleccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, subdominio`,
      [datos.nombre_candidato, datos.partido || null, datos.tipo_eleccion, datos.estado_id, datos.subdominio,
       datos.territorio_tipo || null, datos.territorio_id || null, datos.fecha_eleccion || null]
    );
    const campanaId = campana.rows[0].id;

    // Crear el primer usuario (candidato) con contraseña segura (bcrypt, nunca texto plano)
    const passwordHash = await bcrypt.hash(datos.password, 12);
    const usuario = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'candidato') RETURNING id, nombre, rol`,
      [campanaId, datos.nombre_candidato, datos.email, passwordHash]
    );

    const token = generarToken({
      id: usuario.rows[0].id,
      campana_id: campanaId,
      rol: 'candidato',
      nombre: datos.nombre_candidato,
    });

    res.status(201).json({
      ok: true,
      token,
      campana: { id: campanaId, subdominio: datos.subdominio },
      mensaje: `Campaña creada. Tu sistema estará disponible en ${datos.subdominio}.vototech.mx`,
    });
  } catch (e) {
    console.error('Error registrando campaña:', e);
    res.status(500).json({ ok: false, error: 'Error interno al crear la campaña' });
  }
});

/**
 * POST /api/auth/login
 * Inicio de sesión normal por email + contraseña, DENTRO de una campaña
 * específica (identificada por subdominio, que el frontend ya sabe por
 * la URL desde la que se está accediendo).
 */
const esquemaLogin = z.object({
  subdominio: z.string(),
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req, res) => {
  const parseado = esquemaLogin.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: 'Datos de login inválidos' });
  }
  const { subdominio, email, password } = parseado.data;

  try {
    const resultado = await query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.rol, u.activo, c.id as campana_id
       FROM usuarios u
       JOIN campanas c ON c.id = u.campana_id
       WHERE c.subdominio = $1 AND u.email = $2`,
      [subdominio, email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    const usuario = resultado.rows[0];

    if (!usuario.activo) {
      return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada. Contacta al Jefe de Campaña.' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);

    const token = generarToken(usuario);
    res.json({
      ok: true,
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
  } catch (e) {
    console.error('Error en login:', e);
    res.status(500).json({ ok: false, error: 'Error interno al iniciar sesión' });
  }
});

/**
 * POST /api/auth/registrar-con-codigo
 * Un promotor se registra usando un código de invitación — sin que
 * el Jefe de Campaña tenga que crear su cuenta manualmente uno por uno.
 */
const esquemaRegistroPromotor = z.object({
  codigo: z.string(),
  nombre: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  telefono: z.string().optional(),
});

router.post('/registrar-con-codigo', async (req, res) => {
  const parseado = esquemaRegistroPromotor.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const datos = parseado.data;

  try {
    const codigoRow = await query(
      `SELECT * FROM codigos_invitacion
       WHERE codigo = $1 AND activo = true
         AND (expira_en IS NULL OR expira_en > now())
         AND usos_actuales < usos_maximos`,
      [datos.codigo]
    );

    if (codigoRow.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Código de invitación inválido, expirado o ya usado' });
    }
    const invitacion = codigoRow.rows[0];

    const passwordHash = await bcrypt.hash(datos.password, 12);
    const nuevoUsuario = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nombre, rol`,
      [invitacion.campana_id, datos.nombre, datos.email, datos.telefono || null,
       passwordHash, invitacion.rol_asignado, invitacion.creado_por]
    );

    await query(
      'UPDATE codigos_invitacion SET usos_actuales = usos_actuales + 1 WHERE id = $1',
      [invitacion.id]
    );

    const token = generarToken({
      id: nuevoUsuario.rows[0].id,
      campana_id: invitacion.campana_id,
      rol: invitacion.rol_asignado,
      nombre: datos.nombre,
    });

    res.status(201).json({ ok: true, token, mensaje: '¡Bienvenido al equipo! Tu cuenta fue creada.' });
  } catch (e) {
    console.error('Error registrando con código:', e);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

export default router;

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_' + Math.random();

/**
 * Genera un token JWT de ACCESO — corto a propósito (30 min). La
 * sesión se mantiene viva renovándolo con el refresh token, no
 * haciéndolo durar horas: así, si alguien roba un token de acceso,
 * la ventana de daño es mucho más chica.
 */
export function generarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      campana_id: usuario.campana_id,
      rol: usuario.rol,
      nombre: usuario.nombre,
      // El puesto se usa para permisos más finos dentro de un mismo
      // rol — por ejemplo, un "voluntario" solo entra a Marketing si
      // su puesto específico es de esa área.
      puesto: usuario.puesto || null,
      estado_id: usuario.estado_id || 29,
      // El territorio individual del usuario (si tiene uno asignado)
      // — antes NO viajaba en el token, así que ningún endpoint podía
      // filtrar el mapa/promovidos por "solo lo tuyo".
      territorio_tipo: usuario.territorio_tipo || null,
      territorio_id: usuario.territorio_id || null,
      // Para poder bloquear escritura y candados de módulo en la
      // demo pública, sin tocar nada del comportamiento normal de
      // una campaña real.
      es_demo: usuario.es_demo || false,
    },
    JWT_SECRET,
    { expiresIn: '30m' }
  );
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

/**
 * Genera un refresh token nuevo — un valor aleatorio opaco (no un
 * JWT, no lleva información adentro), guarda su HASH en la base
 * (nunca el valor real, igual que una contraseña), y regresa el
 * valor real solo esta vez para dárselo al cliente.
 */
export async function generarRefreshToken(usuarioId) {
  const valorReal = crypto.randomBytes(40).toString('hex');
  const expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
  await query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3)`,
    [usuarioId, sha256(valorReal), expiraEn]
  );
  return valorReal;
}

/**
 * Valida un refresh token y lo ROTA — lo marca revocado y crea uno
 * nuevo en su lugar. Rotar en cada uso (en vez de reutilizar el
 * mismo refresh token por 30 días) significa que si alguien roba un
 * refresh token viejo y lo intenta usar después de que el dueño ya
 * lo canjeó, se detecta y se rechaza — un refresh token robado solo
 * sirve UNA vez.
 */
export async function validarYRotarRefreshToken(valorReal) {
  const hash = sha256(valorReal);
  const fila = await query(
    `SELECT rt.*, u.id as usuario_id, u.nombre, u.rol, u.campana_id, u.activo, c.estado_id
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.usuario_id
     JOIN campanas c ON c.id = u.campana_id
     WHERE rt.token_hash=$1`,
    [hash]
  );
  const registro = fila.rows[0];
  if (!registro) return null; // nunca existió
  if (registro.revocado_en) return null; // ya se usó o se revocó — posible robo, se rechaza
  if (new Date(registro.expira_en) < new Date()) return null; // expiró
  if (!registro.activo) return null; // el usuario fue desactivado

  await query('UPDATE refresh_tokens SET revocado_en=now() WHERE id=$1', [registro.id]);
  const nuevoRefresh = await generarRefreshToken(registro.usuario_id);

  return {
    usuario: { id: registro.usuario_id, nombre: registro.nombre, rol: registro.rol, campana_id: registro.campana_id, estado_id: registro.estado_id },
    refresh_token: nuevoRefresh,
  };
}

/** Revoca un refresh token específico — se usa al cerrar sesión. */
export async function revocarRefreshToken(valorReal) {
  await query('UPDATE refresh_tokens SET revocado_en=now() WHERE token_hash=$1 AND revocado_en IS NULL', [sha256(valorReal)]);
}

/**
 * Middleware: exige que la petición traiga un token válido.
 * Si es válido, agrega req.usuario con los datos del token
 * (incluido campana_id) para que las rutas siguientes lo usen.
 */
export function requiereAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;

    // 🔒 La campaña demo es de solo lectura — cualquiera que entre
    // por el link público puede ver TODO el sistema, pero no puede
    // agregar, editar ni borrar nada. Esto protege la demo de
    // quedar "ensuciada" con datos falsos, y empuja a quien de
    // verdad quiere usar el sistema a agendar una cita.
    const metodosDeEscritura = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (payload.es_demo && metodosDeEscritura.includes(req.method)) {
      return res.status(403).json({
        ok: false,
        error: '🔒 Esta es la demo pública — puedes ver todo el sistema, pero no se puede agregar, editar ni borrar nada aquí. Agenda una cita para probar el sistema completo con datos reales.',
        es_demo_bloqueado: true,
      });
    }

    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware: exige que el usuario tenga uno de los roles permitidos.
 * Usar DESPUÉS de requiereAuth.
 */
export function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        ok: false,
        error: `Tu rol (${req.usuario.rol}) no tiene permiso para esta acción`,
      });
    }
    next();
  };
}

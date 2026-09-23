import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/pool.js';

/**
 * 🔒 SEGURIDAD — una sola clave para todo el sistema.
 *
 * Antes había 3 claves de respaldo distintas escritas en el código
 * ('CAMBIAR_EN_PRODUCCION', 'dev-secret-key-...'). Si en el servidor
 * faltaba la variable JWT_SECRET, cualquiera que leyera el código
 * podía fabricar sesiones falsas. Ahora, si falta, se usa una clave
 * ALEATORIA que nadie conoce (lo peor que pasa es que las sesiones se
 * cierran al reiniciar el servidor) y se avisa fuerte en los logs.
 */
if (!process.env.JWT_SECRET) {
  console.error('🚨 JWT_SECRET NO está configurada en el servidor — se usa una clave aleatoria temporal. Configúrala en Render → Environment.');
}
export const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');

/**
 * 🔒 Los permisos TEMPORALES (paso intermedio de 2FA, y recuperación
 * de contraseña) se firman con una clave DERIVADA, distinta a la de
 * las sesiones normales. Así es matemáticamente imposible que uno de
 * esos permisos temporales se acepte como sesión completa — que era
 * exactamente el hueco que permitía saltarse la verificación en dos
 * pasos con solo la contraseña.
 */
const JWT_SECRET_TEMPORAL = crypto.createHash('sha256').update(`${JWT_SECRET}::tokens-temporales`).digest('hex');

export function firmarTokenTemporal(sub, tipo, expiresIn) {
  return jwt.sign({ sub, tipo }, JWT_SECRET_TEMPORAL, { expiresIn });
}

/** Regresa el payload si el token temporal es válido Y del tipo esperado; si no, lanza error. */
export function verificarTokenTemporal(token, tipoEsperado) {
  const payload = jwt.verify(token, JWT_SECRET_TEMPORAL);
  if (payload.tipo !== tipoEsperado) throw new Error('Tipo de token incorrecto');
  return payload;
}

/**
 * Verifica un token de SESIÓN normal (el de 30 minutos). Rechaza
 * cualquier token que traiga "tipo" (esos son temporales) o que no
 * traiga campaña — doble candado además de la clave distinta.
 * Lo usan tanto las rutas normales como los WebSockets.
 */
export function verificarTokenSesion(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.tipo || !payload.campana_id || !payload.sub) throw new Error('Token no es de sesión');
  return payload;
}

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
    `SELECT rt.*, u.id as usuario_id, u.nombre, u.rol, u.puesto, u.campana_id, u.activo, c.estado_id
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
    // 🔒 Incluye el puesto — antes se perdía al renovar la sesión (cada
    // 30 min), y un Coord. General limitado por su puesto terminaba
    // viendo TODOS los módulos después de la primera renovación.
    usuario: { id: registro.usuario_id, nombre: registro.nombre, rol: registro.rol, puesto: registro.puesto, campana_id: registro.campana_id, estado_id: registro.estado_id },
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
    req.usuario = verificarTokenSesion(token);
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

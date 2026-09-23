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
    `SELECT rt.*, u.id as usuario_id, u.nombre, u.rol, u.puesto, u.campana_id, u.activo, c.estado_id,
            c.activa as campana_activa, c.estado_aprobacion, c.fecha_vencimiento, c.es_demo
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.usuario_id
     JOIN campanas c ON c.id = u.campana_id
     WHERE rt.token_hash=$1`,
    [hash]
  );
  const registro = fila.rows[0];
  if (!registro) return null; // nunca existió
  if (registro.revocado_en) {
    // 🔒 Alguien usó un token que YA se había canjeado: o es un robo,
    // o el dueño lo usó después del ladrón. Por seguridad se cierran
    // TODAS las sesiones de esa persona (tendrá que volver a entrar).
    // Margen de 2 min para no castigar dos pestañas renovando a la vez o
    // una respuesta que se perdió por mala señal.
    // Solo cuenta como robo si ese token se había ROTADO (canjeado); si se
    // revocó por cambio de contraseña o cierre de sesión, no se castiga.
    if (registro.rotado_en && Date.now() - new Date(registro.rotado_en).getTime() > 2 * 60 * 1000) {
      await query('UPDATE refresh_tokens SET revocado_en=now() WHERE usuario_id=$1 AND revocado_en IS NULL', [registro.usuario_id]);
    }
    return null;
  }
  if (new Date(registro.expira_en) < new Date()) return null; // expiró
  if (!registro.activo) return null; // el usuario fue desactivado
  // 🔒 La campaña también debe seguir vigente (antes una campaña
  // suspendida, rechazada o vencida seguía entrando hasta 30 días).
  if (!registro.campana_activa || ['pendiente', 'rechazada'].includes(registro.estado_aprobacion)) return null;
  if (!registro.es_demo && registro.fecha_vencimiento && new Date(registro.fecha_vencimiento) < new Date()) return null;

  await query('UPDATE refresh_tokens SET revocado_en=now(), rotado_en=now() WHERE id=$1', [registro.id]);
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
// 🔒 ESTADO VIVO DE CADA SESIÓN — antes el servidor solo revisaba que
// el token estuviera bien firmado. Si el Jefe desactivaba a alguien o
// le bajaba el rol, esa persona seguía entrando con su rol viejo hasta
// 30 minutos (y su campaña podía estar suspendida). Ahora cada petición
// confirma contra la base (con memoria de 30 s para no saturarla):
//  - que la persona siga activa y en la misma campaña,
//  - que la campaña siga activa, aprobada y al corriente,
//  - y usa SIEMPRE el rol y puesto actuales, no los del token.
const cacheEstado = new Map(); // usuario → { hasta, estado }

async function estadoVivo(usuarioId) {
  const c = cacheEstado.get(usuarioId);
  if (c && c.hasta > Date.now()) return c.estado;
  const r = await query(
    `SELECT u.activo, u.rol, u.puesto, u.campana_id, c.activa as campana_activa, c.estado_aprobacion,
            c.fecha_vencimiento, c.es_demo
     FROM usuarios u JOIN campanas c ON c.id = u.campana_id WHERE u.id=$1`,
    [usuarioId]
  );
  const x = r.rows[0];
  const vigente = !!x && x.activo !== false && x.campana_activa !== false && !['pendiente', 'rechazada'].includes(x.estado_aprobacion)
    && (x.es_demo || !x.fecha_vencimiento || new Date(x.fecha_vencimiento) >= new Date());
  const estado = vigente ? { vigente: true, rol: x.rol, puesto: x.puesto, campana_id: x.campana_id } : { vigente: false };
  if (cacheEstado.size > 20000) cacheEstado.clear();
  cacheEstado.set(usuarioId, { hasta: Date.now() + 30 * 1000, estado });
  return estado;
}

/** Olvida el estado guardado de alguien (al desactivarlo o cambiarle el rol) para que aplique al instante. */
export function olvidarEstadoUsuario(usuarioId) {
  if (usuarioId) cacheEstado.delete(usuarioId);
  else cacheEstado.clear();
}

/** Cierra todas las sesiones de una persona (sus tokens de renovación). */
export async function revocarSesionesDe(usuarioId) {
  olvidarEstadoUsuario(usuarioId);
  await query('UPDATE refresh_tokens SET revocado_en=now() WHERE usuario_id=$1 AND revocado_en IS NULL', [usuarioId]);
}

export { estadoVivo };

/**
 * Middleware: exige que la petición traiga un token válido.
 * Si es válido, agrega req.usuario con los datos del token
 * (incluido campana_id) para que las rutas siguientes lo usen.
 */
export async function requiereAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  let usuario;
  try {
    usuario = verificarTokenSesion(token);
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
  const estado = await estadoVivo(usuario.sub);
  if (!estado.vigente || estado.campana_id !== usuario.campana_id) {
    return res.status(401).json({ ok: false, error: 'Tu sesión ya no es válida. Vuelve a entrar.' });
  }
  req.usuario = { ...usuario, rol: estado.rol, puesto: estado.puesto || null };
  next();
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

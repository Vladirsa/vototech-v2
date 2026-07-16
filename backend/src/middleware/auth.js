import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_' + Math.random();

/**
 * Genera un token JWT para un usuario ya autenticado.
 * El token lleva campana_id embebido — esto es la base de todo
 * el aislamiento multi-tenant: cada consulta a la base de datos
 * usa el campana_id que viene DENTRO del token firmado, nunca uno
 * que el cliente mande por su cuenta (eso sería falsificable).
 */
export function generarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      campana_id: usuario.campana_id,
      rol: usuario.rol,
      nombre: usuario.nombre,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
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

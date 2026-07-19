/**
 * Control de acceso real por módulo — la misma matriz que ya se usa
 * en el frontend (NavBar.jsx) para ocultar el menú, pero aplicada
 * aquí del lado del servidor, donde de verdad importa. Ocultar un
 * botón en React es una mejora de experiencia; esto es la seguridad
 * real: si alguien intenta entrar por la URL directa a un módulo que
 * no le toca, el backend responde 403 sin importar qué vea en pantalla.
 *
 * IMPORTANTE: si el menú del frontend cambia algún día, esta matriz
 * se debe actualizar junto con NavBar.jsx — son la misma regla de
 * negocio expresada en dos lugares.
 */
const TODOS_LOS_MODULOS = [
  'promovidos', 'priorizacion', 'estructura', 'reportes', 'agenda',
  'dia-eleccion', 'incidencias', 'finanzas', 'activos', 'marketing', 'juridico',
];

const MODULOS_POR_ROL = {
  candidato: TODOS_LOS_MODULOS,
  jefe_campana: TODOS_LOS_MODULOS,
  coord_general: TODOS_LOS_MODULOS,
  coord_distrital: TODOS_LOS_MODULOS.filter((m) => !['finanzas', 'juridico'].includes(m)),
  coord_municipal: TODOS_LOS_MODULOS.filter((m) => !['finanzas', 'juridico'].includes(m)),
  coord_seccional: ['promovidos', 'estructura', 'agenda', 'dia-eleccion', 'incidencias', 'activos'],
  promotor: ['promovidos', 'agenda', 'dia-eleccion', 'incidencias', 'activos'],
};

/**
 * Middleware: exige que el rol del usuario tenga acceso al módulo
 * indicado. Debe usarse DESPUÉS de requiereAuth (necesita req.usuario.rol).
 */
export function requiereModulo(clave) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const permitidos = MODULOS_POR_ROL[req.usuario.rol] || [];
    if (!permitidos.includes(clave)) {
      return res.status(403).json({
        ok: false,
        error: `Tu rol no tiene acceso al módulo de ${clave}. Si crees que esto es un error, contacta al jefe de campaña.`,
      });
    }
    next();
  };
}

export { MODULOS_POR_ROL, TODOS_LOS_MODULOS };

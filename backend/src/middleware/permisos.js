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
  // Coordinador seccional: su gente (no toda la estructura), sus
  // promovidos, Día D, y puede REPORTAR incidencias (el filtro de
  // "solo ver las que él creó" se resuelve dentro de incidencias.js,
  // no aquí — este middleware solo controla el módulo completo).
  coord_seccional: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  // Promotor: solo su pantalla de avance (no pasa por este
  // middleware de módulos — vive en /promovidos/mi-resumen, que sí
  // cae bajo 'promovidos') + Día D si le toca ser representante +
  // Incidencias para reportar algo urgente.
  promotor: ['promovidos', 'dia-eleccion', 'incidencias'],
  // Encargado de Jurídico: su área completa, más lo que necesita para
  // sustentar quejas/recursos (activos, incidencias) y ver promovidos.
  encargado_juridico: ['juridico', 'activos', 'incidencias', 'promovidos'],
  // Encargado de Finanzas: su área, más promovidos e incidencias para
  // dar contexto, sin acceso a nada más de la operación.
  encargado_finanzas: ['finanzas', 'promovidos', 'incidencias'],
  // Voluntario: la base para TODOS es 'promovidos' — lo demás se
  // resuelve por su "puesto" específico, ver VOLUNTARIO_POR_PUESTO
  // más abajo. No todos los voluntarios hacen lo mismo (uno toca
  // puertas, otro maneja Marketing, otro apoya en eventos), así que
  // no tiene sentido que todos vean los mismos módulos.
  voluntario: ['promovidos'],
};

/**
 * 🆕 MÓDULOS EXTRA SEGÚN EL PUESTO DE UN VOLUNTARIO — antes esto solo
 * existía a medias para Marketing (ver requiereModuloMarketing, que
 * ya quedó obsoleta y se deja abajo solo por compatibilidad). Ahora
 * se generaliza: cualquier tipo de voluntario (toque de puertas,
 * eventos, marketing, general) obtiene automáticamente el módulo que
 * le corresponde según las palabras de su puesto — sin tener que
 * crear un rol nuevo en la base de datos por cada tipo.
 *
 * El match es por texto parcial (no exacto) para que "Marketing y
 * Redes Sociales" o "Coordinador de Marketing" también activen la
 * regla, no solo la palabra "Marketing" sola.
 */
const MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO = [
  { patron: /marketing|redes sociales|whatsapp|difusi[oó]n/i, modulos: ['marketing'] },
  { patron: /evento/i, modulos: ['agenda'] },
  // "Toque de puertas", "Pinta de bardas", "Reparto de publicidad",
  // "Apoyo logístico", "General" — todos estos ya cubren su
  // necesidad real con el 'promovidos' base, no necesitan módulo extra.
];

function modulosDeVoluntario(puesto) {
  const extra = new Set();
  MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO.forEach((regla) => {
    if (regla.patron.test(puesto || '')) regla.modulos.forEach((m) => extra.add(m));
  });
  return [...new Set([...MODULOS_POR_ROL.voluntario, ...extra])];
}

/**
 * Middleware: exige que el rol del usuario tenga acceso al módulo
 * indicado. Debe usarse DESPUÉS de requiereAuth (necesita req.usuario.rol).
 */
export function requiereModulo(clave) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const permitidos = req.usuario.rol === 'voluntario'
      ? modulosDeVoluntario(req.usuario.puesto)
      : (MODULOS_POR_ROL[req.usuario.rol] || []);
    if (!permitidos.includes(clave)) {
      return res.status(403).json({
        ok: false,
        error: `Tu rol no tiene acceso al módulo de ${clave}. Si crees que esto es un error, contacta al jefe de campaña.`,
      });
    }
    next();
  };
}

/**
 * Se deja por compatibilidad con index.js (que la importa por su
 * nombre) — ahora simplemente delega a la misma lógica unificada de
 * arriba, ya no duplica el criterio de "contiene la palabra marketing".
 */
export function requiereModuloMarketing() {
  return requiereModulo('marketing');
}

export { MODULOS_POR_ROL, TODOS_LOS_MODULOS, modulosDeVoluntario };

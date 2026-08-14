/**
 * Control de acceso real por módulo — la misma matriz que ya se usa
 * en el frontend (AppShell.jsx) para ocultar el menú, pero aplicada
 * aquí del lado del servidor, donde de verdad importa. Ocultar un
 * botón en React es una mejora de experiencia; esto es la seguridad
 * real: si alguien intenta entrar por la URL directa a un módulo que
 * no le toca, el backend responde 403 sin importar qué vea en pantalla.
 *
 * IMPORTANTE: si el menú del frontend cambia algún día, esta matriz
 * se debe actualizar junto con AppShell.jsx — son la misma regla de
 * negocio expresada en dos lugares.
 *
 * 🆕 NOTA CLAVE: aunque en el frontend "Activos" ya no es un botón
 * propio (vive como pestaña dentro de la página de "finanzas"), el
 * backend SIGUE exigiendo el módulo 'activos' por separado para las
 * rutas /api/activos — así que cualquier rol que deba ver la pestaña
 * de Activos dentro de Administración necesita AMBAS claves,
 * 'finanzas' Y 'activos', juntas. Olvidar una de las dos rompe esa
 * pestaña en silencio (la página carga, pero esa pestaña da 403).
 */
const TODOS_LOS_MODULOS = [
  'promovidos', 'priorizacion', 'estructura', 'reportes', 'agenda', 'logistica',
  'dia-eleccion', 'incidencias', 'finanzas', 'activos', 'marketing', 'juridico',
];

const MODULOS_POR_ROL = {
  candidato: TODOS_LOS_MODULOS,
  jefe_campana: TODOS_LOS_MODULOS,
  coord_general: TODOS_LOS_MODULOS,
  coord_distrital: TODOS_LOS_MODULOS.filter((m) => !['finanzas', 'activos', 'juridico'].includes(m)),
  coord_municipal: TODOS_LOS_MODULOS.filter((m) => !['finanzas', 'activos', 'juridico'].includes(m)),
  coord_seccional: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias', 'logistica'],
  promotor: ['promovidos', 'dia-eleccion', 'incidencias'],
  encargado_juridico: ['juridico', 'finanzas', 'activos', 'incidencias', 'promovidos'],
  encargado_finanzas: ['finanzas', 'activos', 'promovidos', 'incidencias'],
  voluntario: ['promovidos'],
};

const MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO = [
  { patron: /marketing|redes sociales|whatsapp|difusi[oó]n/i, modulos: ['marketing'] },
  { patron: /evento/i, modulos: ['agenda'] },
];

function modulosDeVoluntario(puesto) {
  const extra = new Set();
  MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO.forEach((regla) => {
    if (regla.patron.test(puesto || '')) regla.modulos.forEach((m) => extra.add(m));
  });
  return [...new Set([...MODULOS_POR_ROL.voluntario, ...extra])];
}

/**
 * 🆕 MÓDULOS POR PUESTO DE COORDINADOR GENERAL — hasta ahora
 * cualquier "coord_general" veía TODO, sin importar si su puesto real
 * era Secretario Particular o Coordinador de Logística. Con esto, si
 * el puesto coincide con alguno de los patrones de abajo, se le da
 * acceso SOLO a lo que le corresponde a ese puesto.
 *
 * Si el puesto NO coincide con ningún patrón (vacío, o algo que no se
 * reconoce), se usa el comportamiento de siempre: acceso completo —
 * así ningún coordinador general existente pierde acceso al desplegar
 * este cambio.
 */
const MODULOS_POR_PUESTO_COORD_GENERAL = [
  { patron: /secretari[oa] particular/i, modulos: ['agenda'] },
  { patron: /log[íi]stica|avanzada|seguridad/i, modulos: ['agenda', 'logistica', 'finanzas', 'activos'] },
  { patron: /movilizaci[oó]n/i, modulos: ['dia-eleccion', 'promovidos', 'logistica'] },
  { patron: /comunicaci[oó]n|prensa/i, modulos: ['marketing', 'juridico'] },
  { patron: /digital|redes sociales/i, modulos: ['marketing', 'reportes'] },
  { patron: /contenido|discurso/i, modulos: ['marketing'] },
  { patron: /representantes? de casilla/i, modulos: ['dia-eleccion', 'estructura'] },
  { patron: /estrategia/i, modulos: ['priorizacion', 'reportes'] },
  { patron: /finanzas|administraci[oó]n/i, modulos: ['finanzas', 'activos'] },
  { patron: /jur[íi]dico/i, modulos: ['juridico'] },
];

function modulosDeCoordGeneral(puesto) {
  if (!puesto) return TODOS_LOS_MODULOS;
  const regla = MODULOS_POR_PUESTO_COORD_GENERAL.find((r) => r.patron.test(puesto));
  return regla ? regla.modulos : TODOS_LOS_MODULOS;
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
    let permitidos;
    if (req.usuario.rol === 'voluntario') permitidos = modulosDeVoluntario(req.usuario.puesto);
    else if (req.usuario.rol === 'coord_general') permitidos = modulosDeCoordGeneral(req.usuario.puesto);
    else permitidos = MODULOS_POR_ROL[req.usuario.rol] || [];

    if (!permitidos.includes(clave)) {
      return res.status(403).json({
        ok: false,
        error: `Tu rol no tiene acceso al módulo de ${clave}. Si crees que esto es un error, contacta al jefe de campaña.`,
      });
    }
    next();
  };
}

export function requiereModuloMarketing() {
  return requiereModulo('marketing');
}

export { MODULOS_POR_ROL, TODOS_LOS_MODULOS, modulosDeVoluntario, modulosDeCoordGeneral };

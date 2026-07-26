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

  // ── Cadena jerárquica territorial nueva ── Cada nivel puede
  // construir SU PROPIA sub-estructura (por eso 'estructura'), ver
  // sus promovidos, y lo básico de campo. El filtro de "solo su
  // propia rama, no toda la campaña" ya vive dentro de cada endpoint
  // (estructura.js, incidencias.js), no aquí — este middleware solo
  // decide qué MÓDULOS completos puede tocar cada rol.
  coordinador_territorial: TODOS_LOS_MODULOS.filter((m) => !['finanzas', 'juridico'].includes(m)),
  enlace_distrital_federal: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias', 'reportes', 'priorizacion'],
  enlace_distrital_local: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias', 'reportes', 'priorizacion'],
  enlace_municipal: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  enlace_seccional: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  // Enlaces temáticos — su tarea es más específica, pero también
  // arman su propio equipo dentro de su especialidad.
  enlace_jovenes: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  enlace_mujeres: ['promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  enlace_brigadas: ['promovidos', 'estructura', 'activos', 'incidencias'],
  enlace_activos: ['activos', 'estructura', 'incidencias'],
  // Coordinador Político: platica con partidos, lleva su propio
  // padrón (promovidos) y arma su propia gente (estructura), pero no
  // necesita Día D ni Incidencias — su trabajo es antes de la elección.
  coordinador_politico: ['promovidos', 'estructura', 'marketing'],

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
  // Voluntario: promovidos siempre. Marketing NO se controla aquí —
  // solo algunos voluntarios (los del área de marketing) lo tienen,
  // y eso se resuelve por su "puesto" dentro del propio middleware
  // de marketing, no aquí (ver requiereModuloOPuesto más abajo).
  voluntario: ['promovidos'],
};

import { query } from '../db/pool.js';

/**
 * Cache en memoria de las excepciones de cada campaña — para no
 * consultar la base de datos en CADA petición. Se refresca solo si
 * pasaron más de 30 segundos, así que un cambio de permisos tarda
 * como máximo eso en verse reflejado.
 */
const cachePermisos = new Map(); // campana_id -> { datos: {rol:{modulo:bool}}, expira: timestamp }

async function obtenerExcepciones(campanaId) {
  const enCache = cachePermisos.get(campanaId);
  if (enCache && enCache.expira > Date.now()) return enCache.datos;

  const resultado = await query('SELECT rol, modulo, permitido FROM permisos_personalizados WHERE campana_id=$1', [campanaId]);
  const datos = {};
  resultado.rows.forEach((r) => {
    if (!datos[r.rol]) datos[r.rol] = {};
    datos[r.rol][r.modulo] = r.permitido;
  });
  cachePermisos.set(campanaId, { datos, expira: Date.now() + 30000 });
  return datos;
}

/** Se llama al guardar un cambio, para que se refleje de inmediato sin esperar los 30s. */
export function invalidarCachePermisos(campanaId) {
  cachePermisos.delete(campanaId);
}

/**
 * Middleware: exige que el rol del usuario tenga acceso al módulo
 * indicado. Primero revisa si el candidato personalizó una
 * excepción para ese rol+módulo en SU campaña; si no hay ninguna,
 * cae al default de siempre. Debe usarse DESPUÉS de requiereAuth.
 */
export function requiereModulo(clave) {
  return async (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const excepciones = await obtenerExcepciones(req.usuario.campana_id);
    const excepcion = excepciones[req.usuario.rol]?.[clave];

    const permitido = excepcion !== undefined
      ? excepcion
      : (MODULOS_POR_ROL[req.usuario.rol] || []).includes(clave);

    if (!permitido) {
      return res.status(403).json({
        ok: false,
        error: `Tu rol no tiene acceso al módulo de ${clave}. Si crees que esto es un error, contacta al jefe de campaña.`,
      });
    }
    next();
  };
}

/**
 * Variante para Marketing: la mayoría de los roles usan la matriz
 * normal, pero un "voluntario" solo entra si además tiene el puesto
 * correcto (ej. "Marketing") — no todos los voluntarios, solo los
 * asignados a esa tarea específica.
 */
export function requiereModuloMarketing() {
  return async (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ ok: false, error: 'No autenticado' });
    const excepciones = await obtenerExcepciones(req.usuario.campana_id);
    const excepcion = excepciones[req.usuario.rol]?.['marketing'];
    if (excepcion === true) return next();
    if (excepcion === undefined) {
      const permitidosDirecto = MODULOS_POR_ROL[req.usuario.rol] || [];
      if (permitidosDirecto.includes('marketing')) return next();
      if (req.usuario.rol === 'voluntario' && (req.usuario.puesto || '').toLowerCase().includes('marketing')) return next();
    }
    return res.status(403).json({ ok: false, error: 'Tu rol no tiene acceso al módulo de marketing.' });
  };
}

export { MODULOS_POR_ROL, TODOS_LOS_MODULOS };

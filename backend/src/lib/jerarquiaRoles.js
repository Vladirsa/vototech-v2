/**
 * 🔒 JERARQUÍA DE ROLES — una sola regla para todo el sistema.
 *
 * Antes cada ruta decidía por su cuenta quién podía crear o editar a
 * quién, y varias no revisaban nada: un Coordinador Seccional podía
 * cambiarse a sí mismo a "Jefe de Campaña", crear cuentas de Jefe, o
 * generar invitaciones de Coordinador General.
 *
 * La regla ahora es simple y la misma en todos lados:
 *   → Solo puedes crear, invitar, editar o desactivar a alguien de
 *     rango ESTRICTAMENTE MENOR al tuyo.
 *   → Nadie puede cambiar su propio rol, puesto, estado activo,
 *     coordinador o territorio (solo su nombre y teléfono).
 *
 * Números más altos = más rango. Los encargados de área (jurídico,
 * finanzas) quedan arriba del coordinador seccional y debajo del
 * municipal: no dirigen territorio, pero manejan información sensible.
 */
export const NIVEL_ROL = {
  candidato: 100,
  jefe_campana: 90,
  coord_general: 80,
  coord_regional: 70,
  coord_distrital: 60,
  coord_municipal: 50,
  encargado_juridico: 45,
  encargado_finanzas: 45,
  coord_seccional: 40,
  promotor: 20,
  representante_casilla: 15,
  voluntario: 10,
  observador: 5,
};

/**
 * "Nivel Dirección" — en la pantalla de Estructura, estos puestos se
 * dan de alta con el rol jefe_campana (ver PUESTOS_POR_ROL en
 * frontend/src/pages/Estructura.jsx). Quedan UN escalón debajo del
 * Jefe de Campaña titular: el Jefe los puede administrar, pero ellos
 * no pueden tocar al Jefe ni entre sí. Si se agrega un puesto de
 * Dirección en el frontend, hay que agregarlo aquí también.
 */
export const PUESTOS_DIRECCION = [
  'Secretario Particular', 'Coordinador General de Campaña', 'Coordinador Jurídico',
  'Coordinador Territorial', 'Coordinador Político', 'Coordinador de Comunicación', 'Coordinador de Finanzas',
];
const NIVEL_DIRECCION = 85;

/** Nivel real de una persona, tomando en cuenta su rol Y su puesto. */
export function nivelDe(rol, puesto) {
  if (rol === 'jefe_campana' && puesto && PUESTOS_DIRECCION.includes(puesto)) return NIVEL_DIRECCION;
  return NIVEL_ROL[rol] ?? 0;
}

/**
 * ¿`actor` ({rol, puesto}) puede dejar a alguien con `rolNuevo` +
 * `puestoNuevo`? (al crear, invitar o cambiarle el rol/puesto)
 */
export function puedeAsignarRol(actor, rolNuevo, puestoNuevo = null) {
  const nivelNuevo = nivelDe(rolNuevo, puestoNuevo);
  return nivelNuevo > 0 && nivelNuevo < nivelDe(actor.rol, actor.puesto);
}

/** ¿`actor` puede editar/desactivar/mover a `objetivo` ({rol, puesto})? */
export function puedeGestionarA(actor, objetivo) {
  return nivelDe(objetivo.rol, objetivo.puesto) < nivelDe(actor.rol, actor.puesto);
}

/** Campos que una persona SÍ puede cambiar de su propio perfil. */
export const CAMPOS_EDITABLES_DE_UNO_MISMO = ['nombre', 'telefono'];

export const MENSAJE_SIN_RANGO = 'No tienes el rango necesario para esta acción: solo puedes gestionar personas de un nivel inferior al tuyo.';

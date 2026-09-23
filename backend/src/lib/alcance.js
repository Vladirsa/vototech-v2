import { query } from '../db/pool.js';
import { ROLES_MANDO, soloVeLoPropio } from './pertenencia.js';

/**
 * 🔒 ALCANCE DE CADA PERSONA — "¿qué registros le tocan?"
 *
 * Regla acordada con Vlado: TERRITORIO + EQUIPO.
 *  - Candidato, Jefe y Coord. General: ven toda la campaña.
 *  - Coordinadores (regional, distrital, municipal, seccional): ven lo
 *    que está en SU territorio asignado (municipio, distrito, sección o
 *    región) Y lo que registró la gente que depende de ellos en el
 *    organigrama (toda su rama, hacia abajo).
 *  - Roles de campo (promotor, representante, voluntario...): solo lo
 *    suyo, como en la ronda 2.
 *
 * Antes, un coordinador municipal de Apizaco veía el padrón de TODA
 * la campaña (incluido el de otros municipios y otros equipos).
 *
 * El cálculo se guarda 60 segundos por persona para no recalcular el
 * organigrama en cada clic.
 */
const cache = new Map(); // usuario → { hasta, alcance }

export async function alcanceDe(usuario) {
  if (ROLES_MANDO.includes(usuario.rol)) return { todo: true };
  if (soloVeLoPropio(usuario)) return { todo: false, equipo: [usuario.sub], secciones: [] };

  const guardado = cache.get(usuario.sub);
  if (guardado && guardado.hasta > Date.now()) return guardado.alcance;

  // 1) Equipo: él mismo + toda su rama hacia abajo en el organigrama.
  const equipoRes = await query(
    `WITH RECURSIVE rama AS (
       SELECT id, 1 AS nivel FROM usuarios WHERE id=$1 AND campana_id=$2
       UNION ALL
       SELECT u.id, rama.nivel + 1 FROM usuarios u JOIN rama ON u.parent_id = rama.id
       WHERE u.campana_id=$2 AND rama.nivel < 12
     )
     SELECT DISTINCT id FROM rama`,
    [usuario.sub, usuario.campana_id]
  );
  const equipo = equipoRes.rows.map((r) => r.id);
  if (!equipo.includes(usuario.sub)) equipo.push(usuario.sub);

  // 2) Territorio: las secciones (id interno) de su zona asignada.
  const yo = await query(
    'SELECT territorio_tipo, territorio_id, region_id FROM usuarios WHERE id=$1 AND campana_id=$2',
    [usuario.sub, usuario.campana_id]
  );
  const { territorio_tipo: tipo, territorio_id: tid, region_id: regionId } = yo.rows[0] || {};
  const estado = usuario.estado_id;
  let secciones = [];
  let r = await seccionesDeTerritorio(estado, tipo, tid);
  if (!r && regionId) {
    const region = await query('SELECT municipios_ids, unidad_tipo FROM regiones_campana WHERE id=$1 AND campana_id=$2', [regionId, usuario.campana_id]);
    const reg = region.rows[0];
    if (reg?.municipios_ids?.length) {
      r = reg.unidad_tipo === 'seccion'
        ? await query('SELECT id FROM secciones WHERE estado_id=$1 AND numero = ANY($2::int[])', [estado, reg.municipios_ids])
        : await query('SELECT id FROM secciones WHERE estado_id=$1 AND municipio_id = ANY($2::int[])', [estado, reg.municipios_ids]);
    }
  }
  if (r) secciones = r.rows.map((x) => x.id);

  const alcance = { todo: false, equipo, secciones };
  if (cache.size > 5000) cache.clear();
  cache.set(usuario.sub, { hasta: Date.now() + 60 * 1000, alcance });
  return alcance;
}

/** Secciones (id interno) que abarca un territorio. null si no hay territorio. */
async function seccionesDeTerritorio(estado, tipo, tid) {
  if (tipo === 'seccion' && tid) return query('SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2', [estado, tid]);
  if (tipo === 'distrito_local' && tid) return query('SELECT id FROM secciones WHERE estado_id=$1 AND distrito_local=$2', [estado, tid]);
  if (tipo === 'distrito_federal' && tid) return query('SELECT id FROM secciones WHERE estado_id=$1 AND distrito_federal=$2', [estado, tid]);
  if (tipo === 'municipio' && tid) {
    // En usuarios, "municipio" guarda la CLAVE INE (no el id interno).
    return query(
      'SELECT s.id FROM secciones s JOIN municipios m ON m.id=s.municipio_id WHERE s.estado_id=$1 AND m.clave_ine=$2',
      [estado, tid]
    );
  }
  if (tipo === 'estatal') return query('SELECT id FROM secciones WHERE estado_id=$1', [estado]);
  return null;
}

/**
 * 🔒 ¿`usuario` puede asignarle a alguien este territorio?
 * Mandos: cualquiera. Coordinadores: solo un territorio que quede
 * DENTRO del suyo (antes un coordinador municipal podía darle
 * "todo el estado" a alguien de su equipo — o a una cuenta suya —
 * y así ver el padrón completo).
 */
export async function territorioPermitido(usuario, tipo, tid) {
  if (ROLES_MANDO.includes(usuario.rol)) return true;
  if (!tipo) return true; // quitar territorio siempre se puede
  if (tipo === 'estatal') return false;
  const r = await seccionesDeTerritorio(usuario.estado_id, tipo, tid);
  const nuevas = r ? r.rows.map((x) => x.id) : [];
  if (!nuevas.length) return false;
  const { secciones } = await alcanceDe(usuario);
  const mias = new Set(secciones);
  return nuevas.every((id) => mias.has(id));
}

/** Para borrar el cálculo guardado cuando cambia el organigrama o un territorio. */
export function limpiarCacheAlcance() {
  cache.clear();
}

/**
 * Arma el pedazo de SQL para filtrar una consulta por alcance.
 * Agrega sus valores al arreglo `params` (así los $N siempre cuadran).
 *
 * @param usuario   req.usuario
 * @param params    arreglo de parámetros de la consulta (se modifica)
 * @param columnas  { personas: ['p.registrado_por', ...], seccion: 'p.seccion_id' }
 * @returns '' si ve todo, o ' AND (...)'
 */
export async function filtroAlcance(usuario, params, columnas) {
  const cond = await condicionAlcance(usuario, params, columnas);
  return cond === 'TRUE' ? '' : ` AND ${cond}`;
}

/**
 * Igual que filtroAlcance pero regresa solo la condición (sin "AND"),
 * para usarla dentro de un CASE (ej. mostrar el nombre solo si la
 * persona está en tu alcance). 'TRUE' si ve todo.
 */
export async function condicionAlcance(usuario, params, { personas = [], seccion = null }) {
  const a = await alcanceDe(usuario);
  if (a.todo) return 'TRUE';
  const partes = [];
  if (personas.length) {
    params.push(a.equipo);
    const n = params.length;
    personas.forEach((col) => partes.push(`${col} = ANY($${n}::uuid[])`));
  }
  if (seccion && a.secciones.length) {
    params.push(a.secciones);
    partes.push(`${seccion} = ANY($${params.length}::int[])`);
  }
  return partes.length ? `(${partes.join(' OR ')})` : 'FALSE';
}

/** ¿Este registro concreto está dentro del alcance? (para ver/editar uno) */
export async function dentroDeAlcance(usuario, { personas = [], seccionId = null }) {
  const a = await alcanceDe(usuario);
  if (a.todo) return true;
  if (personas.some((p) => p && a.equipo.includes(p))) return true;
  return seccionId != null && a.secciones.includes(Number(seccionId));
}

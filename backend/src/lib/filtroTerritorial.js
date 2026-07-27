import { query } from '../db/pool.js';

// Roles que ven TODA la campaña sin importar su territorio individual
// — los mismos 3 que ya no se pueden restringir en Estructura.
const ROLES_VEN_TODO = ['candidato', 'jefe_campana', 'coord_general'];

/**
 * Antes, el territorio individual de un usuario (guardado en su
 * propio registro — ej. "Enlace Municipal de Apizaco") solo se usaba
 * para mostrar quién es el responsable en la ficha del mapa, pero
 * NUNCA restringía qué veía esa persona en el Mapa o en la lista de
 * Promovidos — un Coordinador Municipal veía TODO el distrito, no
 * solo su municipio.
 *
 * Esta función regresa el pedazo de SQL (y sus parámetros) para
 * filtrar cualquier consulta que use secciones (alias `s`) al
 * territorio individual del usuario que hace la petición — o
 * ningún filtro si el usuario ve todo (mando alto) o no tiene
 * territorio individual asignado.
 *
 * @param {object} usuario - req.usuario (viene del token)
 * @param {string} alias - alias de la tabla `secciones` en el SQL, default 's'
 * @param {number} indiceInicial - en qué número de parámetro ($N) empezar
 */
export async function filtroTerritorioUsuario(usuario, alias = 's', indiceInicial = 2) {
  if (ROLES_VEN_TODO.includes(usuario.rol)) return { sql: '', params: [] };
  if (!usuario.territorio_tipo || !usuario.territorio_id) return { sql: '', params: [] };

  if (usuario.territorio_tipo === 'seccion') {
    return { sql: `AND ${alias}.numero = $${indiceInicial}`, params: [usuario.territorio_id] };
  }
  if (usuario.territorio_tipo === 'distrito_local') {
    return { sql: `AND ${alias}.distrito_local = $${indiceInicial}`, params: [usuario.territorio_id] };
  }
  if (usuario.territorio_tipo === 'distrito_federal') {
    return { sql: `AND ${alias}.distrito_federal = $${indiceInicial}`, params: [usuario.territorio_id] };
  }
  if (usuario.territorio_tipo === 'municipio') {
    // territorio_id de un usuario con tipo "municipio" guarda la
    // CLAVE INE del municipio (no el id interno), igual que en campanas.
    const muni = await query('SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2', [usuario.estado_id, usuario.territorio_id]);
    if (!muni.rows[0]) return { sql: `AND 1=0`, params: [] }; // municipio inválido — mejor no mostrar nada a que se muestre de más
    return { sql: `AND ${alias}.municipio_id = $${indiceInicial}`, params: [muni.rows[0].id] };
  }
  return { sql: '', params: [] };
}

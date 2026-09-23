import { query } from '../db/pool.js';

/**
 * 🔒 AISLAMIENTO ENTRE CAMPAÑAS — funciones de "¿esto es mío?".
 *
 * Cada campaña debe ver y tocar SOLO su propia información. Varias
 * rutas buscaban registros solo por su número de identificación, sin
 * revisar a qué campaña pertenecían — así, conociendo el identificador,
 * una campaña podía leer o borrar datos de otra. Estas funciones se
 * usan antes de leer/escribir cualquier registro "hijo" (documentos,
 * compromisos, checklist...) que no guarda su propia campaña.
 */

export async function eventoEsDeMiCampana(eventoId, campanaId) {
  const r = await query('SELECT 1 FROM agenda WHERE id=$1 AND campana_id=$2', [eventoId, campanaId]);
  return !!r.rows[0];
}

export async function usuarioEsDeMiCampana(usuarioId, campanaId) {
  const r = await query('SELECT 1 FROM usuarios WHERE id=$1 AND campana_id=$2', [usuarioId, campanaId]);
  return !!r.rows[0];
}

/**
 * 🔒 Nombre de archivo seguro para guardar en el almacenamiento: sin
 * diagonales ni caracteres raros (evita que alguien meta "../" en el
 * nombre para escribir fuera de la carpeta de su campaña).
 */
export function nombreArchivoSeguro(nombreOriginal) {
  const limpio = String(nombreOriginal || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-120);
  return limpio || 'archivo';
}

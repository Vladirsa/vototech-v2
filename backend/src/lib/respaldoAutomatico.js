import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const TABLAS_A_RESPALDAR = [
  { tabla: 'usuarios', columnas: 'id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id, meta_diaria, activo, creado_en' },
  { tabla: 'promovidos', columnas: '*' },
  { tabla: 'activos', columnas: '*' },
  { tabla: 'incidencias', columnas: '*' },
  { tabla: 'gastos_campana', columnas: '*' },
  { tabla: 'ingresos_campana', columnas: '*' },
  { tabla: 'agenda', columnas: '*' },
  { tabla: 'casillas', columnas: '*' },
  { tabla: 'resultados_casilla', columnas: '*' },
  { tabla: 'documentos', columnas: 'id, categoria, nombre, url, creado_en' }, // sin el archivo en sí, solo el registro — el archivo ya vive en Storage por separado
];

/**
 * Respalda TODA la información de una campaña en un solo archivo
 * JSON — a diferencia del "Respaldo completo" manual (que es un
 * Excel resumido para que el candidato lo revise), este es completo
 * y pensado para RESTAURAR, no para leer. Se guarda en Supabase
 * Storage, nunca en el servidor de la aplicación (que se reinicia y
 * pierde archivos locales).
 */
async function respaldarCampana(campanaId, supabase) {
  const respaldo = { campana_id: campanaId, fecha: new Date().toISOString(), tablas: {} };

  for (const { tabla, columnas } of TABLAS_A_RESPALDAR) {
    try {
      const resultado = await query(`SELECT ${columnas} FROM ${tabla} WHERE campana_id=$1`, [campanaId]);
      respaldo.tablas[tabla] = resultado.rows;
    } catch (e) {
      console.error(`⚠️ Error respaldando tabla ${tabla} de campaña ${campanaId}:`, e.message);
      respaldo.tablas[tabla] = { error: e.message };
    }
  }

  const nombreArchivo = `${campanaId}/respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  const { error } = await supabase.storage
    .from('respaldos')
    .upload(nombreArchivo, JSON.stringify(respaldo), { contentType: 'application/json', upsert: true });

  if (error) throw error;
  return nombreArchivo;
}

/** Borra respaldos de más de 90 días — se queda con 2 semanas de historial, sin crecer sin límite. */
async function limpiarRespaldosViejos(campanaId, supabase) {
  const { data: archivos } = await supabase.storage.from('respaldos').list(campanaId);
  if (!archivos) return;
  const limite = new Date();
  limite.setDate(limite.getDate() - 90);

  for (const archivo of archivos) {
    const fechaStr = archivo.name.match(/respaldo-(\d{4}-\d{2}-\d{2})\.json/)?.[1];
    if (fechaStr && new Date(fechaStr) < limite) {
      await supabase.storage.from('respaldos').remove([`${campanaId}/${archivo.name}`]);
    }
  }
}

/**
 * Corre una vez al día para TODAS las campañas activas (no demo —
 * esas se regeneran solas, no necesitan respaldo).
 */
export async function respaldarTodasLasCampanas() {
  const supabase = clienteSupabase();
  if (!supabase) {
    console.error('⚠️ Respaldo automático sin configurar: faltan SUPABASE_URL/SUPABASE_SERVICE_KEY en el servidor');
    return;
  }

  const campanas = await query(`SELECT id, nombre_candidato FROM campanas WHERE es_demo=false AND activa=true`);
  console.log(`💾 Iniciando respaldo automático de ${campanas.rows.length} campaña(s)...`);

  for (const c of campanas.rows) {
    try {
      await respaldarCampana(c.id, supabase);
      await limpiarRespaldosViejos(c.id, supabase);
    } catch (e) {
      console.error(`⚠️ Error respaldando campaña "${c.nombre_candidato}":`, e.message);
    }
  }
  console.log('✅ Respaldo automático completado');
}

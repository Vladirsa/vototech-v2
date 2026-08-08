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
  { tabla: 'zonas_asignadas', columnas: '*' },
  { tabla: 'calendario_electoral', columnas: '*' },
  { tabla: 'quejas_recursos', columnas: '*' },
];

// Estas 3 no tienen columna campana_id directa — cuelgan de la
// encuesta (encuesta_id -> encuestas.campana_id), así que necesitan
// su propia consulta con JOIN en vez del patrón genérico de arriba.
const TABLAS_INDIRECTAS = [
  { tabla: 'encuestas', sql: `SELECT * FROM encuestas WHERE campana_id=$1` },
  { tabla: 'encuesta_preguntas', sql: `SELECT ep.* FROM encuesta_preguntas ep JOIN encuestas e ON e.id=ep.encuesta_id WHERE e.campana_id=$1` },
  { tabla: 'encuesta_respuestas', sql: `SELECT er.* FROM encuesta_respuestas er JOIN encuestas e ON e.id=er.encuesta_id WHERE e.campana_id=$1` },
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

  for (const { tabla, sql } of TABLAS_INDIRECTAS) {
    try {
      const resultado = await query(sql, [campanaId]);
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

/** Borra respaldos de más de 90 días — antes eran 14, muy poco para
 *  una campaña que dura meses. Sigue siendo barato de guardar: son
 *  archivos de puro texto (JSON), no fotos ni video. */
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

/** Lista los respaldos disponibles de una campaña — más reciente primero. */
export async function listarRespaldos(campanaId) {
  const supabase = clienteSupabase();
  if (!supabase) return [];
  const { data: archivos } = await supabase.storage.from('respaldos').list(campanaId, { sortBy: { column: 'name', order: 'desc' } });
  if (!archivos) return [];
  return archivos
    .filter((a) => a.name.startsWith('respaldo-'))
    .map((a) => ({
      nombre: a.name,
      fecha: a.name.match(/respaldo-(\d{4}-\d{2}-\d{2})/)?.[1] || null,
      tamano_kb: a.metadata?.size ? Math.round(a.metadata.size / 1024) : null,
    }));
}

/** Genera un link temporal de descarga (1 hora) para un respaldo específico. */
export async function generarLinkDescarga(campanaId, nombreArchivo) {
  const supabase = clienteSupabase();
  if (!supabase) throw new Error('Almacenamiento no configurado');
  const { data, error } = await supabase.storage.from('respaldos').createSignedUrl(`${campanaId}/${nombreArchivo}`, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Ejecuta la restauración real — SOLO se llama una vez que ya
 * quedaron las 2 aprobaciones (candidato + admin). Antes de tocar
 * nada, guarda un respaldo de "justo antes de restaurar" (por si
 * hay que deshacer esto también), luego BORRA los datos actuales de
 * cada tabla de esa campaña, e inserta los del respaldo elegido.
 */
export async function ejecutarRestauracion(solicitudId) {
  const supabase = clienteSupabase();
  if (!supabase) throw new Error('Almacenamiento no configurado');

  const solicitudRes = await query('SELECT * FROM solicitudes_restauracion WHERE id=$1', [solicitudId]);
  const solicitud = solicitudRes.rows[0];
  if (!solicitud) throw new Error('Solicitud no encontrada');
  if (!solicitud.aprobado_candidato || !solicitud.aprobado_admin) throw new Error('Faltan aprobaciones');
  if (solicitud.estado !== 'pendiente') throw new Error('Esta solicitud ya fue procesada');

  const nombreArchivo = `respaldo-${solicitud.fecha_respaldo.toISOString().slice(0, 10)}.json`;
  const { data: descarga, error: errorDescarga } = await supabase.storage.from('respaldos').download(`${solicitud.campana_id}/${nombreArchivo}`);
  if (errorDescarga) throw new Error(`No se encontró el respaldo de esa fecha: ${errorDescarga.message}`);
  const respaldoElegido = JSON.parse(await descarga.text());

  // Red de seguridad: una foto de "justo antes de restaurar", por si
  // hay que deshacer esta restauración también.
  const nombrePrevio = await respaldarCampana(solicitud.campana_id, supabase);

  const todasLasTablas = [...TABLAS_A_RESPALDAR.map((t) => t.tabla), ...TABLAS_INDIRECTAS.map((t) => t.tabla)];
  for (const tabla of todasLasTablas) {
    const filas = respaldoElegido.tablas[tabla];
    if (!Array.isArray(filas)) continue; // tablas que dieron error al respaldar, no tocar

    if (tabla === 'encuesta_preguntas' || tabla === 'encuesta_respuestas') {
      // Estas dependen de "encuestas" (que se restaura antes en el
      // loop porque va primero en la lista) — se borran vía DELETE
      // normal, sin filtro directo de campana_id porque no lo tienen.
      continue; // se manejan aparte, después del loop principal
    }

    await query(`DELETE FROM ${tabla} WHERE campana_id=$1`, [solicitud.campana_id]);
    for (const fila of filas) {
      const columnas = Object.keys(fila);
      const valores = columnas.map((c) => fila[c]);
      const marcadores = columnas.map((_, i) => `$${i + 1}`).join(',');
      await query(`INSERT INTO ${tabla} (${columnas.join(',')}) VALUES (${marcadores})`, valores);
    }
  }

  // Encuestas y sus preguntas/respuestas — se restauran en orden,
  // porque unas dependen de otras (llave foránea).
  const encuestasIdsViejos = (await query('SELECT id FROM encuestas WHERE campana_id=$1', [solicitud.campana_id])).rows.map((r) => r.id);
  await query('DELETE FROM encuestas WHERE campana_id=$1', [solicitud.campana_id]); // esto ya borra en cascada preguntas/respuestas
  for (const fila of respaldoElegido.tablas.encuestas || []) {
    const columnas = Object.keys(fila);
    await query(`INSERT INTO encuestas (${columnas.join(',')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(',')})`, columnas.map((c) => fila[c]));
  }
  for (const fila of respaldoElegido.tablas.encuesta_preguntas || []) {
    const columnas = Object.keys(fila);
    await query(`INSERT INTO encuesta_preguntas (${columnas.join(',')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(',')})`, columnas.map((c) => fila[c]));
  }
  for (const fila of respaldoElegido.tablas.encuesta_respuestas || []) {
    const columnas = Object.keys(fila);
    await query(`INSERT INTO encuesta_respuestas (${columnas.join(',')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(',')})`, columnas.map((c) => fila[c]));
  }

  await query(
    `UPDATE solicitudes_restauracion SET estado='ejecutada', respaldo_previo=$1, ejecutado_en=now() WHERE id=$2`,
    [nombrePrevio, solicitudId]
  );

  return { ok: true, respaldo_previo: nombrePrevio };
}

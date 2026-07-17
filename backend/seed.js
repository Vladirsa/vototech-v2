// Script de una sola ejecución que carga TODOS los datos pesados
// (municipios, secciones con geometría real, resultados electorales,
// localidades) directo desde los archivos JSON/GeoJSON del repositorio
// a la base de datos — sin pasar por el editor SQL del navegador,
// que tiene límite de tamaño.
//
// Se puede correr manualmente con: npm run seed
// O se ejecuta SOLO automáticamente al arrancar el servidor si detecta
// que la base de datos está vacía (ver src/index.js) — así funciona
// incluso en hosting gratuito donde no hay acceso fácil a una terminal.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutaDb = path.join(__dirname, 'src/db');

export async function correrSeed() {
  console.log('🌱 Iniciando carga de datos...\n');

  // Tabla de control: marca cuándo terminó la carga COMPLETA con éxito.
  // Sin esto, si el proceso se corta a la mitad (ej. el servidor se
  // reinicia durante el primer despliegue), quedaría con datos a
  // medias y el sistema pensaría erróneamente que ya no hace falta
  // volver a intentarlo (porque solo revisaba si "secciones" tenía
  // datos, y esa tabla se llena rápido, antes de que el resto termine).
  await query(`CREATE TABLE IF NOT EXISTS meta_seed (
    id SMALLINT PRIMARY KEY DEFAULT 1, completado_en TIMESTAMPTZ
  )`);
  await query(`INSERT INTO meta_seed (id, completado_en) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING`);

  console.log('📍 Cargando secciones...');
  const geo = JSON.parse(fs.readFileSync(path.join(rutaDb, 'secciones_tlaxcala.geojson'), 'utf-8'));
  let contSecciones = 0;
  for (const feat of geo.features) {
    const { seccion, municipio, distrito_federal, distrito_local } = feat.properties;
    try {
      await query(
        `INSERT INTO secciones (estado_id, municipio_id, numero, distrito_federal, distrito_local, geom)
         SELECT 29, m.id, $1, $2, $3, $4::jsonb
         FROM municipios m WHERE m.estado_id=29 AND m.clave_ine=$5
         ON CONFLICT (estado_id, numero) DO UPDATE SET geom=EXCLUDED.geom`,
        [seccion, distrito_federal || null, distrito_local || null, JSON.stringify(feat.geometry), municipio]
      );
      contSecciones++;
    } catch (e) { console.error(`  ⚠️ Error en sección ${seccion}:`, e.message); }
  }
  console.log(`   ✅ ${contSecciones} secciones cargadas\n`);

  console.log('🏘️ Cargando localidades...');
  const localidades = JSON.parse(fs.readFileSync(path.join(rutaDb, 'localidades_tlaxcala.json'), 'utf-8'));
  let contLoc = 0;
  for (const l of localidades) {
    try {
      await query(
        `INSERT INTO localidades (seccion_id, municipio_id, nombre, es_cabecera, lat, lng)
         SELECT s.id, m.id, $1, $2, $3, $4
         FROM secciones s JOIN municipios m ON m.estado_id=29 AND m.clave_ine=$5
         WHERE s.estado_id=29 AND s.numero=$6`,
        [l.nombre, l.cabecera, l.lat, l.lng, l.municipio, l.seccion]
      );
      contLoc++;
    } catch (e) { /* localidad sin sección resuelta, se omite */ }
  }
  console.log(`   ✅ ${contLoc} localidades cargadas\n`);

  console.log('🗳️ Cargando resultados electorales...');
  const cargarHist = (archivo, varName) => {
    const c = fs.readFileSync(path.join(__dirname, 'datos-origen', archivo), 'utf-8');
    const start = c.indexOf(`var ${varName}=`) + `var ${varName}=`.length;
    return JSON.parse(c.slice(start, -1));
  };

  const PARTIDOS = ['pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac', 'rsp', 'panalt', 'fxm'];
  const CAMPO = { pan: 'pan', pri: 'pri', prd: 'prd', mc: 'mc', pvem: 'pvem', pt: 'pt', pac: 'pac', rsp: 'rsp', panalt: 'panalt', fxm: 'fxm' };

  async function cargarResultados(hist, tipoEleccion, anio) {
    let n = 0;
    for (const [secc, datos] of Object.entries(hist)) {
      const filas = [['morena', datos.m || 0], ...PARTIDOS.map((p) => [p, datos[CAMPO[p]] || 0])];
      for (const [partido, votos] of filas) {
        if (votos === 0) continue;
        try {
          await query(
            `INSERT INTO resultados_historicos (seccion_id, tipo_eleccion, anio, partido, votos, lista_nominal, total_votos, casillas)
             SELECT s.id, $1, $2, $3, $4, $5, $6, $7
             FROM secciones s WHERE s.estado_id=29 AND s.numero=$8
             ON CONFLICT (seccion_id, tipo_eleccion, anio, partido) DO UPDATE SET votos=EXCLUDED.votos`,
            [tipoEleccion, anio, partido, votos, datos.l || 0, datos.t || 0, datos.cas || 0, parseInt(secc)]
          );
          n++;
        } catch (e) { /* sección sin resolver, se omite */ }
      }
    }
    return n;
  }

  try {
    const histAyunt = cargarHist('historico-ayuntamiento.js', 'VT_HIST_AYUNTAMIENTO');
    const nAyunt = await cargarResultados(histAyunt, 'ayuntamiento', 2024);
    console.log(`   ✅ Ayuntamiento 2024: ${nAyunt} filas`);
  } catch (e) { console.log('   ⚠️ Sin datos de Ayuntamiento (archivo no encontrado, se omite)'); }

  try {
    const histPresCom = cargarHist('historico-pres-comunidad.js', 'VT_HIST_PRES_COMUNIDAD');
    const nPresCom = await cargarResultados(histPresCom, 'pres_comunidad', 2024);
    console.log(`   ✅ Pdte. Comunidad 2024: ${nPresCom} filas`);
  } catch (e) { console.log('   ⚠️ Sin datos de Pdte. Comunidad (archivo no encontrado, se omite)'); }

  console.log('\n🎉 Carga completa.');
  await query('UPDATE meta_seed SET completado_en = now() WHERE id=1');
}

// Si se ejecuta directamente con "node seed.js" (no importado desde otro
// archivo), correr y cerrar la conexión al terminar.
if (import.meta.url === `file://${process.argv[1]}`) {
  correrSeed()
    .then(() => pool.end())
    .catch((e) => { console.error('❌ Error general:', e); process.exit(1); });
}


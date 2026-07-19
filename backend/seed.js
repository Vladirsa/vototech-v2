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

const cargarHist = (archivo, varName) => {
  const c = fs.readFileSync(path.join(__dirname, 'datos-origen', archivo), 'utf-8');
  const start = c.indexOf(`var ${varName}=`) + `var ${varName}=`.length;
  return JSON.parse(c.slice(start, -1));
};

const PARTIDOS = ['pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac', 'rsp', 'panalt', 'fxm'];
const CAMPO = { pan: 'pan', pri: 'pri', prd: 'prd', mc: 'mc', pvem: 'pvem', pt: 'pt', pac: 'pac', rsp: 'rsp', panalt: 'panalt', fxm: 'fxm' };

async function cargarResultados(hist, tipoEleccion, anio) {
  // Inserción por LOTES en vez de fila por fila — con ~600 secciones
  // x 10 partidos, uno por uno tardaba varios minutos y corría el
  // riesgo real de quedar a medias si el proceso se reiniciaba antes
  // de terminar (nos pasó una vez cargando 2021). Por lotes de 200
  // filas es órdenes de magnitud más rápido.
  const filasParaInsertar = [];
  for (const [secc, datos] of Object.entries(hist)) {
    try {
      await query(
        `UPDATE secciones SET lista_nominal=$1 WHERE estado_id=29 AND numero=$2 AND (lista_nominal IS NULL OR lista_nominal=0)`,
        [datos.l || 0, parseInt(secc)]
      );
    } catch (e) { /* se ignora, no es crítico */ }

    const filas = [['morena', datos.m || 0], ...PARTIDOS.map((p) => [p, datos[CAMPO[p]] || 0])];
    for (const [partido, votos] of filas) {
      if (votos === 0) continue;
      filasParaInsertar.push({ seccion: parseInt(secc), partido, votos, l: datos.l || 0, t: datos.t || 0, cas: datos.cas || 0 });
    }
  }

  let n = 0;
  const TAMANO_LOTE = 200;
  for (let i = 0; i < filasParaInsertar.length; i += TAMANO_LOTE) {
    const lote = filasParaInsertar.slice(i, i + TAMANO_LOTE);
    const valores = [];
    const parametros = [];
    lote.forEach((f, idx) => {
      const base = idx * 8;
      valores.push(`((SELECT id FROM secciones WHERE estado_id=29 AND numero=$${base + 1}::int), $${base + 2}::text, $${base + 3}::int, $${base + 4}::text, $${base + 5}::int, $${base + 6}::int, $${base + 7}::int, $${base + 8}::int)`);
      parametros.push(f.seccion, tipoEleccion, anio, f.partido, f.votos, f.l, f.t, f.cas);
    });
    try {
      await query(
        `INSERT INTO resultados_historicos (seccion_id, tipo_eleccion, anio, partido, votos, lista_nominal, total_votos, casillas)
         SELECT * FROM (VALUES ${valores.join(',')}) AS v(seccion_id, tipo_eleccion, anio, partido, votos, lista_nominal, total_votos, casillas)
         WHERE seccion_id IS NOT NULL
         ON CONFLICT (seccion_id, tipo_eleccion, anio, partido) DO UPDATE SET votos=EXCLUDED.votos`,
        parametros
      );
      n += lote.length;
    } catch (e) { console.error(`   ⚠️ Error en lote de ${tipoEleccion} ${anio}:`, e.message); }
  }
  return n;
}

/**
 * Carga el histórico 2021 (Gobernador, Diputado Local, Ayuntamiento,
 * Pdte. Comunidad) — función SEPARADA de correrSeed() para que se
 * pueda disparar en bases de datos que YA corrieron la siembra
 * original (donde meta_seed ya dice "completado") sin tener que
 * re-sembrar todo desde cero. Se checa su propia bandera de avance.
 */
export async function cargarHistorico2021() {
  await query(`CREATE TABLE IF NOT EXISTS meta_historico_2021 (id SMALLINT PRIMARY KEY DEFAULT 1, completado_en TIMESTAMPTZ)`);
  const yaCompletado = await query('SELECT completado_en FROM meta_historico_2021 WHERE id=1');
  if (yaCompletado.rows[0]?.completado_en) return { ok: true, mensaje: 'Histórico 2021 ya estaba cargado, se omite.' };

  // Por si una corrida anterior quedó a medias (el proceso se
  // reinició antes de terminar) — se limpia y se vuelve a cargar
  // completo, en vez de dejar datos parciales silenciosos.
  await query(`DELETE FROM resultados_historicos WHERE anio=2021`);

  console.log('🗳️ Cargando histórico 2021 (Gobernador, Dip. Local, Ayuntamiento, Pdte. Comunidad)...');
  const CARGAS_2021 = [
    ['historico-gobernador-2021.js', 'VT_HIST_GOBERNADOR_2021', 'gobernador', 'Gobernador'],
    ['historico-dip_local-2021.js', 'VT_HIST_DIP_LOCAL_2021', 'dip_local', 'Diputado Local'],
    ['historico-ayuntamiento-2021.js', 'VT_HIST_AYUNTAMIENTO_2021', 'ayuntamiento', 'Ayuntamiento'],
    ['historico-pres_comunidad-2021.js', 'VT_HIST_PRES_COMUNIDAD_2021', 'pres_comunidad', 'Pdte. Comunidad'],
  ];
  const resumen = {};
  for (const [archivo, varName, tipo, etiqueta] of CARGAS_2021) {
    try {
      const hist = cargarHist(archivo, varName);
      const n = await cargarResultados(hist, tipo, 2021);
      console.log(`   ✅ ${etiqueta} 2021: ${n} filas`);
      resumen[tipo] = n;
    } catch (e) {
      console.log(`   ⚠️ Sin datos de ${etiqueta} 2021 (archivo no encontrado, se omite)`);
      resumen[tipo] = 0;
    }
  }
  await query(`INSERT INTO meta_historico_2021 (id, completado_en) VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET completado_en=now()`);
  return { ok: true, resumen };
}

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

  await cargarHistorico2021();

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

/**
 * Reparación puntual para bases de datos que ya se cargaron ANTES de
 * que se guardara la lista nominal en la tabla secciones (bug ya
 * corregido en correrSeed, esto lo arregla en instalaciones que ya
 * estaban corriendo con datos incompletos).
 */
export async function repararListaNominal() {
  const cargarHist = (archivo, varName) => {
    const c = fs.readFileSync(path.join(__dirname, 'datos-origen', archivo), 'utf-8');
    const start = c.indexOf(`var ${varName}=`) + `var ${varName}=`.length;
    return JSON.parse(c.slice(start, -1));
  };

  let actualizadas = 0;
  const histAyunt = cargarHist('historico-ayuntamiento.js', 'VT_HIST_AYUNTAMIENTO');
  for (const [secc, datos] of Object.entries(histAyunt)) {
    if (!datos.l) continue;
    const r = await query(
      `UPDATE secciones SET lista_nominal=$1 WHERE estado_id=29 AND numero=$2`,
      [datos.l, parseInt(secc)]
    );
    actualizadas += r.rowCount;
  }
  return actualizadas;
}


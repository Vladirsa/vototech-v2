/**
 * import-calles-inegi.js
 *
 * Descarga el catálogo de vialidades (nombres de calles con
 * ubicación) del servicio WFS público del INEGI, filtrado al estado
 * de Tlaxcala (clave 29), y lo carga a la tabla `calles_estado` de
 * Supabase — para que el buscador de direcciones (BuscadorCalle) ya
 * no dependa de una consulta en vivo a Nominatim cada vez.
 *
 * 🔒 IMPORTANTE — léelo antes de correrlo:
 * Este script se escribió sin poder probarlo en vivo contra el
 * servidor del INEGI (mi entorno de trabajo no tiene salida a
 * gaia.inegi.org.mx). El endpoint y la capa SÍ son reales y
 * públicos, pero el nombre exacto de la capa de vialidades puede
 * variar entre versiones del servicio. Si al correrlo ves un error
 * de "capa no encontrada", el primer paso de diagnóstico (Paso 0,
 * abajo) te va a decir el nombre exacto de la capa que sí existe,
 * y solo hace falta ajustar la constante NOMBRE_CAPA con ese valor.
 *
 * Cómo correrlo en Render:
 *   1. Sube este archivo a backend/import-calles-inegi.js
 *   2. En el Shell de Render (pestaña "Shell" de tu servicio):
 *      node import-calles-inegi.js
 *   3. Tarda varios minutos — imprime el avance en pantalla.
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const WFS_BASE = 'https://gaia.inegi.org.mx/NLB/tunnel/wms/wms61';
// 🔒 Nombre de capa tentativo — el Paso 0 confirma el real.
let NOMBRE_CAPA = 'vialidades';
const CLAVE_ESTADO_TLAXCALA = '29';

async function pedirCapasDisponibles() {
  console.log('Paso 0 — preguntando al INEGI qué capas existen...');
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetCapabilities`;
  const resp = await fetch(url);
  const texto = await resp.text();
  const nombres = [...texto.matchAll(/<Name>(.*?)<\/Name>/g)].map((m) => m[1]);
  const candidatas = nombres.filter((n) => /via|calle|street|road|eje/i.test(n));
  console.log(`Se encontraron ${nombres.length} capas en total.`);
  console.log('Candidatas a "vialidades" encontradas:', candidatas.length ? candidatas : '(ninguna con ese patrón — revisa el listado completo abajo)');
  if (!candidatas.length) console.log(nombres.slice(0, 40));
  return candidatas;
}

async function descargarVialidades() {
  console.log(`Paso 1 — descargando la capa "${NOMBRE_CAPA}" filtrada a Tlaxcala (clave ${CLAVE_ESTADO_TLAXCALA})...`);
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${NOMBRE_CAPA}` +
    `&outputFormat=application/json&CQL_FILTER=CVE_ENT='${CLAVE_ESTADO_TLAXCALA}'`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`El servidor respondió ${resp.status} — revisa NOMBRE_CAPA con el Paso 0.`);
  const geojson = await resp.json();
  if (!geojson.features) throw new Error('La respuesta no traía "features" — probablemente el nombre de la capa o el filtro CQL no son los correctos para esta versión del servicio.');
  console.log(`✅ ${geojson.features.length} vialidades descargadas.`);
  return geojson.features;
}

async function cargarMunicipios() {
  const { rows } = await pool.query(`SELECT id, clave_ine, nombre FROM municipios WHERE estado_id=29`);
  const porClave = {};
  rows.forEach((m) => { porClave[String(m.clave_ine)] = m.id; });
  return porClave;
}

function centroDeGeometria(geometry) {
  // Soporta LineString y MultiLineString — promedia todos los puntos.
  const coords = geometry.type === 'MultiLineString' ? geometry.coordinates.flat() : geometry.coordinates;
  let sumaLat = 0, sumaLng = 0;
  coords.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
  return { lat: sumaLat / coords.length, lng: sumaLng / coords.length };
}

async function main() {
  const candidatas = await pedirCapasDisponibles();
  if (candidatas.length === 1) {
    NOMBRE_CAPA = candidatas[0];
    console.log(`Usando la capa detectada automáticamente: "${NOMBRE_CAPA}"`);
  } else if (candidatas.length > 1) {
    console.log(`⚠️ Hay ${candidatas.length} capas candidatas — usando la primera ("${candidatas[0]}"). Si no es la correcta, edita NOMBRE_CAPA a mano con la que sí sea y vuelve a correr.`);
    NOMBRE_CAPA = candidatas[0];
  }

  const features = await descargarVialidades();
  const municipiosPorClave = await cargarMunicipios();

  console.log('Paso 2 — cargando a Supabase (tabla calles_estado)...');
  let cargadas = 0, sinNombre = 0, errores = 0;
  for (const f of features) {
    const nombre = f.properties?.NOMVIAL || f.properties?.NOMBRE || f.properties?.name;
    if (!nombre) { sinNombre++; continue; }
    try {
      const { lat, lng } = centroDeGeometria(f.geometry);
      const claveMun = String(f.properties?.CVE_MUN || '');
      const municipioId = municipiosPorClave[claveMun] || null;
      await pool.query(
        `INSERT INTO calles_estado (nombre, municipio_id, lat, lng, fuente) VALUES ($1,$2,$3,$4,'inegi')`,
        [nombre, municipioId, lat, lng]
      );
      cargadas++;
      if (cargadas % 500 === 0) console.log(`  ...${cargadas} cargadas`);
    } catch (e) { errores++; }
  }

  console.log(`\n🎉 Listo — ${cargadas} calles cargadas, ${sinNombre} sin nombre (omitidas), ${errores} con error.`);
  await pool.end();
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  console.error('\nSi el error es de capa no encontrada, revisa la lista de "Candidatas" que imprimió el Paso 0 y ajusta NOMBRE_CAPA manualmente.');
  process.exit(1);
});

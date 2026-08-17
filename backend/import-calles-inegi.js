/**
 * import-calles-inegi.js
 *
 * Descarga el catálogo de vialidades (nombres de calles con
 * ubicación) del servicio WFS público del INEGI, filtrado al estado
 * de Tlaxcala (clave 29), y lo carga a la tabla `calles_estado` de
 * Supabase — para que el buscador de direcciones (BuscadorCalle) ya
 * no dependa de una consulta en vivo a Nominatim cada vez.
 *
 * 🔒 IMPORTANTE — no se pudo probar en vivo contra el servidor del
 * INEGI (mi entorno de trabajo no tiene salida a gaia.inegi.org.mx).
 * El endpoint y la capa SÍ son reales y públicos, pero el nombre
 * exacto de la capa de vialidades puede variar entre versiones del
 * servicio. El Paso 0 le pregunta al INEGI qué capas existen de
 * verdad antes de intentar descargar nada, y si no logra adivinar
 * cuál es la correcta, el mensaje de resultado te va a decir
 * exactamente qué capas sí encontró para que me digas cuál es.
 *
 * Se ejecuta desde el botón "Importar calles del INEGI" en el Panel
 * de Administración — no necesita acceso a Shell de Render.
 */

import { query } from './src/db/pool.js';

const WFS_BASE = 'https://gaia.inegi.org.mx/NLB/tunnel/wms/wms61';
const CLAVE_ESTADO_TLAXCALA = '29';

async function detectarCapaVialidades() {
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetCapabilities`;
  const resp = await fetch(url);
  const texto = await resp.text();
  const nombres = [...texto.matchAll(/<Name>(.*?)<\/Name>/g)].map((m) => m[1]);
  const candidatas = nombres.filter((n) => /via|calle|street|road|eje/i.test(n));
  return { candidatas, totalCapas: nombres.length, todasLasCapas: nombres };
}

async function descargarVialidades(nombreCapa) {
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${nombreCapa}` +
    `&outputFormat=application/json&CQL_FILTER=CVE_ENT='${CLAVE_ESTADO_TLAXCALA}'`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`El servidor del INEGI respondió con error ${resp.status} para la capa "${nombreCapa}"`);
  const geojson = await resp.json();
  if (!geojson.features) throw new Error(`La respuesta para "${nombreCapa}" no traía datos utilizables (sin "features")`);
  return geojson.features;
}

function centroDeGeometria(geometry) {
  const coords = geometry.type === 'MultiLineString' ? geometry.coordinates.flat() : geometry.coordinates;
  let sumaLat = 0, sumaLng = 0;
  coords.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
  return { lat: sumaLat / coords.length, lng: sumaLng / coords.length };
}

export async function importarCallesInegi() {
  const { candidatas, totalCapas, todasLasCapas } = await detectarCapaVialidades();

  if (candidatas.length === 0) {
    return {
      ok: false,
      error: `No se encontró ninguna capa con nombre reconocible de "vialidades" entre las ${totalCapas} capas del servicio.`,
      capasDisponibles: todasLasCapas.slice(0, 60),
    };
  }

  const nombreCapa = candidatas[0];
  const features = await descargarVialidades(nombreCapa);

  const municipiosRes = await query(`SELECT id, clave_ine FROM municipios WHERE estado_id=29`);
  const municipiosPorClave = {};
  municipiosRes.rows.forEach((m) => { municipiosPorClave[String(m.clave_ine)] = m.id; });

  let cargadas = 0, sinNombre = 0, errores = 0;
  for (const f of features) {
    const nombre = f.properties?.NOMVIAL || f.properties?.NOMBRE || f.properties?.name;
    if (!nombre) { sinNombre++; continue; }
    try {
      const { lat, lng } = centroDeGeometria(f.geometry);
      const claveMun = String(f.properties?.CVE_MUN || '');
      const municipioId = municipiosPorClave[claveMun] || null;
      await query(
        `INSERT INTO calles_estado (nombre, municipio_id, lat, lng, fuente) VALUES ($1,$2,$3,$4,'inegi')`,
        [nombre, municipioId, lat, lng]
      );
      cargadas++;
    } catch (e) { errores++; }
  }

  return {
    ok: true,
    capaUsada: nombreCapa,
    candidatasEncontradas: candidatas,
    totalDescargadas: features.length,
    cargadas, sinNombre, errores,
  };
}

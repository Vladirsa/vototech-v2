/**
 * import-calles-inegi.js (v3)
 *
 * Descarga el catálogo de vialidades del servicio REAL del INEGI
 * (wscatgeo, confirmado en su PDF oficial de dic-2024 — el intento
 * anterior con "wms61/WFS" falló porque ese servicio tiene el WFS
 * desactivado a propósito por ellos).
 *
 * Cómo funciona: las vialidades se piden POR LOCALIDAD (no por
 * estado directo), así que primero se pide la lista de localidades
 * de Tlaxcala, y luego se piden las vialidades de cada una.
 *
 * 🔒 Sigue sin poder probarse en vivo desde mi entorno. Los nombres
 * exactos de los campos dentro de cada respuesta se intentan
 * adivinar con varias opciones comunes; si ninguna coincide, el
 * resultado trae las propiedades reales para ajustar sin adivinar
 * a ciegas otra vez.
 */

import { query } from './src/db/pool.js';

const BASE = 'https://gaia.inegi.org.mx/wscatgeo/v2';
const CVE_AGEE_TLAXCALA = '29';

const CAMPOS_CVE_LOCALIDAD = ['cvegeoLoc', 'CVEGEO', 'cve_loc', 'clave', 'CVE_LOC', 'cvegeo'];
const CAMPOS_NOMBRE_CALLE = ['NOMVIAL', 'NOMBRE', 'nombre', 'name', 'NOM_VIAL'];

function primerValorQueExista(objeto, listaCampos) {
  for (const campo of listaCampos) {
    if (objeto?.[campo] != null && objeto[campo] !== '') return objeto[campo];
  }
  return null;
}

async function obtenerLocalidadesDeTlaxcala() {
  const url = `${BASE}/geo/localidades/pol/${CVE_AGEE_TLAXCALA}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo obtener la lista de localidades (${resp.status}) — url: ${url}`);
  const geojson = await resp.json();
  if (!geojson.features || geojson.features.length === 0) {
    throw new Error('La lista de localidades vino vacía — revisa manualmente esta URL en el navegador: ' + url);
  }
  return geojson.features;
}

function centroDeGeometria(geometry) {
  if (!geometry) return null;
  const coords = geometry.type === 'MultiLineString' || geometry.type === 'MultiPolygon'
    ? geometry.coordinates.flat(geometry.type === 'MultiPolygon' ? 2 : 1)
    : geometry.type === 'Polygon' ? geometry.coordinates.flat(1)
    : geometry.coordinates;
  if (!coords || coords.length === 0) return null;
  let sumaLat = 0, sumaLng = 0;
  coords.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
  return { lat: sumaLat / coords.length, lng: sumaLng / coords.length };
}

export async function importarCallesInegi() {
  const localidades = await obtenerLocalidadesDeTlaxcala();

  const primeraLocalidad = localidades[0].properties;
  const campoClaveDetectado = CAMPOS_CVE_LOCALIDAD.find((c) => primeraLocalidad[c] != null);
  if (!campoClaveDetectado) {
    return {
      ok: false,
      error: 'No se pudo detectar el campo de la clave de localidad en la respuesta del INEGI.',
      propiedadesDeEjemplo: primeraLocalidad,
    };
  }

  const municipiosRes = await query(`SELECT id, clave_ine FROM municipios WHERE estado_id=29`);
  const municipiosPorClave = {};
  municipiosRes.rows.forEach((m) => { municipiosPorClave[String(m.clave_ine)] = m.id; });

  let cargadas = 0, sinNombre = 0, errores = 0, localidadesSinVialidades = 0;
  let ejemploPropiedadesVialidad = null;
  // 🆕 Diagnóstico de la PRIMERA petición de vialidades — sin importar
  // si falla o no, se guarda qué url se probó, qué código regresó, y
  // los primeros caracteres de la respuesta cruda. Así, si vuelve a
  // dar 0, esta vez SÍ sabemos por qué en vez de adivinar otra vez.
  let diagnosticoPrimeraPeticion = null;

  for (const loc of localidades) {
    const cveLoc = loc.properties[campoClaveDetectado];
    const claveMun = String(loc.properties.CVE_MUN || loc.properties.cve_agem || loc.properties.CVEAGEM || '');
    const urlVialidades = `${BASE}/vialidades/${cveLoc}`;
    try {
      const resp = await fetch(urlVialidades);
      const textoCrudo = await resp.text();

      if (!diagnosticoPrimeraPeticion) {
        diagnosticoPrimeraPeticion = {
          cveLocUsada: cveLoc, campoClaveDetectado, url: urlVialidades,
          statusHttp: resp.status, primerosCaracteresRespuesta: textoCrudo.slice(0, 400),
        };
      }

      if (!resp.ok) { localidadesSinVialidades++; continue; }
      let geojson;
      try { geojson = JSON.parse(textoCrudo); } catch (e) { localidadesSinVialidades++; continue; }
      if (!geojson.features || geojson.features.length === 0) { localidadesSinVialidades++; continue; }

      for (const f of geojson.features) {
        if (!ejemploPropiedadesVialidad) ejemploPropiedadesVialidad = f.properties;
        const nombre = primerValorQueExista(f.properties, CAMPOS_NOMBRE_CALLE);
        if (!nombre) { sinNombre++; continue; }
        const centro = centroDeGeometria(f.geometry);
        if (!centro) { sinNombre++; continue; }
        try {
          await query(
            `INSERT INTO calles_estado (nombre, municipio_id, lat, lng, fuente) VALUES ($1,$2,$3,$4,'inegi')`,
            [nombre, municipiosPorClave[claveMun] || null, centro.lat, centro.lng]
          );
          cargadas++;
        } catch (e) { errores++; }
      }
    } catch (e) {
      if (!diagnosticoPrimeraPeticion) {
        diagnosticoPrimeraPeticion = { cveLocUsada: cveLoc, campoClaveDetectado, url: urlVialidades, errorDeRed: e.message };
      }
      localidadesSinVialidades++;
    }
  }

  return {
    ok: true,
    totalLocalidades: localidades.length,
    localidadesSinVialidades,
    cargadas, sinNombre, errores,
    ejemploPropiedadesVialidad,
    diagnosticoPrimeraPeticion,
  };
}

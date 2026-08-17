import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cacheGeoSecciones = null;

function cargarGeoSecciones() {
  if (!cacheGeoSecciones) {
    const ruta = path.join(__dirname, '../db/secciones_tlaxcala.geojson');
    cacheGeoSecciones = JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  }
  return cacheGeoSecciones;
}

/**
 * Algoritmo de "ray casting" — el método estándar para saber si un
 * punto cae dentro de un polígono. Soporta tanto Polygon como
 * MultiPolygon (algunas secciones con territorio discontinuo usan
 * MultiPolygon).
 */
function puntoEnPoligono(lat, lng, geometry) {
  const anillos = geometry.type === 'Polygon'
    ? [geometry.coordinates[0]]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates.map((p) => p[0])
      : [];

  for (const anillo of anillos) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i];
      const [xj, yj] = anillo[j];
      const interseca = (yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (interseca) dentro = !dentro;
    }
    if (dentro) return true;
  }
  return false;
}

/**
 * 🆕 Dado un punto (lat, lng), regresa el NÚMERO de sección real
 * donde cae geográficamente — sin importar qué número haya escrito
 * la persona a mano. Se usa para avisar cuando el dato capturado
 * (sección de la credencial, o la que alguien tecleó) no coincide
 * con dónde cae de verdad la dirección que se buscó — pasa seguido:
 * la gente se muda, o alguien teclea mal el número.
 *
 * Devuelve null si el punto no cae dentro de ninguna sección
 * conocida (fuera del estado, o justo en el borde).
 */
export function encontrarSeccionRealDelPunto(lat, lng) {
  const geo = cargarGeoSecciones();
  for (const feature of geo.features) {
    if (puntoEnPoligono(lat, lng, feature.geometry)) {
      return feature.properties.seccion;
    }
  }
  return null;
}

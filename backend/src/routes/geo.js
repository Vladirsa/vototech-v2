import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Cache en memoria — el GeoJSON de secciones no cambia en cada petición,
// así que lo leemos del disco UNA sola vez y lo servimos desde RAM después.
// Esto es exactamente el tipo de optimización que en WordPress/Hostinger
// nunca pudimos controlar de forma confiable.
let cacheGeoSecciones = null;
let cacheLocalidades = null;
let cacheManzanas = null;

router.get('/manzanas/:seccion', (req, res) => {
  try {
    if (!cacheManzanas) {
      const rutaArchivo = path.join(__dirname, '../db/manzanas_tlaxcala.json');
      cacheManzanas = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
      console.log(`🧱 Manzanas cargadas en memoria (${Object.keys(cacheManzanas).length} secciones)`);
    }
    const manzanas = cacheManzanas[req.params.seccion] || [];
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ok: true, data: { type: 'FeatureCollection', features: manzanas } });
  } catch (e) {
    console.error('Error sirviendo manzanas:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las manzanas' });
  }
});

router.get('/secciones/:estadoId', (req, res) => {
  try {
    if (!cacheGeoSecciones) {
      const rutaArchivo = path.join(__dirname, '../db/secciones_tlaxcala.geojson');
      cacheGeoSecciones = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
      console.log(`📍 GeoJSON de secciones cargado en memoria (${cacheGeoSecciones.features.length} secciones)`);
    }
    res.set('Cache-Control', 'public, max-age=3600'); // el navegador también puede cachear 1h
    res.json({ ok: true, data: cacheGeoSecciones });
  } catch (e) {
    console.error('Error sirviendo GeoJSON:', e);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el mapa' });
  }
});

/**
 * GET /api/geo/municipios/:estadoId
 * Público (sin autenticación) — se necesita ANTES de que el candidato
 * tenga cuenta, para que elija su territorio real al registrarse.
 */
router.get('/municipios/:estadoId', async (req, res) => {
  const resultado = await query(
    'SELECT clave_ine, nombre FROM municipios WHERE estado_id=$1 ORDER BY nombre',
    [req.params.estadoId]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/localidades/:estadoId', (req, res) => {
  try {
    if (!cacheLocalidades) {
      const rutaArchivo = path.join(__dirname, '../db/localidades_tlaxcala.json');
      cacheLocalidades = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
    }
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ok: true, data: cacheLocalidades });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las localidades' });
  }
});

/**
 * GET /api/geo/buscar-direccion?q=...
 * Busca una dirección real y regresa sus coordenadas exactas —
 * usa Nominatim (OpenStreetMap), gratuito y sin necesitar llave de
 * API. Filtrado a México para no traer resultados de otros países
 * con nombres de calle parecidos.
 */
router.get('/buscar-direccion', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 4) return res.json({ ok: true, data: [] });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=mx&addressdetails=1`;
    const respuesta = await fetch(url, { headers: { 'User-Agent': 'VotoTech-Sistema-Electoral/1.0' } });
    if (!respuesta.ok) throw new Error(`Nominatim respondió ${respuesta.status}`);
    const resultados = await respuesta.json();

    res.json({
      ok: true,
      data: resultados.map((r) => ({
        direccion: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })),
    });
  } catch (e) {
    console.error('Error buscando dirección:', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo buscar la dirección — intenta de nuevo en un momento' });
  }
});

export default router;

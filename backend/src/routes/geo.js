import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

export default router;

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
// 🆕 cacheGeoSecciones se quitó — la geometría ya no vive en un
// archivo fijo, ahora se consulta directo de la base de datos
// (ver /secciones/:estadoId más abajo), lo que permite que
// cualquier estado nuevo funcione sin tocar este código.
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

router.get('/secciones/:estadoId', async (req, res) => {
  try {
    // 🆕 LA CORRECCIÓN REAL — antes esto SIEMPRE leía el archivo fijo
    // de Tlaxcala, sin importar qué estadoId se pidiera. Ahora la
    // geometría vive en la base de datos (columna secciones.geometria),
    // así que cualquier estado que cargues con el nuevo importador
    // funciona automáticamente, sin tocar código nunca más.
    const resultado = await query(
      `SELECT s.numero as seccion, m.nombre as municipio, s.distrito_local, s.distrito_federal, s.geometria
       FROM secciones s JOIN municipios m ON m.id = s.municipio_id
       WHERE s.estado_id = $1 AND s.geometria IS NOT NULL`,
      [req.params.estadoId]
    );
    const featureCollection = {
      type: 'FeatureCollection',
      features: resultado.rows.map((r) => ({
        type: 'Feature',
        properties: { seccion: r.seccion, municipio: r.municipio, distrito_local: r.distrito_local, distrito_federal: r.distrito_federal },
        geometry: r.geometria,
      })),
    };
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ok: true, data: featureCollection });
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

export default router;

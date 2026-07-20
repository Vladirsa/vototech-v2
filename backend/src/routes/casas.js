import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
router.use(requiereAuth);

let cacheManzanas = null;
function cargarManzanas() {
  if (!cacheManzanas) {
    cacheManzanas = JSON.parse(fs.readFileSync(path.join(__dirname, '../db/manzanas_tlaxcala.json'), 'utf-8'));
  }
  return cacheManzanas;
}

/**
 * Genera puntos distribuidos a lo largo del PERÍMETRO de un polígono
 * (simulando casas viendo hacia la calle), cada ~18 metros aprox
 * (equivalente a un frente de terreno típico urbano en México).
 */
function generarPuntosPerimetro(coordenadas, distanciaMetros = 0.00016) {
  const anillo = coordenadas[0]; // primer anillo del polígono
  const puntos = [];
  for (let i = 0; i < anillo.length - 1; i++) {
    const [lng1, lat1] = anillo[i];
    const [lng2, lat2] = anillo[i + 1];
    const dist = Math.sqrt((lng2 - lng1) ** 2 + (lat2 - lat1) ** 2);
    const pasos = Math.max(1, Math.floor(dist / distanciaMetros));
    for (let p = 0; p < pasos; p++) {
      const t = p / pasos;
      puntos.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  return puntos;
}

/**
 * GET /api/casas/resumen/:seccion
 * Cobertura real de la sección: cuántas casas visitadas, promovidas,
 * de la competencia, y sin tocar todavía — por manzana.
 * NOTA: esta ruta va ANTES de /:seccion/:manzana a propósito — si no,
 * Express interpretaría "resumen" como si fuera un número de sección.
 */
router.get('/resumen/:seccion', async (req, res) => {
  try {
    const seccionRow = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [req.params.seccion, req.usuario.estado_id]);
    if (!seccionRow.rows[0]) return res.json({ ok: true, data: [] });

    const resultado = await query(
      `SELECT manzana_num,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE estado='visitado') as visitadas,
         COUNT(*) FILTER (WHERE estado='promovido') as promovidas,
         COUNT(*) FILTER (WHERE estado='competencia') as competencia,
         COUNT(*) FILTER (WHERE estado='sin_visitar') as sin_visitar
       FROM casas_simuladas
       WHERE campana_id=$1 AND seccion_id=$2
       GROUP BY manzana_num ORDER BY manzana_num`,
      [req.usuario.campana_id, seccionRow.rows[0].id]
    );
    res.json({ ok: true, data: resultado.rows });
  } catch (e) {
    console.error('Error en resumen de casas:', e);
    res.status(500).json({ ok: false, error: 'Error al cargar el resumen' });
  }
});

/**
 * GET /api/casas/:seccion/:manzana
 * Trae las casas simuladas de una manzana — si es la primera vez que
 * se piden (no existen en la BD todavía), se GENERAN automáticamente
 * a partir del polígono real de la manzana, y de ahí en adelante ya
 * quedan guardadas con su estado para esta campaña específica.
 */
router.get('/:seccion/:manzana', async (req, res) => {
  const { seccion, manzana } = req.params;

  try {
    const seccionRow = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [seccion, req.usuario.estado_id]);
    if (!seccionRow.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
    const seccionId = seccionRow.rows[0].id;

    let casas = await query(
      `SELECT c.*, p.nombre as promovido_nombre FROM casas_simuladas c
       LEFT JOIN promovidos p ON p.id = c.promovido_id
       WHERE c.campana_id=$1 AND c.seccion_id=$2 AND c.manzana_num=$3
       ORDER BY c.creado_en`,
      [req.usuario.campana_id, seccionId, manzana]
    );

    // Si no existen todavía para esta campaña, generarlas del polígono real
    if (casas.rows.length === 0) {
      const manzanasData = cargarManzanas();
      const featuresSeccion = manzanasData[seccion] || [];
      const mz = featuresSeccion.find((f) => f.properties.manzana === parseInt(manzana));
      if (!mz) return res.json({ ok: true, data: [] });

      const puntos = generarPuntosPerimetro(mz.geometry.coordinates);
      for (const [lng, lat] of puntos) {
        await query(
          `INSERT INTO casas_simuladas (campana_id, seccion_id, manzana_num, lat, lng)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.usuario.campana_id, seccionId, manzana, lat, lng]
        );
      }
      casas = await query(
        `SELECT c.*, p.nombre as promovido_nombre FROM casas_simuladas c
         LEFT JOIN promovidos p ON p.id = c.promovido_id
         WHERE c.campana_id=$1 AND c.seccion_id=$2 AND c.manzana_num=$3`,
        [req.usuario.campana_id, seccionId, manzana]
      );
    }

    res.json({ ok: true, data: casas.rows });
  } catch (e) {
    console.error('Error obteniendo casas simuladas:', e);
    res.status(500).json({ ok: false, error: 'Error al cargar casas' });
  }
});

const esquemaActualizar = z.object({
  estado: z.enum(['sin_visitar', 'visitado', 'promovido', 'competencia', 'no_toco']),
  partido_competencia: z.string().max(20).optional(),
  notas: z.string().max(300).optional(),
  promovido_id: z.string().uuid().optional(),
});

/**
 * PATCH /api/casas/:id
 * El promotor toca una casa en el mapa y marca su estado — incluida
 * la opción de anotarla como territorio de la competencia.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaActualizar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
  const d = parseado.data;

  const resultado = await query(
    `UPDATE casas_simuladas
     SET estado=$1, partido_competencia=$2, notas=$3, promovido_id=$4, actualizado_por=$5, actualizado_en=now()
     WHERE id=$6 AND campana_id=$7 RETURNING *`,
    [d.estado, d.partido_competencia || null, d.notas || null, d.promovido_id || null,
     req.usuario.sub, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/casas/resumen/:seccion — (definida arriba antes de /:seccion/:manzana)
 */

export default router;

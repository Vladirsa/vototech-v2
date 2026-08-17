import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/calles/buscar?q=texto
 * Busca en el catálogo LOCAL de calles (cargado del INEGI) antes de
 * depender de una consulta en vivo a Nominatim — mucho más rápido,
 * y funciona igual de bien sin importar la carga de red del momento.
 *
 * Usa búsqueda por similitud de texto (pg_trgm) — encuentra
 * coincidencias aunque el usuario no escriba el nombre exacto o con
 * acentos distintos.
 */
router.get('/buscar', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) return res.json({ ok: true, data: [] });

  const resultado = await query(
    `SELECT c.id, c.nombre, c.lat, c.lng, m.nombre as municipio
     FROM calles_estado c
     LEFT JOIN municipios m ON m.id = c.municipio_id
     WHERE c.nombre % $1
     ORDER BY similarity(c.nombre, $1) DESC
     LIMIT 8`,
    [q]
  );
  res.json({ ok: true, data: resultado.rows });
});

export default router;

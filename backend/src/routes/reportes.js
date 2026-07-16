import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// Reutilizamos la tabla contactos + promovidos para calcular reportes de
// campo reales (contactados, comprometidos) en vez de una tabla aparte
// que se pueda desincronizar de la realidad — así el reporte SIEMPRE
// refleja lo que de verdad se registró ese día, no un número aparte
// que alguien tuvo que escribir a mano.

/**
 * GET /api/reportes/diario
 * Actividad real del día de hoy (o de la fecha que se pida) por
 * cada promotor de la campaña — contactos + promovidos nuevos.
 */
router.get('/diario', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);

  const resultado = await query(
    `SELECT u.id as usuario_id, u.nombre,
       COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en::date = $2) as promovidos_nuevos,
       COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en::date = $2 AND p.comprometido) as comprometidos_nuevos,
       COUNT(DISTINCT c.id) FILTER (WHERE c.creado_en::date = $2) as contactos_hechos
     FROM usuarios u
     LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id = $1
     LEFT JOIN contactos c ON c.usuario_id = u.id AND c.campana_id = $1
     WHERE u.campana_id = $1 AND u.rol = 'promotor'
     GROUP BY u.id, u.nombre
     ORDER BY promovidos_nuevos DESC`,
    [req.usuario.campana_id, fecha]
  );

  res.json({ ok: true, data: resultado.rows, fecha });
});

/**
 * GET /api/reportes/tendencia
 * Actividad de los últimos 14 días — para ver si el ritmo de la
 * campaña va subiendo o bajando.
 */
router.get('/tendencia', async (req, res) => {
  const resultado = await query(
    `SELECT creado_en::date as fecha, COUNT(*) as promovidos,
            COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos
     WHERE campana_id = $1 AND creado_en > now() - interval '14 days'
     GROUP BY creado_en::date ORDER BY fecha`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

export default router;

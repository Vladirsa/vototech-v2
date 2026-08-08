import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

/**
 * GET /api/resultados/:tipoEleccion/:anio
 * Devuelve, por cada sección, quién ganó y el detalle de votos —
 * exactamente lo que el mapa necesita para colorear cada polígono
 * por partido ganador.
 */
router.get('/:tipoEleccion/:anio', async (req, res) => {
  const { tipoEleccion, anio } = req.params;

  try {
    const resultado = await query(
      `SELECT s.numero as seccion, r.partido, r.votos
       FROM resultados_historicos r
       JOIN secciones s ON s.id = r.seccion_id
       WHERE r.tipo_eleccion = $1 AND r.anio = $2
       ORDER BY s.numero, r.votos DESC`,
      [tipoEleccion, parseInt(anio)]
    );

    // Agrupar por sección y calcular el ganador de cada una
    const porSeccion = {};
    for (const fila of resultado.rows) {
      if (!porSeccion[fila.seccion]) {
        porSeccion[fila.seccion] = { votos: {}, ganador: null, totalVotos: 0 };
      }
      porSeccion[fila.seccion].votos[fila.partido] = fila.votos;
      porSeccion[fila.seccion].totalVotos += fila.votos;
      // Como la consulta viene ordenada por votos DESC, el primero que
      // encontramos por sección es automáticamente el ganador.
      if (!porSeccion[fila.seccion].ganador) {
        porSeccion[fila.seccion].ganador = fila.partido;
      }
    }

    res.set('Cache-Control', 'public, max-age=1800'); // 30 min, estos datos no cambian seguido
    res.json({ ok: true, data: porSeccion, tipoEleccion, anio: parseInt(anio) });
  } catch (e) {
    console.error('Error obteniendo resultados:', e);
    res.status(500).json({ ok: false, error: 'Error al consultar resultados' });
  }
});

export default router;

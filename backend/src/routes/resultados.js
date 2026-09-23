import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

/**
 * GET /api/resultados/:tipoEleccion/:anio
 * Devuelve, por cada sección, quién ganó y el detalle de votos —
 * exactamente lo que el mapa necesita para colorear cada polígono
 * por partido ganador.
 */
// 🔒 Esta ruta es pública (el mapa la usa). Antes cada visita hacía
// una consulta pesada de TODO el país: alguien podía repetirla miles
// de veces y tumbar la base. Ahora: se validan los datos, se filtra
// por estado y el resultado se guarda 30 minutos en memoria.
const cacheResultados = new Map(); // "tipo|anio|estado" → { hasta, cuerpo }

router.get('/:tipoEleccion/:anio', async (req, res) => {
  const { tipoEleccion } = req.params;
  const anio = parseInt(req.params.anio, 10);
  const estado = req.query.estado ? parseInt(req.query.estado, 10) : null;
  if (!/^[a-z_]{2,30}$/i.test(tipoEleccion) || !Number.isInteger(anio) || anio < 1990 || anio > 2100
      || (req.query.estado && !Number.isInteger(estado))) {
    return res.status(400).json({ ok: false, error: 'Datos de consulta inválidos' });
  }
  const llave = `${tipoEleccion}|${anio}|${estado || 'todos'}`;
  const guardado = cacheResultados.get(llave);
  if (guardado && guardado.hasta > Date.now()) {
    res.set('Cache-Control', 'public, max-age=1800');
    return res.json(guardado.cuerpo);
  }

  try {
    const resultado = await query(
      `SELECT s.numero as seccion, r.partido, r.votos
       FROM resultados_historicos r
       JOIN secciones s ON s.id = r.seccion_id
       WHERE r.tipo_eleccion = $1 AND r.anio = $2 AND ($3::int IS NULL OR s.estado_id = $3)
       ORDER BY s.numero, r.votos DESC`,
      [tipoEleccion, anio, estado]
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

    const cuerpo = { ok: true, data: porSeccion, tipoEleccion, anio };
    if (cacheResultados.size > 200) cacheResultados.clear();
    cacheResultados.set(llave, { hasta: Date.now() + 30 * 60 * 1000, cuerpo });
    res.set('Cache-Control', 'public, max-age=1800'); // 30 min, estos datos no cambian seguido
    res.json(cuerpo);
  } catch (e) {
    console.error('Error obteniendo resultados:', e);
    res.status(500).json({ ok: false, error: 'Error al consultar resultados' });
  }
});

export default router;

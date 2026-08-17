import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/calles/buscar?q=texto&seccion=123
 * Busca en el catálogo LOCAL de calles (cargado del INEGI) antes de
 * depender de una consulta en vivo a Nominatim — mucho más rápido,
 * y funciona igual de bien sin importar la carga de red del momento.
 *
 * 🆕 Si se manda ?seccion=, la búsqueda se limita al MUNICIPIO de esa
 * sección — así, si ya elegiste la sección 45 (que cae en Apizaco),
 * "Juárez" te muestra primero las de Apizaco, no las de otro
 * municipio con el mismo nombre de calle.
 *
 * Usa búsqueda por similitud de texto (pg_trgm) — encuentra
 * coincidencias aunque el usuario no escriba el nombre exacto o con
 * acentos distintos.
 */
router.get('/buscar', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) return res.json({ ok: true, data: [] });

  let municipioId = null;
  if (req.query.seccion) {
    const seccionNum = parseInt(req.query.seccion);
    if (!isNaN(seccionNum)) {
      const seccionRes = await query(
        `SELECT municipio_id FROM secciones WHERE estado_id=$1 AND numero=$2`,
        [req.usuario.estado_id, seccionNum]
      );
      municipioId = seccionRes.rows[0]?.municipio_id || null;
    }
  }

  const buscarCon = async (soloEsteMunicipio) => query(
    `SELECT c.id, c.nombre, c.lat, c.lng, m.nombre as municipio
     FROM calles_estado c
     LEFT JOIN municipios m ON m.id = c.municipio_id
     WHERE c.nombre % $1 ${soloEsteMunicipio ? 'AND c.municipio_id = $2' : ''}
     ORDER BY similarity(c.nombre, $1) DESC
     LIMIT 8`,
    soloEsteMunicipio ? [q, municipioId] : [q]
  );

  let resultado = municipioId ? await buscarCon(true) : await buscarCon(false);
  // 🆕 Si filtrar por el municipio de la sección no encontró nada, se
  // vuelve a intentar sin el filtro — mejor mostrar algo de otro
  // municipio que dejar a la persona sin ninguna sugerencia.
  if (municipioId && resultado.rows.length === 0) {
    resultado = await buscarCon(false);
  }

  res.json({ ok: true, data: resultado.rows });
});

export default router;

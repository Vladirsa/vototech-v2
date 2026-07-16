import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { getIo } from '../io.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/dia-eleccion/resultados
 * Todos los resultados de casilla capturados hasta ahora.
 */
router.get('/resultados', async (req, res) => {
  const resultado = await query(
    `SELECT r.*, s.numero as seccion_numero, u.nombre as capturado_por_nombre
     FROM resultados_casilla r
     JOIN secciones s ON s.id = r.seccion_id
     JOIN usuarios u ON u.id = r.capturado_por
     WHERE r.campana_id = $1 ORDER BY r.capturado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaResultado = z.object({
  seccion_numero: z.number().int(),
  casilla: z.string().default('B'),
  votos: z.record(z.number().int()),
  nulos: z.number().int().default(0),
  lista_nominal: z.number().int().optional(),
});

/**
 * POST /api/dia-eleccion/resultados
 * Captura un resultado de casilla Y LO TRANSMITE EN VIVO por WebSocket
 * a todos los representantes conectados de la campaña — esto es lo
 * que en la v1 (WordPress) hacíamos con polling cada 20 segundos;
 * aquí es instantáneo de verdad, sin refrescar nada.
 */
router.post('/resultados', async (req, res) => {
  const parseado = esquemaResultado.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  try {
    const seccion = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [d.seccion_numero]);
    if (!seccion.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });

    const resultado = await query(
      `INSERT INTO resultados_casilla (campana_id, seccion_id, casilla, votos, nulos, lista_nominal, capturado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (campana_id, seccion_id, casilla)
       DO UPDATE SET votos=$4, nulos=$5, lista_nominal=$6, capturado_por=$7, capturado_en=now()
       RETURNING *`,
      [req.usuario.campana_id, seccion.rows[0].id, d.casilla, JSON.stringify(d.votos), d.nulos, d.lista_nominal || null, req.usuario.sub]
    );

    const filaCompleta = { ...resultado.rows[0], seccion_numero: d.seccion_numero, capturado_por_nombre: req.usuario.nombre };

    // 📡 TIEMPO REAL: todos los demás representantes conectados a esta
    // campaña ven este resultado aparecer al instante, sin recargar nada.
    getIo().to(`campana:${req.usuario.campana_id}`).emit('resultado_actualizado', filaCompleta);

    res.status(201).json({ ok: true, data: filaCompleta });
  } catch (e) {
    console.error('Error guardando resultado de casilla:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar el resultado' });
  }
});

/**
 * GET /api/dia-eleccion/cacería
 * "Lista de cacería" — promovidos BASE que están comprometidos pero
 * que a esta hora NO han confirmado que ya votaron. Esto es lo que
 * permite mandarle a alguien por ellos antes de que cierren las urnas.
 */
router.get('/caceria', async (req, res) => {
  const resultado = await query(
    `SELECT p.id, p.nombre, p.telefono, s.numero as seccion_numero
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     WHERE p.campana_id = $1 AND p.clasificacion = 'base' AND p.comprometido = true AND p.ya_voto = false
     ORDER BY s.numero`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows, total: resultado.rows.length });
});

/**
 * PATCH /api/dia-eleccion/caceria/:id/voto
 * Marca a un promovido como que ya votó — también en tiempo real,
 * para que toda la lista de cacería se actualice sola en las pantallas
 * de todo el equipo.
 */
router.patch('/caceria/:id/voto', async (req, res) => {
  const resultado = await query(
    `UPDATE promovidos SET ya_voto = true, hora_voto = now()
     WHERE id=$1 AND campana_id=$2 RETURNING id, nombre`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  getIo().to(`campana:${req.usuario.campana_id}`).emit('voto_confirmado', resultado.rows[0]);
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

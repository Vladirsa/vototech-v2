import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT e.*, COUNT(r.id) as total_respuestas
     FROM encuestas e LEFT JOIN encuesta_respuestas r ON r.encuesta_id = e.id
     WHERE e.campana_id=$1 GROUP BY e.id ORDER BY e.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/:id', async (req, res) => {
  const encuesta = await query('SELECT * FROM encuestas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!encuesta.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  const preguntas = await query('SELECT * FROM encuesta_preguntas WHERE encuesta_id=$1 ORDER BY orden', [req.params.id]);
  res.json({ ok: true, data: { ...encuesta.rows[0], preguntas: preguntas.rows } });
});

const esquemaPregunta = z.object({
  tipo: z.enum(['opcion_multiple', 'abierta']),
  texto: z.string().min(2).max(500),
  opciones: z.array(z.string()).default([]),
});

const esquemaEncuesta = z.object({
  titulo: z.string().min(2).max(200),
  descripcion: z.string().max(500).optional(),
  preguntas: z.array(esquemaPregunta).min(1).max(20),
});

router.post('/', async (req, res) => {
  const parseado = esquemaEncuesta.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const encuesta = await query(
    `INSERT INTO encuestas (campana_id, titulo, descripcion, creado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.descripcion || null, req.usuario.sub]
  );

  for (let i = 0; i < d.preguntas.length; i++) {
    const p = d.preguntas[i];
    await query(
      `INSERT INTO encuesta_preguntas (encuesta_id, tipo, texto, opciones, orden) VALUES ($1,$2,$3,$4,$5)`,
      [encuesta.rows[0].id, p.tipo, p.texto, JSON.stringify(p.opciones), i]
    );
  }

  res.status(201).json({ ok: true, data: encuesta.rows[0] });
});

router.patch('/:id/activa', async (req, res) => {
  await query('UPDATE encuestas SET activa=$1 WHERE id=$2 AND campana_id=$3', [!!req.body.activa, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM encuestas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

/**
 * POST /api/encuestas/:id/responder
 * Captura EN CAMPO — el promotor contesta con/por la persona,
 * opcionalmente ligada a un promovido ya registrado.
 */
router.post('/:id/responder', async (req, res) => {
  const { respuestas, promovido_id, lat, lng, seccion_numero } = req.body;
  if (!respuestas || typeof respuestas !== 'object') return res.status(400).json({ ok: false, error: 'Respuestas inválidas' });

  const encuesta = await query('SELECT id FROM encuestas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!encuesta.rows[0]) return res.status(404).json({ ok: false, error: 'Encuesta no encontrada' });

  let seccionId = null;
  if (seccion_numero) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=$2 AND numero=$1', [seccion_numero, req.usuario.estado_id]);
    seccionId = s.rows[0]?.id || null;
  }

  const resultado = await query(
    `INSERT INTO encuesta_respuestas (encuesta_id, promovido_id, respuestas, origen, capturado_por, lat, lng, seccion_id)
     VALUES ($1,$2,$3,'campo',$4,$5,$6,$7) RETURNING id`,
    [req.params.id, promovido_id || null, JSON.stringify(respuestas), req.usuario.sub, lat || null, lng || null, seccionId]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/**
 * GET /api/encuestas/:id/mapa
 * Respuestas con ubicación real — para la capa nueva del mapa.
 */
router.get('/:id/mapa', async (req, res) => {
  const resultado = await query(
    `SELECT r.id, r.lat, r.lng, s.numero as seccion_numero, r.creado_en
     FROM encuesta_respuestas r LEFT JOIN secciones s ON s.id = r.seccion_id
     WHERE r.encuesta_id=$1 AND r.lat IS NOT NULL`,
    [req.params.id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * GET /api/encuestas/:id/resultados
 * Agregados: conteo por opción (opción múltiple), lista de textos (abiertas).
 */
router.get('/:id/resultados', async (req, res) => {
  const preguntas = await query('SELECT * FROM encuesta_preguntas WHERE encuesta_id=$1 ORDER BY orden', [req.params.id]);
  const respuestas = await query('SELECT respuestas FROM encuesta_respuestas WHERE encuesta_id=$1', [req.params.id]);

  const resultados = preguntas.rows.map((p) => {
    if (p.tipo === 'opcion_multiple') {
      const conteo = {};
      (p.opciones || []).forEach((op) => { conteo[op] = 0; });
      respuestas.rows.forEach((r) => {
        const val = r.respuestas[p.id];
        if (val && conteo[val] !== undefined) conteo[val]++;
      });
      return { pregunta: p.texto, tipo: p.tipo, conteo };
    }
    const textos = respuestas.rows.map((r) => r.respuestas[p.id]).filter(Boolean);
    return { pregunta: p.texto, tipo: p.tipo, textos };
  });

  res.json({ ok: true, data: { total_respuestas: respuestas.rows.length, resultados } });
});

export default router;

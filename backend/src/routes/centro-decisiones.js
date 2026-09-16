import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * 🆕 CENTRO DE DECISIONES — Bitácora de Decisiones
 *
 * Regla fundamental (documento maestro, sección 14 y 33): la IA
 * NUNCA escribe una decisión como si el usuario ya la hubiera
 * tomado. Existe una acción explícita — REGISTRAR DECISIÓN — que
 * solo dispara la persona con sesión real, nunca un proceso
 * automático. Estos endpoints son ese registro explícito.
 */

const esquemaDecision = z.object({
  situacion_detectada: z.string().min(3).max(2000),
  datos_utilizados: z.string().max(2000).optional(),
  fuente: z.string().max(150).optional(),
  analisis: z.string().max(2000).optional(),
  opciones_consideradas: z.string().max(2000).optional(),
  decision_tomada: z.string().min(3).max(2000),
  responsable_asignado_id: z.string().uuid().optional(),
  fecha_limite: z.string().optional(),
  accion: z.string().max(2000).optional(),
});

/** GET /api/centro-decisiones — lista, con filtro opcional por estado */
router.get('/', async (req, res) => {
  const { estado } = req.query;
  const params = [req.usuario.campana_id];
  let filtroEstado = '';
  if (estado && estado !== 'todas') { filtroEstado = 'AND d.estado=$2'; params.push(estado); }

  const resultado = await query(
    `SELECT d.*, u_creador.nombre as creado_por_nombre, u_resp.nombre as responsable_nombre
     FROM decision_logs d
     LEFT JOIN usuarios u_creador ON u_creador.id = d.creado_por
     LEFT JOIN usuarios u_resp ON u_resp.id = d.responsable_asignado_id
     WHERE d.campana_id=$1 ${filtroEstado}
     ORDER BY d.creado_en DESC`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

/** GET /api/centro-decisiones/:id — detalle de una decisión */
router.get('/:id', async (req, res) => {
  const resultado = await query(
    `SELECT d.*, u_creador.nombre as creado_por_nombre, u_resp.nombre as responsable_nombre
     FROM decision_logs d
     LEFT JOIN usuarios u_creador ON u_creador.id = d.creado_por
     LEFT JOIN usuarios u_resp ON u_resp.id = d.responsable_asignado_id
     WHERE d.id=$1 AND d.campana_id=$2`,
    [req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Decisión no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * POST /api/centro-decisiones — REGISTRAR DECISIÓN
 * La acción explícita del documento maestro — nunca se dispara sola,
 * siempre la manda la persona con sesión real desde la pantalla.
 */
router.post('/', async (req, res) => {
  const parseado = esquemaDecision.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const resultado = await query(
    `INSERT INTO decision_logs
       (campana_id, situacion_detectada, datos_utilizados, fuente, analisis, opciones_consideradas,
        decision_tomada, responsable_asignado_id, fecha_limite, accion, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.usuario.campana_id, d.situacion_detectada, d.datos_utilizados || null, d.fuente || null,
      d.analisis || null, d.opciones_consideradas || null, d.decision_tomada,
      d.responsable_asignado_id || null, d.fecha_limite || null, d.accion || null, req.usuario.sub,
    ]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/** PATCH /api/centro-decisiones/:id — agregar resultado/seguimiento, cambiar estado */
const esquemaActualizacion = z.object({
  resultado: z.string().max(2000).optional(),
  seguimiento: z.string().max(2000).optional(),
  estado: z.enum(['pendiente', 'en_proceso', 'completada', 'cancelada']).optional(),
  responsable_asignado_id: z.string().uuid().optional(),
  fecha_limite: z.string().optional(),
});
router.patch('/:id', async (req, res) => {
  const parseado = esquemaActualizacion.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const campos = [];
  const valores = [];
  let i = 1;
  Object.entries(d).forEach(([campo, valor]) => { campos.push(`${campo}=$${i}`); valores.push(valor); i++; });
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  campos.push(`actualizado_en=now()`);

  const resultado = await query(
    `UPDATE decision_logs SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    [...valores, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Decisión no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

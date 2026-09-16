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

/**
 * 🆕 GET /api/centro-decisiones/sugerencias
 * El motor de sugerencias — analiza priorización, auditoría, y
 * metas reales, y PROPONE decisiones concretas con datos exactos.
 * Nunca decide por ti — cada sugerencia trae sus opciones para que
 * tú elijas y la registres (o la descartes).
 */
router.get('/sugerencias', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const estadoId = req.usuario.estado_id;
  const sugerencias = [];

  // 1) Secciones críticas/recuperables SIN NADIE de tu equipo asignado —
  // la señal de "necesita una decisión" más fuerte que hay: territorio
  // que sí puedes voltear, pero no tiene quién trabaje ahí.
  const campanaRes = await query('SELECT partido, tipo_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const partido = campanaRes.rows[0]?.partido;
  const tipoEleccion = campanaRes.rows[0]?.tipo_eleccion;

  if (partido) {
    const ultimoAnio = await query(`SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1`, [tipoEleccion]);
    const anio = ultimoAnio.rows[0]?.anio;
    if (anio) {
      const seccionesSinCobertura = await query(
        `SELECT s.numero, m.nombre as municipio,
           SUM(r.votos) FILTER (WHERE r.partido=$3) as votos_propios, SUM(r.votos) as votos_total
         FROM secciones s JOIN municipios m ON m.id = s.municipio_id
         JOIN resultados_historicos r ON r.seccion_id = s.id AND r.anio=$2
         WHERE s.estado_id=$1
         AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.campana_id=$4 AND u.territorio_tipo='seccion' AND u.territorio_id=s.numero AND u.activo != false)
         GROUP BY s.numero, m.nombre
         HAVING SUM(r.votos) > 0
         ORDER BY (SUM(r.votos) FILTER (WHERE r.partido=$3)::float / NULLIF(SUM(r.votos), 0)) DESC LIMIT 5`,
        [estadoId, anio, partido, campanaId]
      ).catch(() => ({ rows: [] }));

      seccionesSinCobertura.rows.forEach((s) => {
        const pct = s.votos_total > 0 ? Math.round((s.votos_propios / s.votos_total) * 100) : 0;
        if (pct >= 30) { // solo sugerir donde ya hay base real, no en secciones perdidas
          sugerencias.push({
            tipo: 'cobertura_territorial',
            situacion_detectada: `La sección ${String(s.numero).padStart(3, '0')} (${s.municipio}) tuvo ${pct}% de votos para tu partido en ${anio}, pero no tiene a nadie de tu estructura asignado.`,
            datos_utilizados: `${pct}% de ${s.votos_total} votos totales en ${anio} (resultados_historicos)`,
            fuente: 'Priorización + Estructura',
            opciones_consideradas: [
              'Asignar un coordinador seccional a esta sección',
              'Reasignar temporalmente a un promotor de una sección vecina ya cubierta',
              'Dejarla sin cubrir por ahora si hay prioridades más urgentes',
            ],
          });
        }
      });
    }
  }

  // 2) Ritmo real vs lo que se necesita para llegar a la meta en el tiempo restante
  const campanaCompleta = await query('SELECT meta_votos, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const { meta_votos, fecha_eleccion } = campanaCompleta.rows[0] || {};
  if (meta_votos && fecha_eleccion) {
    const comprometidosRes = await query(`SELECT COUNT(*) FILTER (WHERE comprometido) as total FROM promovidos WHERE campana_id=$1`, [campanaId]);
    const comprometidos = parseInt(comprometidosRes.rows[0].total);
    const diasRestantes = Math.max(1, Math.ceil((new Date(fecha_eleccion) - new Date()) / 86400000));
    const faltantes = meta_votos - comprometidos;
    if (faltantes > 0) {
      const ritmoNecesario = Math.ceil(faltantes / diasRestantes);
      const ritmoRes = await query(`SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido AND creado_en > now() - interval '7 days'`, [campanaId]);
      const ritmoActual = Math.round(parseInt(ritmoRes.rows[0].total) / 7);
      if (ritmoActual < ritmoNecesario) {
        sugerencias.push({
          tipo: 'ritmo_meta',
          situacion_detectada: `Al ritmo actual (${ritmoActual}/día en los últimos 7 días) no se alcanza la meta de ${meta_votos.toLocaleString()} votos comprometidos en los ${diasRestantes} días que quedan — se necesitan ${ritmoNecesario}/día.`,
          datos_utilizados: `Faltan ${faltantes.toLocaleString()} comprometidos, ${diasRestantes} días restantes, ritmo actual ${ritmoActual}/día vs ${ritmoNecesario}/día necesario`,
          fuente: 'Bitácora diaria + Metas de campaña',
          opciones_consideradas: [
            'Aumentar la meta diaria de cada promotor',
            'Sumar más gente a la estructura de campo',
            'Enfocar el esfuerzo restante solo en secciones críticas/recuperables (no en todas por igual)',
          ],
        });
      }
    }
  }

  // 3) Reusar la auditoría de inconsistencias — cada hallazgo CRÍTICA/IMPORTANTE también es candidato a decisión
  try {
    const auditoriaRes = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1 AND estado='activa'`, [campanaId]);
    const incidenciasAbiertas = parseInt(auditoriaRes.rows[0].total);
    if (incidenciasAbiertas > 0) {
      sugerencias.push({
        tipo: 'incidencias_abiertas',
        situacion_detectada: `Hay ${incidenciasAbiertas} incidencia(s) reportada(s) que siguen sin resolver.`,
        datos_utilizados: `${incidenciasAbiertas} incidencias con estado 'activa' (módulo Incidencias)`,
        fuente: 'Módulo Incidencias',
        opciones_consideradas: [
          'Asignar a alguien específico para cerrarlas esta semana',
          'Revisar si alguna requiere escalar al área jurídica',
          'Confirmar que ya se resolvieron y solo falta actualizar el estado',
        ],
      });
    }
  } catch (e) { /* si falla esta parte, no bloquea las demás sugerencias */ }

  res.json({ ok: true, data: sugerencias });
});

export default router;

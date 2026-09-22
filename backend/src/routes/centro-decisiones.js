import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * 🆕 RBAC del rol COORDINADOR (documento maestro, sección 3) — 7
 * permisos granulares, independientes del rol base (coord_seccional,
 * etc.). candidato/jefe_campana SIEMPRE tienen todo — el resto
 * necesita que alguien con permiso ADMIN se lo otorgue explícitamente.
 * Ser "administrador general" del sistema NO da acceso automático
 * aquí — la skill lo prohíbe explícitamente.
 */
const PERMISOS_VALIDOS = ['VIEW', 'AI', 'SCENARIOS', 'REPORTS', 'DECISION_LOG', 'EXPORT', 'ADMIN'];
const ROLES_CON_TODO_AUTOMATICO = ['candidato', 'jefe_campana'];

async function tienePermiso(usuario, permiso) {
  if (ROLES_CON_TODO_AUTOMATICO.includes(usuario.rol)) return true;
  const r = await query(`SELECT 1 FROM permisos_centro_decisiones WHERE usuario_id=$1 AND permiso=$2`, [usuario.sub, permiso]);
  return r.rows.length > 0;
}
function requierePermisoCD(permiso) {
  return async (req, res, next) => {
    const ok = await tienePermiso(req.usuario, permiso);
    if (!ok) return res.status(403).json({ ok: false, error: `No tienes el permiso ${permiso} en Centro de Decisiones — pídele a tu jefe de campaña que te lo otorgue.` });
    next();
  };
}

/** GET /api/centro-decisiones/permisos/:usuarioId — ver los permisos de una persona */
router.get('/permisos/:usuarioId', requierePermisoCD('ADMIN'), async (req, res) => {
  const r = await query(`SELECT permiso FROM permisos_centro_decisiones WHERE usuario_id=$1`, [req.params.usuarioId]);
  res.json({ ok: true, data: r.rows.map((x) => x.permiso) });
});

/** POST /api/centro-decisiones/permisos — otorgar un permiso */
router.post('/permisos', requierePermisoCD('ADMIN'), async (req, res) => {
  const { usuario_id, permiso } = req.body;
  if (!PERMISOS_VALIDOS.includes(permiso)) return res.status(400).json({ ok: false, error: 'Permiso inválido' });
  await query(
    `INSERT INTO permisos_centro_decisiones (usuario_id, permiso, otorgado_por) VALUES ($1,$2,$3) ON CONFLICT (usuario_id, permiso) DO NOTHING`,
    [usuario_id, permiso, req.usuario.sub]
  );
  res.status(201).json({ ok: true });
});

/** DELETE /api/centro-decisiones/permisos — quitar un permiso */
router.delete('/permisos', requierePermisoCD('ADMIN'), async (req, res) => {
  const { usuario_id, permiso } = req.body;
  await query(`DELETE FROM permisos_centro_decisiones WHERE usuario_id=$1 AND permiso=$2`, [usuario_id, permiso]);
  res.json({ ok: true });
});

/**
 * 🆕 AUDITORÍA DEL PROPIO CENTRO DE DECISIONES (documento maestro,
 * sección 28) — middleware, no llamada manual por endpoint (así
 * nunca se olvida registrar uno). Registra TODA consulta y acción:
 * quién, cuándo, qué endpoint, y con qué parámetros — para poder
 * reconstruir después qué información vio el usuario y qué decidió.
 * Corre DESPUÉS de responder (no retrasa la respuesta al usuario).
 */
router.use((req, res, next) => {
  res.on('finish', () => {
    if (!req.usuario?.campana_id) return; // sin sesión válida, no hay qué auditar
    const detalle = JSON.stringify({ query: req.query, body: req.method !== 'GET' ? req.body : undefined, status: res.statusCode }).slice(0, 2000);
    query(
      `INSERT INTO auditoria_centro_decisiones (campana_id, usuario_id, accion, modulo, detalle) VALUES ($1,$2,$3,$4,$5)`,
      [req.usuario.campana_id, req.usuario.sub, `${req.method} ${req.path}`, 'centro-decisiones', detalle]
    ).catch((e) => console.error('Error registrando auditoría de Centro de Decisiones:', e.message));
  });
  next();
});

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
router.post('/', requierePermisoCD('DECISION_LOG'), async (req, res) => {
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
router.patch('/:id', requierePermisoCD('DECISION_LOG'), async (req, res) => {
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

// ═══════════════════════════════════════════════════════════════
// 🆕 CENTRO DE TAREAS (documento maestro, sección 13) — acciones
// pendientes con responsable y fecha límite. Nunca se cierra sola:
// completar o cancelar es siempre una acción explícita.
// ═══════════════════════════════════════════════════════════════

const esquemaTarea = z.object({
  descripcion: z.string().min(3).max(2000),
  origen: z.string().max(100).optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'critica']).default('media'),
  responsable_id: z.string().uuid().optional(),
  territorio_tipo: z.enum(['seccion', 'municipio', 'distrito_local', 'distrito_federal', 'estatal']).optional(),
  territorio_id: z.number().int().optional(),
  fecha_limite: z.string().optional(),
});

router.get('/tareas', async (req, res) => {
  const { estado, responsable_id } = req.query;
  const params = [req.usuario.campana_id];
  let filtros = '';
  if (estado && estado !== 'todas') { filtros += ` AND t.estado=$${params.length + 1}`; params.push(estado); }
  if (responsable_id) { filtros += ` AND t.responsable_id=$${params.length + 1}`; params.push(responsable_id); }

  const resultado = await query(
    `SELECT t.*, u.nombre as responsable_nombre, uc.nombre as creado_por_nombre,
       (t.fecha_limite IS NOT NULL AND t.fecha_limite < CURRENT_DATE AND t.estado NOT IN ('completada','cancelada')) as vencida
     FROM tareas t
     LEFT JOIN usuarios u ON u.id = t.responsable_id
     LEFT JOIN usuarios uc ON uc.id = t.creado_por
     WHERE t.campana_id=$1 ${filtros}
     ORDER BY (t.estado IN ('completada','cancelada')) ASC, t.fecha_limite ASC NULLS LAST, t.creado_en DESC`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

router.post('/tareas', async (req, res) => {
  const parseado = esquemaTarea.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO tareas (campana_id, descripcion, origen, prioridad, responsable_id, territorio_tipo, territorio_id, fecha_limite, estado, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.usuario.campana_id, d.descripcion, d.origen || null, d.prioridad,
     d.responsable_id || null, d.territorio_tipo || null, d.territorio_id || null, d.fecha_limite || null,
     d.responsable_id ? 'asignada' : 'pendiente', req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

const esquemaActualizarTarea = z.object({
  estado: z.enum(['pendiente', 'asignada', 'en_proceso', 'bloqueada', 'completada', 'cancelada']).optional(),
  responsable_id: z.string().uuid().nullable().optional(),
  comentario: z.string().max(2000).optional(),
  evidencia_url: z.string().url().optional(),
  fecha_limite: z.string().optional(),
});
router.patch('/tareas/:id', async (req, res) => {
  const parseado = esquemaActualizarTarea.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const campos = [];
  const valores = [];
  let i = 1;
  Object.entries(d).forEach(([campo, valor]) => { campos.push(`${campo}=$${i}`); valores.push(valor); i++; });
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  // 🆕 Cerrar (completada/cancelada) siempre deja fecha_cierre — nunca se infiere sola después
  if (d.estado === 'completada' || d.estado === 'cancelada') { campos.push(`fecha_cierre=now()`); }

  const resultado = await query(
    `UPDATE tareas SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    [...valores, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 MOTOR DE ALERTAS FORMAL (documento maestro, sección 6) — a
// diferencia de las alertas que ya viven sueltas en Auditoría o el
// Resumen con IA (se recalculan cada vez, sin memoria), estas
// alertas se GUARDAN con estado y ciclo de vida completo:
// NUEVA → EN REVISIÓN → ASIGNADA → EN PROCESO → RESUELTA/DESCARTADA.
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/centro-decisiones/alertas/generar
 * Corre las revisiones y guarda cada hallazgo como alerta formal.
 * Nunca duplica: cada alerta tiene una "clave_deduplicacion" estable
 * — si la misma condición sigue activa, no crea una segunda fila,
 * solo actualiza fecha_deteccion. Si la condición YA NO existe (por
 * ejemplo, la incidencia se resolvió), la alerta abierta correspondiente
 * se marca resuelta automáticamente — nunca al revés (nunca reabre
 * una que la persona ya descartó a mano).
 */
router.post('/alertas/generar', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const hallazgos = [];

  // 1) Incidencias abiertas hace más de 3 días — módulo Incidencias
  const incidenciasViejas = await query(
    `SELECT id, tipo, urgencia, seccion_id, creado_en FROM incidencias WHERE campana_id=$1 AND estado='activa' AND creado_en < now() - interval '3 days'`,
    [campanaId]
  );
  incidenciasViejas.rows.forEach((i) => {
    hallazgos.push({
      tipo: 'incidencia_sin_resolver', nivel: i.urgencia === 'urgente' ? 'critica' : 'alta', modulo_origen: 'incidencias',
      descripcion: `Incidencia de tipo "${i.tipo}" sigue abierta desde ${new Date(i.creado_en).toLocaleDateString('es-MX')}, sin resolver.`,
      dato_generador: `incidencias.id=${i.id}`, valor_actual: 'activa', valor_referencia: 'resuelta en ≤3 días',
      clave: `incidencia-vieja-${i.id}`, territorio_id: null,
      // Para el cierre automático: la condición deja de existir si la incidencia cambia de estado
      condicionActiva: async () => {
        const r = await query(`SELECT estado FROM incidencias WHERE id=$1`, [i.id]);
        return r.rows[0]?.estado === 'activa';
      },
    });
  });

  // 2) Coordinadores/líderes sin actividad en 7+ días — módulo Estructura
  const coordSinActividad = await query(
    `SELECT u.id, u.nombre, u.rol, MAX(p.creado_en) as ultima
     FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por=u.id AND p.campana_id=$1
     WHERE u.campana_id=$1 AND u.activo != false AND u.rol != 'promotor'
     GROUP BY u.id, u.nombre, u.rol HAVING MAX(p.creado_en) IS NULL OR MAX(p.creado_en) < now() - interval '7 days'`,
    [campanaId]
  );
  coordSinActividad.rows.forEach((c) => {
    hallazgos.push({
      tipo: 'responsable_sin_actividad', nivel: 'media', modulo_origen: 'estructura',
      descripcion: `${c.nombre} (${c.rol}) no tiene ninguna captura registrada en los últimos 7 días.`,
      dato_generador: `usuarios.id=${c.id}`, valor_actual: c.ultima ? new Date(c.ultima).toLocaleDateString('es-MX') : 'nunca',
      valor_referencia: 'actividad en ≤7 días', clave: `sin-actividad-${c.id}`, responsable_relacionado_id: c.id,
      condicionActiva: async () => {
        const r = await query(`SELECT MAX(creado_en) as u FROM promovidos WHERE registrado_por=$1 AND campana_id=$2`, [c.id, campanaId]);
        return !r.rows[0]?.u || new Date(r.rows[0].u) < new Date(Date.now() - 7 * 86400000);
      },
    });
  });

  // 3) Gasto acercándose o superando el tope OPLE — módulo Administración
  const campana = await query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [campanaId]);
  const tope = campana.rows[0]?.tope_gasto_ople;
  if (tope) {
    const gasto = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
    const pct = (parseFloat(gasto.rows[0].total) / parseFloat(tope)) * 100;
    if (pct >= 80) {
      hallazgos.push({
        tipo: 'gasto_cerca_del_tope', nivel: pct >= 95 ? 'critica' : 'alta', modulo_origen: 'finanzas',
        descripcion: `El gasto registrado ya llegó a ${pct.toFixed(1)}% del tope OPLE permitido.`,
        dato_generador: 'gastos_campana (suma)', valor_actual: `${pct.toFixed(1)}%`, valor_referencia: '<80%',
        clave: 'gasto-cerca-tope', territorio_id: null,
        condicionActiva: async () => {
          const g2 = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
          return (parseFloat(g2.rows[0].total) / parseFloat(tope)) * 100 >= 80;
        },
      });
    }
  }

  // ── Guardar cada hallazgo (upsert por clave_deduplicacion) ──
  let creadas = 0, actualizadas = 0;
  for (const h of hallazgos) {
    const existente = await query(
      `SELECT id FROM alertas_sistema WHERE campana_id=$1 AND clave_deduplicacion=$2 AND estado NOT IN ('resuelta','descartada')`,
      [campanaId, h.clave]
    );
    if (existente.rows[0]) {
      await query(`UPDATE alertas_sistema SET fecha_deteccion=now() WHERE id=$1`, [existente.rows[0].id]);
      actualizadas++;
    } else {
      await query(
        `INSERT INTO alertas_sistema (campana_id, tipo, nivel, territorio_tipo, territorio_id, modulo_origen, descripcion, dato_generador, valor_actual, valor_referencia, responsable_relacionado_id, clave_deduplicacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [campanaId, h.tipo, h.nivel, h.territorio_tipo || null, h.territorio_id || null, h.modulo_origen, h.descripcion, h.dato_generador, h.valor_actual, h.valor_referencia, h.responsable_relacionado_id || null, h.clave]
      );
      creadas++;
    }
  }

  // ── Auto-resolver alertas cuya condición YA NO existe (nunca reabre las descartadas a mano) ──
  let resueltas = 0;
  const abiertas = await query(`SELECT id, clave_deduplicacion FROM alertas_sistema WHERE campana_id=$1 AND estado NOT IN ('resuelta','descartada')`, [campanaId]);
  for (const a of abiertas.rows) {
    const h = hallazgos.find((x) => x.clave === a.clave_deduplicacion);
    const sigueActiva = h ? await h.condicionActiva() : false;
    if (!sigueActiva) {
      await query(`UPDATE alertas_sistema SET estado='resuelta', fecha_resolucion=now() WHERE id=$1`, [a.id]);
      resueltas++;
    }
  }

  res.json({ ok: true, data: { creadas, actualizadas, resueltas_automaticamente: resueltas } });
});

router.get('/alertas', async (req, res) => {
  const { nivel, estado } = req.query;
  const params = [req.usuario.campana_id];
  let filtros = '';
  if (nivel) { filtros += ` AND nivel=$${params.length + 1}`; params.push(nivel); }
  if (estado && estado !== 'todas') { filtros += ` AND estado=$${params.length + 1}`; params.push(estado); }
  else if (!estado) { filtros += ` AND estado NOT IN ('resuelta','descartada')`; }

  // 🆕 Se agrega el teléfono del responsable — lo usa el frontend
  // para armar el botón "📲 WhatsApp" de cada alerta (abre WhatsApp
  // con un mensaje ya escrito, la persona lo revisa y lo manda).
  const resultado = await query(
    `SELECT a.*, u.nombre as responsable_nombre, u.telefono as responsable_telefono FROM alertas_sistema a
     LEFT JOIN usuarios u ON u.id = a.responsable_relacionado_id
     WHERE a.campana_id=$1 ${filtros}
     ORDER BY CASE nivel WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 WHEN 'baja' THEN 4 ELSE 5 END, fecha_deteccion DESC`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

router.patch('/alertas/:id', async (req, res) => {
  const { estado } = req.body;
  if (!['nueva', 'en_revision', 'asignada', 'en_proceso', 'resuelta', 'descartada'].includes(estado)) {
    return res.status(400).json({ ok: false, error: 'Estado inválido' });
  }
  const campos = ['estado=$1'];
  const valores = [estado];
  if (['resuelta', 'descartada'].includes(estado)) campos.push('fecha_resolucion=now()');
  const resultado = await query(
    `UPDATE alertas_sistema SET ${campos.join(', ')} WHERE id=$${valores.length + 1} AND campana_id=$${valores.length + 2} RETURNING *`,
    [...valores, req.params.id, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 ¿QUÉ CAMBIÓ? (documento maestro, sección 5) — compara el
// estado actual contra un corte anterior (ayer, hace 1 semana, hace
// 1 mes), usando las fechas que YA existen en cada registro — sin
// necesitar guardar "fotos" del sistema en una tabla nueva.
//
// IMPORTANTE: el valor real NUNCA se modifica ni se recorta — solo
// se etiqueta (AUMENTÓ / SIN CAMBIOS / META CUBIERTA / etc.).
// ═══════════════════════════════════════════════════════════════

const PERIODOS_DIAS = { dia: 1, semana: 7, mes: 30 };

router.get('/que-cambio', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const periodo = req.query.periodo || 'dia';
  const dias = PERIODOS_DIAS[periodo];
  if (!dias) return res.status(400).json({ ok: false, error: 'periodo inválido — usa dia, semana o mes' });

  const corteAnterior = new Date(Date.now() - dias * 86400000);

  // Cada métrica es ACUMULATIVA (nunca se le resta un registro) —
  // por eso comparar "total hasta ahora" vs "total hasta el corte
  // anterior" es válido y honesto, sin necesitar snapshots guardados.
  const [promActual, promAnterior, compActual, compAnterior, estrActual, estrAnterior, gastoActual, gastoAnterior] = await Promise.all([
    query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1`, [campanaId]),
    query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1 AND creado_en <= $2`, [campanaId, corteAnterior]),
    query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1 AND comprometido=true`, [campanaId]),
    query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1 AND comprometido=true AND creado_en <= $2`, [campanaId, corteAnterior]),
    query(`SELECT COUNT(*) as n FROM usuarios WHERE campana_id=$1 AND activo != false`, [campanaId]),
    query(`SELECT COUNT(*) as n FROM usuarios WHERE campana_id=$1 AND activo != false AND creado_en <= $2`, [campanaId, corteAnterior]),
    query(`SELECT COALESCE(SUM(monto),0) as n FROM gastos_campana WHERE campana_id=$1`, [campanaId]),
    query(`SELECT COALESCE(SUM(monto),0) as n FROM gastos_campana WHERE campana_id=$1 AND creado_en <= $2`, [campanaId, corteAnterior]),
  ]);
  // Incidencias NO es acumulativa (se resuelven) — aquí solo se
  // cuentan las nuevas del período, no un estado histórico reconstruido.
  const incidenciasNuevas = await query(`SELECT COUNT(*) as n FROM incidencias WHERE campana_id=$1 AND creado_en > $2`, [campanaId, corteAnterior]);

  function etiquetar(actual, anterior) {
    const dif = actual - anterior;
    if (anterior === 0 && actual === 0) return { estado: 'SIN DATOS', diferencia: 0 };
    if (dif === 0) return { estado: 'SIN CAMBIOS', diferencia: 0 };
    return { estado: dif > 0 ? 'AUMENTÓ' : 'DISMINUYÓ', diferencia: dif };
  }

  const metricas = [
    { nombre: 'Promovidos totales', modulo: 'Promovidos', actual: parseInt(promActual.rows[0].n), anterior: parseInt(promAnterior.rows[0].n) },
    { nombre: 'Comprometidos (van a votar)', modulo: 'Promovidos', actual: parseInt(compActual.rows[0].n), anterior: parseInt(compAnterior.rows[0].n) },
    { nombre: 'Estructura activa', modulo: 'Estructura', actual: parseInt(estrActual.rows[0].n), anterior: parseInt(estrAnterior.rows[0].n) },
    { nombre: 'Gasto acumulado', modulo: 'Administración', actual: parseFloat(gastoActual.rows[0].n), anterior: parseFloat(gastoAnterior.rows[0].n), esMoneda: true },
  ].map((m) => ({ ...m, ...etiquetar(m.actual, m.anterior) }));

  res.json({
    ok: true,
    data: {
      periodo, corte_actual: new Date().toISOString(), corte_anterior: corteAnterior.toISOString(),
      metricas,
      incidencias_nuevas_en_el_periodo: parseInt(incidenciasNuevas.rows[0].n),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 COMPARADOR (documento maestro, sección 15) — Territorio vs
// Territorio, y Responsable vs Responsable. Fórmulas exactas:
// Diferencia = B − A
// Variación % = ((B − A) / A) × 100 (si A=0, se marca "N/D", nunca se divide entre cero)
// ═══════════════════════════════════════════════════════════════

function calcularComparacion(valorA, valorB, nombreA, nombreB, unidad = '') {
  const diferencia = valorB - valorA;
  const variacionPct = valorA !== 0 ? +((diferencia / valorA) * 100).toFixed(1) : null;
  const tendencia = diferencia > 0 ? 'B_MAYOR' : diferencia < 0 ? 'A_MAYOR' : 'IGUAL';
  return {
    valor_a: valorA, valor_b: valorB, nombre_a: nombreA, nombre_b: nombreB,
    diferencia_absoluta: diferencia,
    diferencia_porcentual: variacionPct === null ? 'N/D (el valor de referencia era 0)' : `${variacionPct > 0 ? '+' : ''}${variacionPct}%`,
    tendencia, unidad,
  };
}

router.get('/comparar/territorio', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const { tipo, a, b } = req.query; // tipo=municipio, a y b son municipio_id
  if (!['municipio'].includes(tipo)) return res.status(400).json({ ok: false, error: 'Por ahora solo se puede comparar municipio vs municipio' });

  const datosTerritorio = async (municipioId) => {
    const nombreRes = await query('SELECT nombre FROM municipios WHERE id=$1', [municipioId]);
    const r = await query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE p.comprometido=true) as comprometidos
       FROM promovidos p JOIN secciones s ON s.id = p.seccion_id WHERE p.campana_id=$1 AND s.municipio_id=$2`,
      [campanaId, municipioId]
    );
    return { nombre: nombreRes.rows[0]?.nombre || `Municipio ${municipioId}`, total: parseInt(r.rows[0].total), comprometidos: parseInt(r.rows[0].comprometidos) };
  };

  const [datosA, datosB] = await Promise.all([datosTerritorio(a), datosTerritorio(b)]);

  res.json({
    ok: true,
    data: {
      promovidos: calcularComparacion(datosA.total, datosB.total, datosA.nombre, datosB.nombre, 'promovidos'),
      comprometidos: calcularComparacion(datosA.comprometidos, datosB.comprometidos, datosA.nombre, datosB.nombre, 'comprometidos'),
    },
  });
});

router.get('/comparar/responsable', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const { a, b } = req.query; // usuario_id de cada uno

  const datosResponsable = async (usuarioId) => {
    const personaRes = await query('SELECT nombre FROM usuarios WHERE id=$1', [usuarioId]);
    const ramaRes = await query(
      `WITH RECURSIVE rama AS (
         SELECT id FROM usuarios WHERE id=$1
         UNION ALL
         SELECT u.id FROM usuarios u JOIN rama r ON u.parent_id = r.id WHERE u.campana_id=$2 AND u.activo != false
       ) SELECT id FROM rama`,
      [usuarioId, campanaId]
    );
    const ids = ramaRes.rows.map((r) => r.id);
    const p = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido=true) as comprometidos FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2::uuid[])`, [campanaId, ids]);
    return { nombre: personaRes.rows[0]?.nombre || 'Desconocido', total: parseInt(p.rows[0].total), comprometidos: parseInt(p.rows[0].comprometidos), tamano_equipo: ids.length };
  };

  const [datosA, datosB] = await Promise.all([datosResponsable(a), datosResponsable(b)]);

  res.json({
    ok: true,
    data: {
      promovidos_rama: calcularComparacion(datosA.total, datosB.total, datosA.nombre, datosB.nombre, 'promovidos (toda la rama)'),
      comprometidos_rama: calcularComparacion(datosA.comprometidos, datosB.comprometidos, datosA.nombre, datosB.nombre, 'comprometidos'),
      tamano_equipo: calcularComparacion(datosA.tamano_equipo, datosB.tamano_equipo, datosA.nombre, datosB.nombre, 'personas en el equipo'),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 MOTOR DE ESCENARIOS / SIMULADOR (documento maestro, sección 9)
// — la simulación en sí vive del lado del navegador (modificar
// variables sin tocar la base). Este endpoint SOLO entrega los
// números reales de partida, para que el simulador nunca invente
// un punto de arranque.
// ═══════════════════════════════════════════════════════════════
router.get('/escenarios/base', requierePermisoCD('SCENARIOS'), async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const campana = await query('SELECT meta_votos, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const { meta_votos, fecha_eleccion } = campana.rows[0] || {};

  const totales = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido=true) as comprometidos FROM promovidos WHERE campana_id=$1`, [campanaId]);
  const ritmo7d = await query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1 AND comprometido=true AND creado_en > now() - interval '7 days'`, [campanaId]);

  const diasRestantes = fecha_eleccion ? Math.max(0, Math.ceil((new Date(fecha_eleccion) - new Date()) / 86400000)) : null;

  res.json({
    ok: true,
    data: {
      meta_votos: meta_votos || null,
      comprometidos_actuales: parseInt(totales.rows[0].comprometidos),
      promovidos_totales: parseInt(totales.rows[0].total),
      dias_restantes: diasRestantes,
      ritmo_actual_diario: +(parseInt(ritmo7d.rows[0].n) / 7).toFixed(1),
      nota: 'Estos son datos REALES de partida — la simulación que hagas con ellos nunca se guarda como dato real.',
    },
  });
});

/**
 * GET /api/centro-decisiones/auditoria — ver el registro completo
 * de qué se consultó y qué se hizo en este módulo.
 */
router.get('/auditoria', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, u.nombre as usuario_nombre FROM auditoria_centro_decisiones a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.campana_id=$1 ORDER BY a.creado_en DESC LIMIT 200`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 HISTÓRICO AVANZADO (documento maestro, sección 10) — series de
// tiempo reales día por día (usando generate_series para que ningún
// día se pierda, incluso los de actividad cero), con detección de
// anomalías por desviación estándar — no "se ve raro", sino un
// criterio estadístico real: más de 2 desviaciones estándar del
// promedio de la serie.
// ═══════════════════════════════════════════════════════════════
router.get('/historico', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const dias = Math.min(90, parseInt(req.query.dias) || 30);

  const serie = await query(
    `SELECT d::date as fecha,
       (SELECT COUNT(*) FROM promovidos p WHERE p.campana_id=$1 AND p.creado_en::date = d::date) as promovidos,
       (SELECT COUNT(*) FROM promovidos p WHERE p.campana_id=$1 AND p.creado_en::date = d::date AND p.comprometido=true) as comprometidos
     FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, '1 day') as d
     ORDER BY d`,
    [campanaId, dias]
  );

  function detectarAnomalias(valores) {
    const n = valores.length;
    if (n < 3) return valores.map(() => false);
    const media = valores.reduce((s, v) => s + v, 0) / n;
    const varianza = valores.reduce((s, v) => s + (v - media) ** 2, 0) / n;
    const desviacion = Math.sqrt(varianza);
    if (desviacion === 0) return valores.map(() => false); // serie plana, no hay anomalía posible
    return valores.map((v) => Math.abs(v - media) > 2 * desviacion);
  }

  const valoresPromovidos = serie.rows.map((r) => parseInt(r.promovidos));
  const anomaliasPromovidos = detectarAnomalias(valoresPromovidos);

  const puntos = serie.rows.map((r, i) => ({
    fecha: r.fecha, promovidos: parseInt(r.promovidos), comprometidos: parseInt(r.comprometidos),
    es_anomalia: anomaliasPromovidos[i],
  }));

  const media = valoresPromovidos.reduce((s, v) => s + v, 0) / (valoresPromovidos.length || 1);

  res.json({
    ok: true,
    data: {
      puntos, promedio_diario: +media.toFixed(1), total_anomalias: anomaliasPromovidos.filter(Boolean).length,
      metodo: 'Un día se marca como anomalía si se aleja del promedio de la serie por más de 2 desviaciones estándar — no es una opinión, es un cálculo estadístico sobre los mismos datos.',
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 ASISTENTE IA CON TRAZABILIDAD TOTAL (documento maestro,
// secciones 7, 8, 32) — nunca envía la base de datos completa al
// modelo. Esta es la "VOTOTECH DATA ACCESS LAYER": junta SOLO datos
// ya calculados y agregados de módulos reales, arma el contexto, y
// se lo manda a la IA con instrucciones estrictas de no inventar
// nada. Cada respuesta debe poder abrir "VER FUENTES".
// ═══════════════════════════════════════════════════════════════

async function construirContextoControlado(campanaId) {
  const campana = await query('SELECT nombre_candidato, meta_votos, fecha_eleccion FROM campanas WHERE id=$1', [campanaId]);
  const totales = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido=true) as comprometidos FROM promovidos WHERE campana_id=$1`, [campanaId]);
  const alertasActivas = await query(`SELECT nivel, descripcion FROM alertas_sistema WHERE campana_id=$1 AND estado NOT IN ('resuelta','descartada') ORDER BY CASE nivel WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 ELSE 3 END LIMIT 10`, [campanaId]).catch(() => ({ rows: [] }));
  const tareasPendientes = await query(`SELECT COUNT(*) as n FROM tareas WHERE campana_id=$1 AND estado NOT IN ('completada','cancelada')`, [campanaId]).catch(() => ({ rows: [{ n: 0 }] }));
  const decisionesRecientes = await query(`SELECT situacion_detectada, decision_tomada, estado FROM decision_logs WHERE campana_id=$1 ORDER BY creado_en DESC LIMIT 5`, [campanaId]).catch(() => ({ rows: [] }));
  const ritmo7d = await query(`SELECT COUNT(*) as n FROM promovidos WHERE campana_id=$1 AND comprometido=true AND creado_en > now() - interval '7 days'`, [campanaId]);

  return {
    fecha_del_contexto: new Date().toISOString(),
    candidato: campana.rows[0]?.nombre_candidato,
    meta_votos: campana.rows[0]?.meta_votos || null,
    promovidos_totales: { valor: parseInt(totales.rows[0].total), fuente: 'módulo Promovidos (COUNT total)' },
    comprometidos: { valor: parseInt(totales.rows[0].comprometidos), fuente: 'módulo Promovidos (COUNT donde comprometido=true)' },
    ritmo_ultimos_7_dias: { valor: +(parseInt(ritmo7d.rows[0].n) / 7).toFixed(1), fuente: 'módulo Promovidos, últimos 7 días / 7' },
    alertas_activas: { valor: alertasActivas.rows, fuente: 'Motor de Alertas (Centro de Decisiones)' },
    tareas_pendientes: { valor: parseInt(tareasPendientes.rows[0].n), fuente: 'Centro de Tareas' },
    decisiones_recientes: { valor: decisionesRecientes.rows, fuente: 'Bitácora de Decisiones' },
  };
}

router.post('/asistente', requierePermisoCD('AI'), async (req, res) => {
  const { pregunta } = req.body;
  if (!pregunta || pregunta.trim().length < 3) return res.status(400).json({ ok: false, error: 'Escribe una pregunta' });

  const contexto = await construirContextoControlado(req.usuario.campana_id);

  try {
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Eres el Asistente IA de VotoTech — un analista de la información INTERNA de esta campaña, nunca un decisor.

Pregunta de la persona: "${pregunta}"

Contexto de datos REALES disponibles (JSON):
${JSON.stringify(contexto, null, 2)}

Reglas OBLIGATORIAS:
- Usa ÚNICAMENTE los datos de este JSON. Si la pregunta necesita un dato que NO está aquí, responde exactamente: "NO HAY DATOS SUFICIENTES PARA CONCLUIR." y explica qué dato específico falta.
- Nunca inventes una cifra, nombre, o fecha que no esté en el contexto.
- Distingue siempre HECHO (un número tal cual) de INTERPRETACIÓN (tu lectura de ese número) — nunca presentes una interpretación como si fuera un hecho.
- Responde en español, 2-4 oraciones, directo, sin relleno.
- Al final de tu respuesta, en una línea aparte, indica tu nivel de certeza: "Certeza: ALTA" (dato directo del contexto), "Certeza: MEDIA" (requiere una pequeña interpretación), o "Certeza: BAJA" (dato parcial o ambiguo).`,
      }],
    });
    const texto = respuesta.content[0]?.text || '';

    res.json({
      ok: true,
      data: {
        respuesta: texto,
        fuentes: contexto, // trazabilidad — "VER FUENTES" del frontend muestra esto tal cual
        fecha_actualizacion: contexto.fecha_del_contexto,
      },
    });
  } catch (e) {
    console.error('Error en Asistente IA de Centro de Decisiones:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar respuesta. Intenta de nuevo.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🆕 CONSTRUCTOR DE REPORTES (documento maestro, secciones 17-18) —
// selección dinámica de información + periodo + territorio +
// indicadores, con vista previa antes de generar, y guardado como
// plantilla reusable.
// ═══════════════════════════════════════════════════════════════

const esquemaConfigReporte = z.object({
  informacion: z.enum(['promovidos', 'estructura', 'incidencias']),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  municipio_id: z.number().int().optional(),
  agrupar_por: z.enum(['seccion', 'municipio', 'rol']).optional(),
});

/**
 * POST /api/centro-decisiones/reportes/vista-previa
 * Calcula el resultado según la configuración elegida — SIN
 * guardar nada. Es el "Paso 9" de la skill antes de generar de verdad.
 */
router.post('/reportes/vista-previa', requierePermisoCD('REPORTS'), async (req, res) => {
  const parseado = esquemaConfigReporte.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const c = parseado.data;
  const campanaId = req.usuario.campana_id;

  if (c.informacion === 'promovidos') {
    let sql = `SELECT ${c.agrupar_por === 'seccion' ? 's.numero as etiqueta' : c.agrupar_por === 'municipio' ? 'm.nombre as etiqueta' : "'Todos' as etiqueta"},
                 COUNT(*) as total, COUNT(*) FILTER (WHERE p.comprometido=true) as comprometidos
               FROM promovidos p LEFT JOIN secciones s ON s.id = p.seccion_id LEFT JOIN municipios m ON m.id = s.municipio_id
               WHERE p.campana_id=$1`;
    const params = [campanaId];
    if (c.fecha_inicio) { params.push(c.fecha_inicio); sql += ` AND p.creado_en >= $${params.length}`; }
    if (c.fecha_fin) { params.push(c.fecha_fin); sql += ` AND p.creado_en <= $${params.length}`; }
    if (c.municipio_id) { params.push(c.municipio_id); sql += ` AND m.id = $${params.length}`; }
    if (c.agrupar_por === 'seccion') sql += ' GROUP BY s.numero ORDER BY total DESC';
    else if (c.agrupar_por === 'municipio') sql += ' GROUP BY m.nombre ORDER BY total DESC';
    const r = await query(sql, params);
    return res.json({ ok: true, data: { filas: r.rows, total_general: r.rows.reduce((s, f) => s + parseInt(f.total), 0) } });
  }
  if (c.informacion === 'estructura') {
    const r = await query(`SELECT rol as etiqueta, COUNT(*) as total FROM usuarios WHERE campana_id=$1 AND activo != false GROUP BY rol ORDER BY total DESC`, [campanaId]);
    return res.json({ ok: true, data: { filas: r.rows, total_general: r.rows.reduce((s, f) => s + parseInt(f.total), 0) } });
  }
  if (c.informacion === 'incidencias') {
    const r = await query(`SELECT estado as etiqueta, COUNT(*) as total FROM incidencias WHERE campana_id=$1 GROUP BY estado`, [campanaId]);
    return res.json({ ok: true, data: { filas: r.rows, total_general: r.rows.reduce((s, f) => s + parseInt(f.total), 0) } });
  }
});

/** POST /api/centro-decisiones/reportes/plantillas — guardar configuración como plantilla */
router.post('/reportes/plantillas', requierePermisoCD('REPORTS'), async (req, res) => {
  const { nombre, configuracion } = req.body;
  if (!nombre || !configuracion) return res.status(400).json({ ok: false, error: 'Falta nombre o configuración' });
  const r = await query(
    `INSERT INTO plantillas_reporte (campana_id, nombre, configuracion, creado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.usuario.campana_id, nombre, JSON.stringify(configuracion), req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: r.rows[0] });
});

/** GET /api/centro-decisiones/reportes/plantillas — listar plantillas guardadas */
router.get('/reportes/plantillas', requierePermisoCD('REPORTS'), async (req, res) => {
  const r = await query(`SELECT * FROM plantillas_reporte WHERE campana_id=$1 ORDER BY creado_en DESC`, [req.usuario.campana_id]);
  res.json({ ok: true, data: r.rows });
});

export default router;

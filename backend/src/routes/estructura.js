import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
const router = Router();
router.use(requiereAuth);
const NIVELES = {
  jefe_campana: 1, coord_general: 2, coord_distrital: 3,
  coord_municipal: 4, coord_seccional: 5, promotor: 6,
};
const RANGO_SANO = {
  jefe_campana: [3, 10],
  coord_general: [3, 8],
  coord_distrital: [3, 8],
  coord_municipal: [3, 10],
  coord_seccional: [2, 15],
};

// ═══════════════════════════════════════════════════════════════
// 🔐 PERMISOS POR ROL — NUEVO
// Guarda solo las EXCEPCIONES al comportamiento default — si un
// rol/módulo no aparece en la tabla, se asume el default del
// sistema (esto lo resuelve el frontend / el middleware de rutas
// protegidas en cada módulo).
// ═══════════════════════════════════════════════════════════════
router.get('/permisos', async (req, res) => {
  const r = await query(
    'SELECT rol, modulo, permitido FROM permisos_personalizados WHERE campana_id=$1',
    [req.usuario.campana_id]
  );
  const resultado = {};
  r.rows.forEach((row) => {
    if (!resultado[row.rol]) resultado[row.rol] = {};
    resultado[row.rol][row.modulo] = row.permitido;
  });
  res.json({ ok: true, data: resultado });
});

router.put('/permisos', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden cambiar permisos' });
  }
  const { rol, modulo, permitido } = req.body;
  if (!rol || !modulo || typeof permitido !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Faltan datos (rol, modulo, permitido)' });
  }
  if (rol === 'candidato') {
    return res.status(400).json({ ok: false, error: 'El rol Candidato nunca se puede restringir — es una protección para que nadie se bloquee a sí mismo' });
  }
  await query(
    `INSERT INTO permisos_personalizados (campana_id, rol, modulo, permitido) VALUES ($1,$2,$3,$4)
     ON CONFLICT (campana_id, rol, modulo) DO UPDATE SET permitido=$4`,
    [req.usuario.campana_id, rol, modulo, permitido]
  );
  res.json({ ok: true });
});

router.delete('/permisos', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden cambiar permisos' });
  }
  const { rol, modulo } = req.body;
  if (!rol || !modulo) return res.status(400).json({ ok: false, error: 'Faltan datos (rol, modulo)' });
  await query(
    'DELETE FROM permisos_personalizados WHERE campana_id=$1 AND rol=$2 AND modulo=$3',
    [req.usuario.campana_id, rol, modulo]
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🗺️ OPCIONES DE TERRITORIO AL DAR DE ALTA — NUEVO
// Cuando se elige "Municipio" en el formulario, esto regresa la
// lista real de secciones de ese municipio (y cuántas son), para
// que se vea junto al formulario en vez de un número a ciegas.
// ═══════════════════════════════════════════════════════════════
router.get('/secciones-de-municipio/:claveMunicipio', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     WHERE s.estado_id=$1 AND m.clave_ine=$2
     ORDER BY s.numero`,
    [req.usuario.estado_id, req.params.claveMunicipio]
  );
  res.json({
    ok: true,
    data: {
      total_secciones: resultado.rows.length,
      secciones: resultado.rows.map((r) => r.numero),
    },
  });
});

/**
 * GET /api/estructura
 * Devuelve el árbol completo de la campaña, CON el semáforo de salud
 * calculado para cada coordinador (no solo el organigrama plano).
 */
router.get('/', async (req, res) => {
  const esRamaLimitada = req.usuario.rol === 'coord_seccional';
  const resultado = await query(
    esRamaLimitada
      ? `WITH RECURSIVE mi_rama AS (
           SELECT id FROM usuarios WHERE id = $2
           UNION ALL
           SELECT u.id FROM usuarios u JOIN mi_rama r ON u.parent_id = r.id
         )
         SELECT id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id,
                meta_diaria, activo, ultimo_acceso, creado_en
         FROM usuarios WHERE campana_id = $1 AND id IN (SELECT id FROM mi_rama) ORDER BY creado_en`
      : `SELECT id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id,
                meta_diaria, activo, ultimo_acceso, creado_en
         FROM usuarios WHERE campana_id = $1 ORDER BY creado_en`,
    esRamaLimitada ? [req.usuario.campana_id, req.usuario.sub] : [req.usuario.campana_id]
  );
  const usuarios = resultado.rows;
  const conteoDirectos = {};
  usuarios.forEach((u) => {
    if (u.parent_id) conteoDirectos[u.parent_id] = (conteoDirectos[u.parent_id] || 0) + 1;
  });
  const conSalud = usuarios.map((u) => {
    const directos = conteoDirectos[u.id] || 0;
    const rango = RANGO_SANO[u.rol];
    let salud = 'na';
    if (rango) {
      if (directos === 0) salud = 'vacio';
      else if (directos < rango[0]) salud = 'bajo';
      else if (directos > rango[1]) salud = 'sobrecargado';
      else salud = 'sano';
    }
    return { ...u, reportes_directos: directos, salud };
  });
  res.json({ ok: true, data: conSalud });
});

router.get('/cadena/:usuarioId', async (req, res) => {
  const cadena = [];
  let actualId = req.params.usuarioId;
  let vueltas = 0;
  while (actualId && vueltas < 10) {
    const resultado = await query(
      'SELECT id, nombre, rol, parent_id FROM usuarios WHERE id=$1 AND campana_id=$2',
      [actualId, req.usuario.campana_id]
    );
    const u = resultado.rows[0];
    if (!u) break;
    cadena.push({ id: u.id, nombre: u.nombre, rol: u.rol });
    actualId = u.parent_id;
    vueltas++;
  }
  res.json({ ok: true, data: cadena.reverse() });
});

router.get('/salud', async (req, res) => {
  const todos = await query(
    `SELECT id, rol, parent_id FROM usuarios WHERE campana_id = $1`,
    [req.usuario.campana_id]
  );
  const coordinadores = todos.rows.filter((u) => u.rol !== 'promotor');
  const conteoDirectos = {};
  todos.rows.forEach((u) => {
    if (u.parent_id) conteoDirectos[u.parent_id] = (conteoDirectos[u.parent_id] || 0) + 1;
  });
  const resumen = { sano: 0, sobrecargado: 0, bajo: 0, vacio: 0 };
  const alertas = [];
  coordinadores.forEach((u) => {
    const rango = RANGO_SANO[u.rol];
    if (!rango) return;
    const directos = conteoDirectos[u.id] || 0;
    let salud;
    if (directos === 0) salud = 'vacio';
    else if (directos < rango[0]) salud = 'bajo';
    else if (directos > rango[1]) salud = 'sobrecargado';
    else salud = 'sano';
    resumen[salud]++;
    if (salud === 'sobrecargado') alertas.push({ usuario_id: u.id, rol: u.rol, directos, mensaje: `Tiene ${directos} personas a cargo (máximo sano: ${rango[1]})` });
  });
  res.json({ ok: true, data: { resumen, alertas } });
});

const esquemaMiembro = z.object({
  nombre: z.string().min(2).max(200),
  email: z.string().email(),
  telefono: z.string().max(20).optional(),
  password: z.string().min(8),
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor', 'encargado_juridico', 'encargado_finanzas', 'voluntario']),
  puesto: z.string().max(100).optional(),
  parent_id: z.string().uuid().optional(),
  territorio_tipo: z.string().optional(),
  territorio_id: z.number().int().optional(),
  meta_diaria: z.number().int().default(0),
});

router.post('/', async (req, res) => {
  const parseado = esquemaMiembro.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;
  try {
    const existente = await query(
      'SELECT id FROM usuarios WHERE campana_id=$1 AND email=$2',
      [req.usuario.campana_id, d.email]
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe un miembro con ese correo' });
    }
    const passwordHash = await bcrypt.hash(d.password, 12);
    let parentId = d.parent_id || null;
    if (!parentId) {
      const candidatoRes = await query(
        `SELECT id FROM usuarios WHERE campana_id=$1 AND rol='candidato' LIMIT 1`,
        [req.usuario.campana_id]
      );
      parentId = candidatoRes.rows[0]?.id || null;
    }
    const resultado = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, puesto, parent_id, territorio_tipo, territorio_id, meta_diaria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, nombre, rol, puesto`,
      [req.usuario.campana_id, d.nombre, d.email, d.telefono || null, passwordHash,
       d.rol, d.puesto || null, parentId, d.territorio_tipo || null, d.territorio_id || null, d.meta_diaria]
    );
    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (e) {
    console.error('Error creando miembro:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

const esquemaEditar = z.object({
  nombre: z.string().min(2).max(200).optional(),
  telefono: z.string().max(20).optional(),
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor', 'encargado_juridico', 'encargado_finanzas', 'voluntario']).optional(),
  puesto: z.string().max(100).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  territorio_tipo: z.string().nullable().optional(),
  territorio_id: z.number().int().nullable().optional(),
  meta_diaria: z.number().int().optional(),
  activo: z.boolean().optional(),
});

router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  if (d.parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede ser su propio coordinador' });
  if ('parent_id' in d) {
    const actual = await query('SELECT parent_id FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
    if (actual.rows[0] && actual.rows[0].parent_id !== d.parent_id) {
      await query(
        `INSERT INTO estructura_historial (campana_id, usuario_id, parent_anterior, parent_nuevo, motivo, cambiado_por)
         VALUES ($1,$2,$3,$4,'Edición individual',$5)`,
        [req.usuario.campana_id, req.params.id, actual.rows[0].parent_id, d.parent_id, req.usuario.sub]
      );
    }
  }
  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) {
    campos.push(`${campo}=$${i}`);
    valores.push(valor);
    i++;
  }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING id, nombre, rol, activo`,
    valores
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  if ('rol' in d || 'activo' in d) {
    registrarAuditoria({
      campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
      accion: 'editar', tabla: 'usuarios', registroId: req.params.id,
      detalle: { cambios: d, persona_afectada: resultado.rows[0].nombre },
      ip: req.ip,
    });
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

router.post('/:id/reasignar-equipo', async (req, res) => {
  const { nuevo_parent_id } = req.body;
  if (!nuevo_parent_id) return res.status(400).json({ ok: false, error: 'Falta el nuevo coordinador destino' });
  if (nuevo_parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede reasignarse a sí mismo' });
  const hijos = await query('SELECT id FROM usuarios WHERE parent_id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (hijos.rows.length === 0) return res.json({ ok: true, movidos: 0 });
  for (const h of hijos.rows) {
    await query(
      `INSERT INTO estructura_historial (campana_id, usuario_id, parent_anterior, parent_nuevo, motivo, cambiado_por)
       VALUES ($1,$2,$3,$4,'Reasignación en bloque',$5)`,
      [req.usuario.campana_id, h.id, req.params.id, nuevo_parent_id, req.usuario.sub]
    );
  }
  await query(
    `UPDATE usuarios SET parent_id=$1 WHERE parent_id=$2 AND campana_id=$3`,
    [nuevo_parent_id, req.params.id, req.usuario.campana_id]
  );
  res.json({ ok: true, movidos: hijos.rows.length });
});

router.get('/:id/historial', async (req, res) => {
  const resultado = await query(
    `SELECT h.*, ua.nombre as nombre_anterior, un.nombre as nombre_nuevo, uc.nombre as nombre_cambiado_por
     FROM estructura_historial h
     LEFT JOIN usuarios ua ON ua.id = h.parent_anterior
     LEFT JOIN usuarios un ON un.id = h.parent_nuevo
     LEFT JOIN usuarios uc ON uc.id = h.cambiado_por
     WHERE h.usuario_id=$1 AND h.campana_id=$2 ORDER BY h.creado_en DESC`,
    [req.params.id, req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// 📊 REPORTE JERÁRQUICO DE EQUIPO — NUEVO
// Para un coordinador dado (ej. un Coordinador Municipal): cuántos
// reportes directos tiene (ej. Enlaces Seccionales), y para cada
// uno de ELLOS, cuántos promotores tiene, y para cada promotor,
// cuántos promovidos capturó — con duplicados marcados (mismo
// nombre + misma sección, sin importar quién lo capturó).
// ═══════════════════════════════════════════════════════════════
router.get('/:id/reporte-equipo', async (req, res) => {
  const coord = await query('SELECT id, nombre, rol, puesto FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!coord.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const directos = await query(
    'SELECT id, nombre, rol, puesto FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
    [req.params.id, req.usuario.campana_id]
  );

  const ramas = [];
  for (const nivelIntermedio of directos.rows) {
    const hijos = await query(
      'SELECT id, nombre, rol FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
      [nivelIntermedio.id, req.usuario.campana_id]
    );
    const detalleHijos = [];
    let totalRama = 0;
    let duplicadosRama = 0;
    for (const h of hijos.rows) {
      const conteo = await query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE dup.veces > 1) as duplicados
         FROM promovidos prom
         LEFT JOIN (
           SELECT nombre, seccion_id, COUNT(*) as veces
           FROM promovidos WHERE campana_id=$1
           GROUP BY nombre, seccion_id
         ) dup ON dup.nombre = prom.nombre AND dup.seccion_id = prom.seccion_id
         WHERE prom.campana_id=$1 AND prom.registrado_por=$2`,
        [req.usuario.campana_id, h.id]
      );
      const total = parseInt(conteo.rows[0].total);
      const dups = parseInt(conteo.rows[0].duplicados);
      totalRama += total;
      duplicadosRama += dups;
      detalleHijos.push({ id: h.id, nombre: h.nombre, rol: h.rol, total_promovidos: total, duplicados: dups });
    }
    ramas.push({
      id: nivelIntermedio.id, nombre: nivelIntermedio.nombre, rol: nivelIntermedio.rol, puesto: nivelIntermedio.puesto,
      total_personas_directas: hijos.rows.length,
      total_promovidos: totalRama,
      total_duplicados: duplicadosRama,
      personas: detalleHijos,
    });
  }

  res.json({ ok: true, data: { coordinador: coord.rows[0], ramas } });
});

router.get('/ranking/coordinadores', async (req, res) => {
  const coordinadores = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios
     WHERE campana_id=$1 AND rol != 'promotor' AND rol != 'candidato' AND activo != false`,
    [req.usuario.campana_id]
  );
  const ranking = [];
  for (const c of coordinadores.rows) {
    const rama = await query(
      `WITH RECURSIVE descendientes AS (
         SELECT id FROM usuarios WHERE id=$1
         UNION ALL
         SELECT u.id FROM usuarios u JOIN descendientes d ON u.parent_id = d.id WHERE u.campana_id=$2
       )
       SELECT id FROM descendientes`,
      [c.id, req.usuario.campana_id]
    );
    const idsRama = rama.rows.map((r) => r.id);
    const promos = await query(
      `SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2)`,
      [req.usuario.campana_id, idsRama]
    );
    ranking.push({
      id: c.id, nombre: c.nombre, rol: c.rol, puesto: c.puesto,
      personas_en_rama: idsRama.length - 1,
      promovidos_rama: parseInt(promos.rows[0].total),
    });
  }
  ranking.sort((a, b) => b.promovidos_rama - a.promovidos_rama);
  res.json({ ok: true, data: ranking });
});

const PUNTOS = {
  promovido: 10,
  comprometido: 25,
  seguimiento: 5,
  convertido: 40,
  resultado_dia_d: 50,
  incidencia: 5,
};
const NIVELES_GAMIFICACION = [
  { min: 1500, nombre: 'Leyenda', ic: '👑' },
  { min: 700, nombre: 'Estrella', ic: '🏆' },
  { min: 300, nombre: 'Líder', ic: '⭐' },
  { min: 100, nombre: 'Activo', ic: '🤝' },
  { min: 0, nombre: 'Novato', ic: '🌱' },
];
function calcularNivel(puntos) {
  return NIVELES_GAMIFICACION.find((n) => puntos >= n.min);
}
router.get('/gamificacion', async (req, res) => {
  const personas = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios WHERE campana_id=$1 AND activo != false AND rol NOT IN ('candidato')`,
    [req.usuario.campana_id]
  );
  const [promovidosPorPersona, comprometidosPorPersona, seguimientosPorPersona, convertidosPorPersona, resultadosPorPersona, incidenciasPorPersona] = await Promise.all([
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido=true GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, SUM(veces_contactado) as total FROM promovidos WHERE campana_id=$1 AND veces_contactado > 0 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND clasificacion='base' AND veces_contactado > 0 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT capturado_por as id, COUNT(*) as total FROM resultados_casilla WHERE campana_id=$1 GROUP BY capturado_por`, [req.usuario.campana_id]),
    query(`SELECT reportado_por as id, COUNT(*) as total FROM incidencias WHERE campana_id=$1 GROUP BY reportado_por`, [req.usuario.campana_id]),
  ]);
  const mapa = (rows) => Object.fromEntries(rows.map((r) => [r.id, parseInt(r.total) || 0]));
  const mProm = mapa(promovidosPorPersona.rows), mComp = mapa(comprometidosPorPersona.rows),
        mSeg = mapa(seguimientosPorPersona.rows), mConv = mapa(convertidosPorPersona.rows),
        mRes = mapa(resultadosPorPersona.rows), mInc = mapa(incidenciasPorPersona.rows);
  const ranking = personas.rows.map((p) => {
    const desglose = {
      promovidos: (mProm[p.id] || 0) * PUNTOS.promovido,
      comprometidos: (mComp[p.id] || 0) * PUNTOS.comprometido,
      seguimientos: (mSeg[p.id] || 0) * PUNTOS.seguimiento,
      convertidos: (mConv[p.id] || 0) * PUNTOS.convertido,
      dia_d: (mRes[p.id] || 0) * PUNTOS.resultado_dia_d,
      incidencias: (mInc[p.id] || 0) * PUNTOS.incidencia,
    };
    const puntos = Object.values(desglose).reduce((a, b) => a + b, 0);
    return { id: p.id, nombre: p.nombre, rol: p.rol, puesto: p.puesto, puntos, nivel: calcularNivel(puntos), desglose };
  });
  ranking.sort((a, b) => b.puntos - a.puntos);
  ranking.forEach((r, i) => { r.posicion = i + 1; });
  res.json({ ok: true, data: ranking });
});

router.get('/alertas/rama-dormida', async (req, res) => {
  const coordinadores = await query(
    `SELECT id, nombre, puesto FROM usuarios WHERE campana_id=$1 AND rol != 'promotor' AND rol != 'candidato' AND activo != false`,
    [req.usuario.campana_id]
  );
  const alertas = [];
  for (const c of coordinadores.rows) {
    const rama = await query(
      `WITH RECURSIVE descendientes AS (
         SELECT id FROM usuarios WHERE id=$1
         UNION ALL
         SELECT u.id FROM usuarios u JOIN descendientes d ON u.parent_id = d.id WHERE u.campana_id=$2
       )
       SELECT id FROM descendientes`,
      [c.id, req.usuario.campana_id]
    );
    const idsRama = rama.rows.map((r) => r.id);
    if (idsRama.length <= 1) continue;
    const actividad = await query(
      `SELECT COUNT(*) as total FROM promovidos
       WHERE campana_id=$1 AND registrado_por = ANY($2) AND creado_en > now() - interval '14 days'`,
      [req.usuario.campana_id, idsRama]
    );
    if (parseInt(actividad.rows[0].total) === 0) {
      alertas.push({ id: c.id, nombre: c.nombre, puesto: c.puesto, personas_en_rama: idsRama.length - 1 });
    }
  }
  res.json({ ok: true, data: alertas });
});

router.get('/vacantes/catalogo', async (req, res) => {
  const CATALOGO = [
    'Secretario Particular', 'Coordinador General de Campaña', 'Coordinador Jurídico', 'Coordinador Territorial', 'Coordinador Político', 'Coordinador de Comunicación', 'Coordinador de Finanzas',
    'Coordinador de Jóvenes', 'Coordinador de Mujeres', 'Coordinador Empresarial', 'Coordinador de Adultos Mayores', 'Coordinador de Colonias', 'Coordinador de Transporte y Logística', 'Coordinador de Eventos',
  ];
  const ocupados = await query(`SELECT DISTINCT puesto FROM usuarios WHERE campana_id=$1 AND puesto IS NOT NULL AND activo != false`, [req.usuario.campana_id]);
  const puestosOcupados = new Set(ocupados.rows.map((r) => r.puesto));
  const vacantes = CATALOGO.filter((p) => !puestosOcupados.has(p));
  res.json({ ok: true, data: vacantes });
});

router.get('/:id/zonas', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero FROM zonas_asignadas z JOIN secciones s ON s.id = z.seccion_id
     WHERE z.campana_id=$1 AND z.usuario_id=$2 ORDER BY s.numero`,
    [req.usuario.campana_id, req.params.id]
  );
  res.json({ ok: true, data: resultado.rows.map((r) => r.numero) });
});

router.get('/:id/rendimiento-rama', async (req, res) => {
  const rama = await query(
    `WITH RECURSIVE descendientes AS (
       SELECT id, nombre, rol, puesto FROM usuarios WHERE id=$1 AND campana_id=$2
       UNION ALL
       SELECT u.id, u.nombre, u.rol, u.puesto FROM usuarios u
       JOIN descendientes d ON u.parent_id = d.id
       WHERE u.campana_id=$2
     )
     SELECT id, nombre, rol, puesto FROM descendientes`,
    [req.params.id, req.usuario.campana_id]
  );
  const idsRama = rama.rows.map((r) => r.id);
  if (idsRama.length === 0) return res.status(404).json({ ok: false, error: 'No encontrado' });
  const idsSinRaiz = idsRama.slice(1);
  const promosRes = await query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2)`,
    [req.usuario.campana_id, idsRama]
  );
  const porNivel = {};
  rama.rows.slice(1).forEach((r) => { porNivel[r.rol] = (porNivel[r.rol] || 0) + 1; });
  const mejorRes = await query(
    `SELECT u.id, u.nombre, u.puesto, COUNT(p.id) as total_promovidos
     FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
     WHERE u.id = ANY($2) AND u.rol='promotor'
     GROUP BY u.id, u.nombre, u.puesto ORDER BY total_promovidos DESC LIMIT 1`,
    [req.usuario.campana_id, idsRama]
  );
  res.json({
    ok: true,
    data: {
      total_personas_en_rama: idsSinRaiz.length,
      total_promovidos_rama: parseInt(promosRes.rows[0].total),
      total_comprometidos_rama: parseInt(promosRes.rows[0].comprometidos),
      desglose_por_nivel: porNivel,
      mejor_promotor: mejorRes.rows[0] || null,
    },
  });
});

router.get('/representantes-ine', async (req, res) => {
  const resultado = await query(
    `SELECT a.id, a.nombre_rep, a.telefono_rep, a.estado, a.fecha_ini, a.fecha_vence, a.notas,
            s.numero as seccion_numero
     FROM activos a LEFT JOIN secciones s ON s.id = a.seccion_id
     WHERE a.campana_id=$1 AND a.tipo='ine_representante'
     ORDER BY s.numero`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/cobertura-casillas', async (req, res) => {
  // Antes esto SIEMPRE traía las 634 secciones del estado completo,
  // sin importar que la campaña fuera municipal — un candidato a
  // Presidente Municipal veía casillas de municipios que ni siquiera
  // le corresponden. Ahora se recorta al territorio real de SU
  // campaña, igual que ya se hace en el Mapa y en Priorización.
  const campana = await query('SELECT territorio_tipo, territorio_id FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const { territorio_tipo, territorio_id } = campana.rows[0] || {};

  let filtroTerritorio = '';
  const params = [req.usuario.estado_id];
  if (territorio_tipo === 'municipio' && territorio_id) {
    filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2)`;
    params.push(territorio_id);
  } else if (territorio_tipo === 'distrito_local' && territorio_id) {
    filtroTerritorio = 'AND s.distrito_local = $2';
    params.push(territorio_id);
  } else if (territorio_tipo === 'distrito_federal' && territorio_id) {
    filtroTerritorio = 'AND s.distrito_federal = $2';
    params.push(territorio_id);
  } else if (territorio_tipo === 'seccion' && territorio_id) {
    filtroTerritorio = 'AND s.numero = $2';
    params.push(territorio_id);
  }
  // territorio_tipo 'estatal' (Gobernador/Senador) o sin definir —
  // no se agrega filtro, sí les corresponde ver todo el estado.

  const oficiales = await query(
    `SELECT co.id, co.seccion_id, co.tipo, co.electores_estimados, s.numero as seccion_numero
     FROM casillas_oficiales co JOIN secciones s ON s.id = co.seccion_id
     WHERE s.estado_id=$1 ${filtroTerritorio} ORDER BY s.numero, co.tipo`,
    params
  );
  const asignadas = await query(
    `SELECT seccion_id, numero, representante_id FROM casillas WHERE campana_id=$1`,
    [req.usuario.campana_id]
  );
  const seccionesConRepresentante = new Set(
    asignadas.rows.filter((a) => a.representante_id).map((a) => a.seccion_id)
  );
  const conteoAsignadasPorSeccion = {};
  asignadas.rows.forEach((a) => {
    if (a.representante_id) conteoAsignadasPorSeccion[a.seccion_id] = (conteoAsignadasPorSeccion[a.seccion_id] || 0) + 1;
  });
  const porSeccion = {};
  oficiales.rows.forEach((o) => {
    if (!porSeccion[o.seccion_id]) porSeccion[o.seccion_id] = { seccion_id: o.seccion_id, seccion_numero: o.seccion_numero, casillas_oficiales: [], cubiertas: 0 };
    porSeccion[o.seccion_id].casillas_oficiales.push({ id: o.id, tipo: o.tipo, electores_estimados: o.electores_estimados });
  });
  Object.values(porSeccion).forEach((s) => {
    s.total_oficiales = s.casillas_oficiales.length;
    s.cubiertas = Math.min(conteoAsignadasPorSeccion[s.seccion_id] || 0, s.total_oficiales);
    s.completa = s.cubiertas >= s.total_oficiales;
  });
  const lista = Object.values(porSeccion).sort((a, b) => a.seccion_numero - b.seccion_numero);
  const incompletas = lista.filter((s) => !s.completa);
  res.json({
    ok: true,
    data: {
      total_secciones: lista.length,
      secciones_completas: lista.length - incompletas.length,
      secciones_incompletas: incompletas.length,
      total_casillas_oficiales: oficiales.rows.length,
      total_casillas_cubiertas: lista.reduce((s, x) => s + x.cubiertas, 0),
      detalle: lista,
    },
  });
});

const esquemaCasillaOficial = z.object({
  seccion_numero: z.number().int(),
  tipo: z.string().min(2).max(20),
  electores_estimados: z.number().int().positive().optional(),
});

router.post('/casillas-oficiales', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden ajustar la base de casillas' });
  }
  const parseado = esquemaCasillaOficial.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const seccion = await query('SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2', [req.usuario.estado_id, d.seccion_numero]);
  if (!seccion.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
  const resultado = await query(
    `INSERT INTO casillas_oficiales (seccion_id, tipo, electores_estimados) VALUES ($1,$2,$3) RETURNING *`,
    [seccion.rows[0].id, d.tipo, d.electores_estimados || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.delete('/casillas-oficiales/:id', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden ajustar la base de casillas' });
  }
  await query('DELETE FROM casillas_oficiales WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

const PORCENTAJE_META_PERSONAL = 0.08;
router.get('/sugerir-meta', async (req, res) => {
  const { territorio_tipo, territorio_id } = req.query;
  if (!territorio_tipo || !territorio_id) return res.json({ ok: true, data: null });
  let listaNominal = 0;
  if (territorio_tipo === 'seccion') {
    const r = await query('SELECT lista_nominal FROM secciones WHERE estado_id=$1 AND numero=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = r.rows[0]?.lista_nominal || 0;
  } else if (territorio_tipo === 'municipio') {
    const r = await query(
      `SELECT SUM(s.lista_nominal) as total FROM secciones s
       JOIN municipios m ON m.id = s.municipio_id
       WHERE s.estado_id=$1 AND m.clave_ine=$2`,
      [req.usuario.estado_id, territorio_id]
    );
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  } else if (territorio_tipo === 'distrito_local') {
    const r = await query('SELECT SUM(lista_nominal) as total FROM secciones WHERE estado_id=$1 AND distrito_local=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  } else if (territorio_tipo === 'distrito_federal') {
    const r = await query('SELECT SUM(lista_nominal) as total FROM secciones WHERE estado_id=$1 AND distrito_federal=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  }
  const campana = await query('SELECT fecha_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const fechaEleccion = campana.rows[0]?.fecha_eleccion;
  const diasRestantes = fechaEleccion ? Math.max(1, Math.ceil((new Date(fechaEleccion) - new Date()) / 86400000)) : 180;
  const metaTotal = Math.round(listaNominal * PORCENTAJE_META_PERSONAL);
  const metaDiaria = Math.max(1, Math.round(metaTotal / diasRestantes));
  res.json({ ok: true, data: { lista_nominal: listaNominal, meta_total_sugerida: metaTotal, dias_restantes: diasRestantes, meta_diaria_sugerida: metaDiaria } });
});

// ═══════════════════════════════════════════════════════════════
// 🔁 DUPLICADOS — CUÁNTAS PERSONAS DISTINTAS REGISTRAN AL MISMO
// PROMOVIDO — NUEVO
// Mismo criterio de duplicado que ya usa el sistema: mismo nombre +
// misma sección. Aquí se agrega el ángulo que faltaba: no solo
// "cuántas veces se intentó", sino CUÁNTAS PERSONAS DISTINTAS lo
// intentaron — útil para ver de un vistazo si varios promotores
// están trabajando la misma calle sin saberlo.
// ═══════════════════════════════════════════════════════════════
router.get('/duplicados', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero as seccion_numero, prom.nombre,
            COUNT(*) as veces_registrado,
            COUNT(DISTINCT prom.registrado_por) as personas_distintas,
            array_agg(DISTINCT u.nombre) as registrado_por_nombres
     FROM promovidos prom
     JOIN secciones s ON s.id = prom.seccion_id
     LEFT JOIN usuarios u ON u.id = prom.registrado_por
     WHERE prom.campana_id=$1
     GROUP BY s.numero, prom.nombre
     HAVING COUNT(*) > 1
     ORDER BY personas_distintas DESC, veces_registrado DESC
     LIMIT 200`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

export default router;

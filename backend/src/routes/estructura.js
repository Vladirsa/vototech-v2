import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { MODULOS_POR_ROL, TODOS_LOS_MODULOS, invalidarCachePermisos } from '../middleware/permisos.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(requiereAuth);

const NIVELES = {
  jefe_campana: 1, coord_general: 2, coord_distrital: 3,
  coord_municipal: 4, coord_seccional: 5, promotor: 6,
};

// Rangos SANOS de número de reportes directos por nivel — la ciencia de
// organización dice: un coordinador con demasiada gente a cargo no puede
// darles seguimiento real; uno con muy poca está desperdiciado.
const RANGO_SANO = {
  jefe_campana: [3, 10],
  coord_general: [3, 8],
  coord_distrital: [3, 8],
  coord_municipal: [3, 10],
  coord_seccional: [2, 15],
};

/**
 * GET /api/estructura
 * Devuelve el árbol completo de la campaña, CON el semáforo de salud
 * calculado para cada coordinador (no solo el organigrama plano).
 */
router.get('/', async (req, res) => {
  // Un coord_seccional SOLO ve su propia rama (él mismo + toda su
  // cadena hacia abajo) — no toda la campaña. El resto de los roles
  // de mando (candidato, jefe, coord_general/distrital/municipal)
  // siguen viendo todo, porque su trabajo es supervisar más allá de
  // una sola rama.
  // Solo candidato/jefe_campana/coord_general ven la campaña
  // completa — absolutamente cualquier otro rol (todos los niveles
  // de la cadena territorial, jurídico, finanzas, voluntarios) solo
  // ve su propia rama hacia abajo. Esto es central al diseño: cada
  // nivel jerárquico existe precisamente para NO tener que ver más
  // de lo que le toca.
  const ROLES_SIN_RESTRICCION = ['candidato', 'jefe_campana', 'coord_general'];
  const esRamaLimitada = !ROLES_SIN_RESTRICCION.includes(req.usuario.rol);

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

  // Contar reportes directos de cada uno
  const conteoDirectos = {};
  usuarios.forEach((u) => {
    if (u.parent_id) conteoDirectos[u.parent_id] = (conteoDirectos[u.parent_id] || 0) + 1;
  });

  // Calcular semáforo de salud para cada coordinador
  const conSalud = usuarios.map((u) => {
    const directos = conteoDirectos[u.id] || 0;
    const rango = RANGO_SANO[u.rol];
    let salud = 'na'; // promotores no coordinan a nadie, no aplica
    if (rango) {
      if (directos === 0) salud = 'vacio';           // no tiene a nadie a cargo todavía
      else if (directos < rango[0]) salud = 'bajo';   // subutilizado
      else if (directos > rango[1]) salud = 'sobrecargado'; // demasiada gente, riesgo de fallar
      else salud = 'sano';
    }
    return { ...u, reportes_directos: directos, salud };
  });

  res.json({ ok: true, data: conSalud });
});

/**
 * GET /api/estructura/salud
 * Resumen ejecutivo: cuántos coordinadores están sobrecargados,
 * subutilizados, o sanos — para mostrar en el Dashboard.
 */
/**
 * GET /api/estructura/cadena/:usuarioId
 * Sube por la jerarquía desde un usuario hasta el Jefe de Campaña,
 * mostrando exactamente quién invitó a quién — la "genealogía" de
 * cómo llegó cada persona al equipo.
 */
router.get('/cadena/:usuarioId', async (req, res) => {
  const cadena = [];
  let actualId = req.params.usuarioId;
  let vueltas = 0; // protección contra ciclos accidentales

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

  res.json({ ok: true, data: cadena.reverse() }); // del más alto al más nuevo
});

router.get('/salud', async (req, res) => {
  // IMPORTANTE: traer TODOS los usuarios (incluidos promotores), porque
  // aunque los promotores no coordinan a nadie, sí son los "hijos" que
  // hacen que un coordinador cuente como sobrecargado o no.
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
  nombre: z.string({ required_error: 'Falta el nombre' }).min(2, 'El nombre es muy corto').max(200),
  email: z.string({ required_error: 'Falta el correo electrónico' }).email('El correo no es válido'),
  telefono: z.string().max(20).optional(),
  password: z.string({ required_error: 'Falta la contraseña' }).min(8, 'La contraseña debe tener al menos 8 caracteres'),
  rol: z.enum([
    'jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor',
    'encargado_juridico', 'encargado_finanzas', 'voluntario',
    // Cadena jerárquica territorial nueva — más granular que los
    // coord_* de arriba, para campañas que necesitan el detalle
    // completo de distrito federal → local → municipio → sección.
    'coordinador_territorial', 'coordinador_politico',
    'enlace_distrital_federal', 'enlace_distrital_local', 'enlace_municipal',
    'enlace_jovenes', 'enlace_mujeres', 'enlace_brigadas', 'enlace_activos', 'enlace_seccional',
  ], { required_error: 'Falta elegir el rol de esta persona' }),
  puesto: z.string().max(100).optional(),
  parent_id: z.string().uuid().optional(),
  territorio_tipo: z.string().optional(),
  territorio_id: z.number().int().optional(),
  meta_diaria: z.number().int().default(0),
});

/**
 * POST /api/estructura
 * Agregar un nuevo miembro directamente (alternativa a los códigos
 * de invitación — para cuando el Jefe de Campaña quiere dar de alta
 * a alguien él mismo, sin esperar a que la persona se registre sola).
 */
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

    // Validar que el territorio asignado exista de verdad — antes se
    // podía escribir cualquier número de sección/distrito/municipio,
    // y esa persona quedaba "asignada" a un territorio fantasma que
    // nunca aparecería en el mapa ni en los reportes de cobertura.
    if (d.territorio_tipo && d.territorio_id) {
      let existeTerritorio = false;
      if (d.territorio_tipo === 'seccion') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND numero=$2', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'distrito_local') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND distrito_local=$2 LIMIT 1', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'distrito_federal') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND distrito_federal=$2 LIMIT 1', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'municipio') {
        const r = await query('SELECT 1 FROM municipios WHERE estado_id=$1 AND clave_ine=$2', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else {
        existeTerritorio = true; // tipo de territorio no reconocido, no bloqueamos por si acaso
      }
      if (!existeTerritorio) {
        return res.status(400).json({ ok: false, error: `No existe ${d.territorio_tipo.replace('_', ' ')} número ${d.territorio_id} — revisa el número.` });
      }
    }

    // Si no se especifica jefe directo, cuelga del CANDIDATO real (no
    // se deja huérfano) — así el organigrama siempre tiene una sola
    // raíz de verdad, no varias "islas" paralelas.
    let parentId = d.parent_id || null;
    if (!parentId) {
      const candidatoRes = await query(
        `SELECT id FROM usuarios WHERE campana_id=$1 AND rol='candidato' LIMIT 1`,
        [req.usuario.campana_id]
      );
      parentId = candidatoRes.rows[0]?.id || null;
    }

    // Aprobación en cascada: candidato/jefe/coord.general son mando
    // de máxima confianza, sus altas quedan aprobadas directo. Todo
    // lo demás nace PENDIENTE — necesita el visto bueno de su jefe
    // directo (o del candidato específicamente, si es un Enlace
    // Distrital Federal — ese nivel siempre lo aprueba el candidato
    // en persona, es la puerta de entrada a controlar todo un distrito).
    const rolesConfianzaTotal = ['candidato', 'jefe_campana', 'coord_general'];
    const aprobadoDeEntrada = rolesConfianzaTotal.includes(req.usuario.rol);

    // Antes se podía asignar territorio que no existe (ej. sección
    // 99999) sin ningún aviso — esa persona quedaba "asignada" a la
    // nada, invisible en mapas y reportes de cobertura sin que nadie
    // se diera cuenta del error de dedo.
    if (d.territorio_id && d.territorio_tipo) {
      let existeTerritorio = false;
      if (d.territorio_tipo === 'seccion') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND numero=$2', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'municipio') {
        const r = await query('SELECT 1 FROM municipios WHERE estado_id=$1 AND clave_ine=$2', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'distrito_local') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND distrito_local=$2 LIMIT 1', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else if (d.territorio_tipo === 'distrito_federal') {
        const r = await query('SELECT 1 FROM secciones WHERE estado_id=$1 AND distrito_federal=$2 LIMIT 1', [req.usuario.estado_id, d.territorio_id]);
        existeTerritorio = r.rows.length > 0;
      } else {
        existeTerritorio = true; // tipo desconocido — no se bloquea, pero tampoco se inventa una regla
      }
      if (!existeTerritorio) {
        return res.status(400).json({ ok: false, error: `${d.territorio_tipo === 'seccion' ? 'La sección' : d.territorio_tipo === 'municipio' ? 'El municipio' : 'El distrito'} ${d.territorio_id} no existe en el catálogo oficial — revisa el número.` });
      }
    }

    const resultado = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, puesto, parent_id, territorio_tipo, territorio_id, meta_diaria, aprobado, aprobado_por, aprobado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, nombre, rol, puesto, aprobado`,
      [req.usuario.campana_id, d.nombre, d.email, d.telefono || null, passwordHash,
       d.rol, d.puesto || null, parentId, d.territorio_tipo || null, d.territorio_id || null, d.meta_diaria,
       aprobadoDeEntrada, aprobadoDeEntrada ? req.usuario.sub : null, aprobadoDeEntrada ? new Date() : null]
    );

    res.status(201).json({
      ok: true, data: resultado.rows[0],
      mensaje: aprobadoDeEntrada ? undefined : 'Se creó, pero queda PENDIENTE hasta que su jefe directo lo apruebe.',
    });
  } catch (e) {
    console.error('Error creando miembro:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

const esquemaEditar = z.object({
  nombre: z.string().min(2).max(200).optional(),
  telefono: z.string().max(20).optional(),
  rol: z.enum([
    'jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor',
    'encargado_juridico', 'encargado_finanzas', 'voluntario',
    'coordinador_territorial', 'coordinador_politico',
    'enlace_distrital_federal', 'enlace_distrital_local', 'enlace_municipal',
    'enlace_jovenes', 'enlace_mujeres', 'enlace_brigadas', 'enlace_activos', 'enlace_seccional',
  ]).optional(),
  puesto: z.string().max(100).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  territorio_tipo: z.string().nullable().optional(),
  territorio_id: z.number().int().nullable().optional(),
  meta_diaria: z.number().int().optional(),
  activo: z.boolean().optional(),
});

/**
 * PATCH /api/estructura/:id
 * Corregir un error (rol equivocado, coordinador mal asignado) o
 * dar de baja a alguien sin tener que borrar su historial de trabajo.
 */
router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  if (d.parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede ser su propio coordinador' });

  // Si cambia de jefe, se registra en el historial ANTES de aplicar el
  // cambio — para saber de dónde a dónde se movió, no solo a dónde.
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

  // Cambiar el ROL o dar de baja/alta a alguien es sensible — afecta
  // directamente a qué puede ver y hacer esa persona en el sistema.
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

/**
 * POST /api/estructura/:id/reasignar-equipo
 * Mueve a TODO el equipo directo de una persona hacia otro
 * coordinador de un solo golpe — para cuando alguien se sale y no
 * hay que reasignar uno por uno.
 */
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

/**
 * GET /api/estructura/:id/historial
 * Quién movió a esta persona, de dónde a dónde, y cuándo.
 */
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

/**
 * GET /api/estructura/ranking
 * Compara el rendimiento de RAMA COMPLETA entre coordinadores del
 * mismo nivel — quién de los "Coordinador de Jóvenes", "de Mujeres",
 * etc. está rindiendo más.
 */
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

/**
 * GET /api/estructura/gamificacion
 * Ranking de TODO el equipo (no solo coordinadores) con puntos por
 * actividad real y niveles — para motivar con reconocimiento
 * público, como hacen los sistemas de campaña más maduros del
 * mercado. Los puntos se calculan de la actividad que ya existe en
 * el sistema, no de una tabla aparte que alguien tenga que llenar.
 */
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

/**
 * GET /api/estructura/alertas-rama
 * Ramas COMPLETAS dormidas — no solo un coordinador inactivo, sino
 * cuando NADIE en toda su cadena hacia abajo ha hecho nada en 14 días.
 */
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
    if (idsRama.length <= 1) continue; // sin equipo, no aplica

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

/**
 * GET /api/estructura/vacantes
 * Qué puestos del catálogo típico de campaña todavía no tienen a
 * nadie asignado — huecos visibles del equipo.
 */
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

/**
 * GET /api/estructura/:id/zonas
 * Qué secciones tiene asignadas esta persona (de la Sectorización
 * del mapa) — para que se vea aquí también, no solo en el mapa.
 */
router.get('/:id/zonas', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero FROM zonas_asignadas z JOIN secciones s ON s.id = z.seccion_id
     WHERE z.campana_id=$1 AND z.usuario_id=$2 ORDER BY s.numero`,
    [req.usuario.campana_id, req.params.id]
  );
  res.json({ ok: true, data: resultado.rows.map((r) => r.numero) });
});

/**
 * GET /api/estructura/:id/rendimiento-rama
 * El impacto real de TODA la cadena hacia abajo de esta persona —
 * no solo su gente directa, sino hijos, nietos, bisnietos... El
 * semáforo normal solo ve un nivel; esto mide la rama completa.
 */
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

  const idsSinRaiz = idsRama.slice(1); // todos menos la persona misma

  const promosRes = await query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2)`,
    [req.usuario.campana_id, idsRama] // incluye lo que la propia persona haya registrado
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

/**
 * GET /api/estructura/representantes-ine
 * Los representantes ante el INE viven técnicamente en Activos (por
 * su fecha de vigencia, igual que una barda o espectacular), pero
 * son PARTE de tu estructura humana — aquí se ven en el contexto
 * correcto, junto al resto de tu gente.
 */
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

/**
 * ── CASILLAS OFICIALES ──
 * Base de referencia de cuántas casillas debería haber por sección
 * (estimada con la regla de 750 electores por casilla) — pero se
 * puede corregir a mano, porque el INE a veces decide distinto
 * (casillas especiales, extraordinarias, ajustes de última hora).
 */

/**
 * GET /api/estructura/cobertura-casillas
 * El apartado completo: por cada sección, cuántas casillas debería
 * tener vs. cuántas ya tiene representante asignado por TU campaña
 * — con alerta clara de dónde faltan representantes por cubrir.
 */
router.get('/cobertura-casillas', async (req, res) => {
  const oficiales = await query(
    `SELECT co.id, co.seccion_id, co.tipo, co.electores_estimados, s.numero as seccion_numero
     FROM casillas_oficiales co JOIN secciones s ON s.id = co.seccion_id
     WHERE s.estado_id=$1 ORDER BY s.numero, co.tipo`,
    [req.usuario.estado_id]
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

/**
 * POST /api/estructura/casillas-oficiales
 * Agregar una casilla que el estimado automático no contempló (el
 * INE decidió una especial, extraordinaria, o ajustó el número real).
 */
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

/**
 * DELETE /api/estructura/casillas-oficiales/:id
 * Quitar una que el estimado generó de más (por ejemplo, si el INE
 * de verdad no abrió esa contigua porque la lista nominal bajó).
 */
router.delete('/casillas-oficiales/:id', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden ajustar la base de casillas' });
  }
  await query('DELETE FROM casillas_oficiales WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/**
 * GET /api/estructura/sugerir-meta?territorio_tipo=X&territorio_id=Y
 * Meta diaria sugerida según el tamaño real del territorio asignado
 * — no un número al azar. Se calcula: 8% de la lista nominal de su
 * territorio (una meta realista de contacto personal, no todo el
 * padrón) entre los días que faltan para la elección. Es una
 * SUGERENCIA — se puede editar a mano en el formulario.
 */
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

/**
 * GET /api/estructura/pendientes-aprobacion
 * Quién está esperando el visto bueno de ESTA persona específica —
 * ya sea porque es su jefe directo, o porque es candidato/jefe de
 * campaña y hay un Enlace Distrital Federal esperando (ese nivel
 * SIEMPRE lo aprueba el candidato en persona, sin importar quién
 * más esté arriba en la cadena).
 */
router.get('/pendientes-aprobacion', async (req, res) => {
  const esCandidatoOJefe = ['candidato', 'jefe_campana'].includes(req.usuario.rol);

  const resultado = await query(
    `SELECT id, nombre, rol, puesto, territorio_tipo, territorio_id, creado_en
     FROM usuarios
     WHERE campana_id=$1 AND aprobado=false
       AND (parent_id=$2 ${esCandidatoOJefe ? "OR rol='enlace_distrital_federal'" : ''})
     ORDER BY creado_en`,
    [req.usuario.campana_id, req.usuario.sub]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * PATCH /api/estructura/:id/aprobar
 * Solo puede aprobar: el jefe directo (parent_id) de esa persona, o
 * candidato/jefe_campana cuando es un Enlace Distrital Federal (ese
 * nivel es la puerta de entrada a controlar todo un distrito, así
 * que siempre pasa por el candidato, sin excepción).
 */
router.patch('/:id/aprobar', async (req, res) => {
  const persona = await query('SELECT parent_id, rol FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!persona.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const esSuJefeDirecto = persona.rows[0].parent_id === req.usuario.sub;
  const esCandidatoAprobandoEnlaceFederal = ['candidato', 'jefe_campana'].includes(req.usuario.rol) && persona.rows[0].rol === 'enlace_distrital_federal';

  if (!esSuJefeDirecto && !esCandidatoAprobandoEnlaceFederal) {
    return res.status(403).json({ ok: false, error: 'Solo su jefe directo (o el candidato, si es Enlace Distrital Federal) puede aprobar esta alta.' });
  }

  await query('UPDATE usuarios SET aprobado=true, aprobado_por=$1, aprobado_en=now() WHERE id=$2', [req.usuario.sub, req.params.id]);
  res.json({ ok: true, mensaje: 'Aprobado — ya puede iniciar sesión.' });
});

/**
 * DELETE /api/estructura/:id/rechazar
 * Rechazar una alta pendiente — la borra directo (nunca llegó a
 * activarse, no tiene caso dejarla "desactivada" estorbando).
 */
router.delete('/:id/rechazar', async (req, res) => {
  const persona = await query('SELECT parent_id, rol, aprobado FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!persona.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  if (persona.rows[0].aprobado) return res.status(400).json({ ok: false, error: 'Ya está aprobado — para quitarlo usa desactivar, no rechazar.' });

  const esSuJefeDirecto = persona.rows[0].parent_id === req.usuario.sub;
  const esCandidatoRechazandoEnlaceFederal = ['candidato', 'jefe_campana'].includes(req.usuario.rol) && persona.rows[0].rol === 'enlace_distrital_federal';
  if (!esSuJefeDirecto && !esCandidatoRechazandoEnlaceFederal) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para rechazar esta alta.' });
  }

  await query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/**
 * Solo candidato/jefe_campana/coord_general pueden tocar los
 * permisos de los demás roles — tiene sentido, es literalmente
 * decidir quién puede ver qué en toda la campaña.
 */
function esMandoMaximo(req) {
  return ['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol);
}

/**
 * GET /api/estructura/permisos
 * La matriz completa: cada rol, cada módulo, si está permitido (por
 * default o por excepción personalizada), y si fue personalizado —
 * para que el panel pueda mostrar claramente "esto lo cambiaste tú".
 */
router.get('/permisos', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'Solo candidato, jefe de campaña, o coordinador general pueden ver esto.' });

  const excepciones = await query('SELECT rol, modulo, permitido FROM permisos_personalizados WHERE campana_id=$1', [req.usuario.campana_id]);
  const mapaExcepciones = {};
  excepciones.rows.forEach((e) => {
    if (!mapaExcepciones[e.rol]) mapaExcepciones[e.rol] = {};
    mapaExcepciones[e.rol][e.modulo] = e.permitido;
  });

  const roles = Object.keys(MODULOS_POR_ROL);
  const matriz = roles.map((rol) => ({
    rol,
    modulos: TODOS_LOS_MODULOS.map((modulo) => {
      const personalizado = mapaExcepciones[rol]?.[modulo];
      return {
        modulo,
        permitido: personalizado !== undefined ? personalizado : MODULOS_POR_ROL[rol].includes(modulo),
        esPersonalizado: personalizado !== undefined,
        default: MODULOS_POR_ROL[rol].includes(modulo),
      };
    }),
  }));

  res.json({ ok: true, data: matriz });
});

/**
 * PUT /api/estructura/permisos
 * Body: { rol, modulo, permitido }
 * Guarda (o actualiza) una excepción sobre el default.
 */
router.put('/permisos', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'Solo candidato, jefe de campaña, o coordinador general pueden cambiar esto.' });

  const { rol, modulo, permitido } = req.body;
  if (!rol || !modulo || typeof permitido !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Faltan datos (rol, modulo, permitido)' });
  }
  if (!TODOS_LOS_MODULOS.includes(modulo)) {
    return res.status(400).json({ ok: false, error: `"${modulo}" no es un módulo válido` });
  }
  // Nunca dejar que alguien se quite (o le quiten) el acceso total al
  // candidato — sería fácil quedar bloqueado del propio sistema sin
  // querer.
  if (rol === 'candidato') {
    return res.status(400).json({ ok: false, error: 'El rol de Candidato no se puede restringir — es la cuenta dueña de la campaña.' });
  }

  await query(
    `INSERT INTO permisos_personalizados (campana_id, rol, modulo, permitido, actualizado_por)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (campana_id, rol, modulo) DO UPDATE SET permitido=$4, actualizado_por=$5, actualizado_en=now()`,
    [req.usuario.campana_id, rol, modulo, permitido, req.usuario.sub]
  );
  invalidarCachePermisos(req.usuario.campana_id);

  res.json({ ok: true, mensaje: `${modulo} ${permitido ? 'habilitado' : 'deshabilitado'} para ${rol}` });
});

/**
 * DELETE /api/estructura/permisos/:rol/:modulo
 * Quita la excepción — regresa al comportamiento default de fábrica.
 */
router.delete('/permisos/:rol/:modulo', async (req, res) => {
  if (!esMandoMaximo(req)) return res.status(403).json({ ok: false, error: 'Solo candidato, jefe de campaña, o coordinador general pueden cambiar esto.' });

  await query('DELETE FROM permisos_personalizados WHERE campana_id=$1 AND rol=$2 AND modulo=$3', [req.usuario.campana_id, req.params.rol, req.params.modulo]);
  invalidarCachePermisos(req.usuario.campana_id);

  res.json({ ok: true, mensaje: 'Regresado al comportamiento por default' });
});

export default router;

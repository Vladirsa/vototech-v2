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
  const resultado = await query(
    `SELECT id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id,
            meta_diaria, activo, ultimo_acceso, creado_en
     FROM usuarios WHERE campana_id = $1 ORDER BY creado_en`,
    [req.usuario.campana_id]
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
  nombre: z.string().min(2).max(200),
  email: z.string().email(),
  telefono: z.string().max(20).optional(),
  password: z.string().min(8),
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor']),
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
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor']).optional(),
  puesto: z.string().max(100).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
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

export default router;

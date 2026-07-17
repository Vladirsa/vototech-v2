import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

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
    `SELECT id, nombre, email, telefono, rol, parent_id, territorio_tipo, territorio_id,
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
    const resultado = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, parent_id, territorio_tipo, territorio_id, meta_diaria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, nombre, rol`,
      [req.usuario.campana_id, d.nombre, d.email, d.telefono || null, passwordHash,
       d.rol, d.parent_id || null, d.territorio_tipo || null, d.territorio_id || null, d.meta_diaria]
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

  // No dejar que alguien se asigne a sí mismo como su propio jefe
  if (d.parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede ser su propio coordinador' });

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
  res.json({ ok: true, data: resultado.rows[0] });
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

export default router;

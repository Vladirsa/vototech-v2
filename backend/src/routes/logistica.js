import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// ═══════════════════════════════════════════════════════════════
// 🚗 VEHÍCULOS — se guardan como un tipo más de Activo (hereda
// gratis código de inventario, responsable, kardex, y dar de baja
// al terminar la campaña — todo el ciclo de vida ya construido).
// ═══════════════════════════════════════════════════════════════

router.get('/vehiculos', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, r.nombre as responsable_nombre,
            c.id as chofer_id, c.nombre as chofer_nombre, c.telefono as chofer_telefono
     FROM activos a
     LEFT JOIN usuarios r ON r.id = a.responsable_id
     LEFT JOIN choferes c ON c.vehiculo_id = a.id
     WHERE a.campana_id=$1 AND a.tipo='vehiculo' ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaVehiculo = z.object({
  subtipo: z.string().max(100).optional(),
  notas: z.string().max(300).optional(),
  costo: z.number().optional(),
  responsable_id: z.string().uuid().optional(),
});

router.post('/vehiculos', async (req, res) => {
  const parseado = esquemaVehiculo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const conteoRes = await query('SELECT COUNT(*) as total FROM activos WHERE campana_id=$1', [req.usuario.campana_id]);
  const codigoInventario = `ACT-${new Date().getFullYear()}-${String(parseInt(conteoRes.rows[0].total) + 1).padStart(6, '0')}`;

  const resultado = await query(
    `INSERT INTO activos (campana_id, tipo, subtipo, notas, costo, responsable_id, codigo_inventario, fecha_ini, registrado_por)
     VALUES ($1,'vehiculo',$2,$3,$4,$5,$6,CURRENT_DATE,$7) RETURNING *`,
    [req.usuario.campana_id, d.subtipo || null, d.notas || null, d.costo || null, d.responsable_id || null, codigoInventario, req.usuario.sub]
  );
  await query(
    `INSERT INTO kardex_activos (activo_id, tipo_movimiento, descripcion, responsable_nuevo_id, realizado_por)
     VALUES ($1,'alta',$2,$3,$4)`,
    [resultado.rows[0].id, `Alta de vehículo — ${codigoInventario}`, d.responsable_id || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// 🧑‍✈️ CHOFERES
// ═══════════════════════════════════════════════════════════════

router.get('/choferes', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, a.subtipo as vehiculo_subtipo, a.notas as vehiculo_notas, a.codigo_inventario as vehiculo_codigo
     FROM choferes c LEFT JOIN activos a ON a.id = c.vehiculo_id
     WHERE c.campana_id=$1 ORDER BY c.nombre`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaChofer = z.object({
  nombre: z.string().min(2).max(200),
  telefono: z.string().max(20).optional(),
  licencia_vigencia: z.string().optional(),
  vehiculo_id: z.string().uuid().optional(),
  disponible: z.boolean().optional(),
  notas: z.string().max(300).optional(),
});

router.post('/choferes', async (req, res) => {
  const parseado = esquemaChofer.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO choferes (campana_id, nombre, telefono, licencia_vigencia, vehiculo_id, disponible, notas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.usuario.campana_id, d.nombre, d.telefono || null, d.licencia_vigencia || null, d.vehiculo_id || null, d.disponible !== false, d.notas || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/choferes/:id', async (req, res) => {
  const parseado = esquemaChofer.partial().safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) { campos.push(`${campo}=$${i++}`); valores.push(valor); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE choferes SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/choferes/:id', async (req, res) => {
  await query('DELETE FROM choferes WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// ✅ CHECKLIST POR EVENTO — ligado a Agenda.
// ═══════════════════════════════════════════════════════════════

const CATEGORIA_LABEL = {
  sonido: '🔊 Sonido', templete: '🎪 Templete/tarima', sillas: '🪑 Sillas', pantalla: '📺 Pantalla/proyector',
  planta_electrica: '🔌 Planta eléctrica', permisos: '📋 Permisos', transporte: '🚗 Transporte',
  hospedaje: '🏨 Hospedaje', alimentacion: '🍽️ Alimentación', otro: '📦 Otro',
};

const CHECKLIST_ESTANDAR = [
  { categoria: 'sonido', item: 'Equipo de sonido' },
  { categoria: 'templete', item: 'Templete o tarima' },
  { categoria: 'sillas', item: 'Sillas para asistentes' },
  { categoria: 'pantalla', item: 'Pantalla/proyector' },
  { categoria: 'planta_electrica', item: 'Planta eléctrica de respaldo' },
  { categoria: 'permisos', item: 'Permiso municipal del espacio' },
  { categoria: 'transporte', item: 'Transporte del candidato' },
];

router.get('/checklist/:eventoId', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, r.nombre as responsable_nombre FROM agenda_checklist c
     LEFT JOIN usuarios r ON r.id = c.responsable_id
     WHERE c.evento_id=$1 ORDER BY c.categoria`,
    [req.params.eventoId]
  );
  res.json({ ok: true, data: resultado.rows, categorias: CATEGORIA_LABEL });
});

router.post('/checklist/:eventoId/generar-estandar', async (req, res) => {
  const evento = await query('SELECT id FROM agenda WHERE id=$1 AND campana_id=$2', [req.params.eventoId, req.usuario.campana_id]);
  if (!evento.rows[0]) return res.status(404).json({ ok: false, error: 'Evento no encontrado' });

  const existentes = await query('SELECT COUNT(*) as total FROM agenda_checklist WHERE evento_id=$1', [req.params.eventoId]);
  if (parseInt(existentes.rows[0].total) > 0) {
    return res.status(400).json({ ok: false, error: 'Este evento ya tiene un checklist — agrega puntos manualmente si necesitas más.' });
  }

  for (const punto of CHECKLIST_ESTANDAR) {
    await query(
      `INSERT INTO agenda_checklist (evento_id, campana_id, categoria, item) VALUES ($1,$2,$3,$4)`,
      [req.params.eventoId, req.usuario.campana_id, punto.categoria, punto.item]
    );
  }
  const resultado = await query('SELECT * FROM agenda_checklist WHERE evento_id=$1 ORDER BY categoria', [req.params.eventoId]);
  res.status(201).json({ ok: true, data: resultado.rows });
});

const esquemaChecklistItem = z.object({
  categoria: z.enum(Object.keys(CATEGORIA_LABEL)),
  item: z.string().min(2).max(200),
  responsable_id: z.string().uuid().optional(),
  notas: z.string().max(300).optional(),
});

router.post('/checklist/:eventoId', async (req, res) => {
  const parseado = esquemaChecklistItem.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO agenda_checklist (evento_id, campana_id, categoria, item, responsable_id, notas)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.eventoId, req.usuario.campana_id, d.categoria, d.item, d.responsable_id || null, d.notas || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/checklist/item/:itemId/completar', async (req, res) => {
  const resultado = await query('UPDATE agenda_checklist SET completado = NOT completado WHERE id=$1 RETURNING *', [req.params.itemId]);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/checklist/item/:itemId', async (req, res) => {
  await query('DELETE FROM agenda_checklist WHERE id=$1', [req.params.itemId]);
  res.json({ ok: true });
});

router.get('/resumen', async (req, res) => {
  const proximosEventos = await query(
    `SELECT a.id, a.titulo, a.fecha_inicio,
            (SELECT COUNT(*) FROM agenda_checklist WHERE evento_id=a.id) as total_items,
            (SELECT COUNT(*) FROM agenda_checklist WHERE evento_id=a.id AND completado=true) as completados
     FROM agenda a
     WHERE a.campana_id=$1 AND a.fecha_inicio > now() AND a.fecha_inicio < now() + interval '7 days' AND a.estado != 'cancelado'
     ORDER BY a.fecha_inicio ASC`,
    [req.usuario.campana_id]
  );
  const totalVehiculos = await query(`SELECT COUNT(*) as total FROM activos WHERE campana_id=$1 AND tipo='vehiculo' AND estado != 'baja'`, [req.usuario.campana_id]);
  const totalChoferes = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE disponible=true) as disponibles FROM choferes WHERE campana_id=$1`, [req.usuario.campana_id]);

  res.json({
    ok: true,
    data: {
      proximos_eventos: proximosEventos.rows,
      total_vehiculos: parseInt(totalVehiculos.rows[0].total),
      total_choferes: parseInt(totalChoferes.rows[0].total),
      choferes_disponibles: parseInt(totalChoferes.rows[0].disponibles),
    },
  });
});

export default router;

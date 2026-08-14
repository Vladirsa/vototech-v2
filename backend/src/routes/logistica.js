import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * ── VEHÍCULOS ──
 * 🆕 No se crea una tabla nueva — un vehículo ES un activo más
 * (tipo='vehiculo'), así aprovecha TODO lo que ya construimos para
 * Activos: código de inventario automático, responsable asignado,
 * kardex de movimientos, y dar de baja al terminar la campaña.
 */
router.get('/vehiculos', async (req, res) => {
  const resultado = await query(
    `SELECT a.*, r.nombre as responsable_nombre,
            (SELECT COUNT(*) FROM choferes c WHERE c.vehiculo_asignado_id = a.id) as choferes_asignados
     FROM activos a
     LEFT JOIN usuarios r ON r.id = a.responsable_id
     WHERE a.campana_id=$1 AND a.tipo='vehiculo' ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaVehiculo = z.object({
  subtipo: z.enum(['sedan', 'camioneta', 'autobus', 'motocicleta', 'otro']),
  direccion: z.string().max(200).optional(),
  placas: z.string().max(20).optional(),
  capacidad_personas: z.number().int().positive().optional(),
  empresa: z.string().max(200).optional(),
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
    `INSERT INTO activos (campana_id, tipo, subtipo, direccion, placas, capacidad_personas, empresa, costo, responsable_id, registrado_por, codigo_inventario, fecha_ini)
     VALUES ($1,'vehiculo',$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE) RETURNING *`,
    [req.usuario.campana_id, d.subtipo, d.direccion || null, d.placas || null, d.capacidad_personas || null,
     d.empresa || null, d.costo || null, d.responsable_id || null, req.usuario.sub, codigoInventario]
  );
  await query(
    `INSERT INTO kardex_activos (activo_id, tipo_movimiento, descripcion, responsable_nuevo_id, realizado_por)
     VALUES ($1,'alta',$2,$3,$4)`,
    [resultado.rows[0].id, `Alta de vehículo — ${codigoInventario}`, d.responsable_id || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

// ── CHOFERES ──
router.get('/choferes', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, a.direccion as vehiculo_descripcion, a.placas as vehiculo_placas, a.codigo_inventario as vehiculo_codigo
     FROM choferes c LEFT JOIN activos a ON a.id = c.vehiculo_asignado_id
     WHERE c.campana_id=$1 ORDER BY c.nombre`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

const esquemaChofer = z.object({
  nombre: z.string().min(2).max(150),
  telefono: z.string().max(20).optional(),
  tipo_licencia: z.string().max(30).optional(),
  licencia_vigente_hasta: z.string().optional(),
  vehiculo_asignado_id: z.string().uuid().optional(),
  notas: z.string().max(300).optional(),
});
router.post('/choferes', async (req, res) => {
  const parseado = esquemaChofer.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO choferes (campana_id, nombre, telefono, tipo_licencia, licencia_vigente_hasta, vehiculo_asignado_id, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.usuario.campana_id, d.nombre, d.telefono || null, d.tipo_licencia || null, d.licencia_vigente_hasta || null, d.vehiculo_asignado_id || null, d.notas || null]
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
  if (req.body.disponible !== undefined) { campos.push(`disponible=$${i++}`); valores.push(!!req.body.disponible); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE choferes SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, data: resultado.rows[0] });
});
router.delete('/choferes/:id', async (req, res) => {
  await query('DELETE FROM choferes WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.get('/eventos-proximos', async (req, res) => {
  const resultado = await query(
    `SELECT a.id as evento_id, a.titulo, a.tipo, a.fecha_inicio, a.lugar, a.color_alerta,
            l.id as logistica_id, l.checklist, l.estado, l.vehiculo_id, l.chofer_id, l.costo_estimado,
            v.direccion as vehiculo_descripcion, v.placas as vehiculo_placas, ch.nombre as chofer_nombre
     FROM agenda a
     LEFT JOIN logistica_eventos l ON l.evento_id = a.id
     LEFT JOIN activos v ON v.id = l.vehiculo_id
     LEFT JOIN choferes ch ON ch.id = l.chofer_id
     WHERE a.campana_id=$1 AND a.fecha_inicio >= now() - interval '1 day' AND a.estado != 'cancelado'
     ORDER BY a.fecha_inicio ASC LIMIT 30`,
    [req.usuario.campana_id]
  );
  const conResumen = resultado.rows.map((e) => {
    const items = e.checklist ? Object.values(e.checklist) : [];
    const listos = items.filter(Boolean).length;
    return { ...e, checklist_listos: listos, checklist_total: items.length };
  });
  res.json({ ok: true, data: conResumen });
});

router.get('/eventos/:eventoId', async (req, res) => {
  let resultado = await query('SELECT * FROM logistica_eventos WHERE evento_id=$1', [req.params.eventoId]);
  if (!resultado.rows[0]) {
    resultado = await query(
      `INSERT INTO logistica_eventos (evento_id, campana_id) VALUES ($1,$2) RETURNING *`,
      [req.params.eventoId, req.usuario.campana_id]
    );
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

const esquemaLogisticaEvento = z.object({
  checklist: z.record(z.boolean()).optional(),
  vehiculo_id: z.string().uuid().nullable().optional(),
  chofer_id: z.string().uuid().nullable().optional(),
  hospedaje: z.string().max(300).optional(),
  alimentacion: z.string().max(300).optional(),
  costo_estimado: z.number().optional(),
  notas_avanzada: z.string().max(500).optional(),
  estado: z.enum(['pendiente', 'listo']).optional(),
});

router.patch('/eventos/:eventoId', async (req, res) => {
  const parseado = esquemaLogisticaEvento.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const campos = [];
  const valores = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(d)) {
    campos.push(`${campo}=$${i}`);
    valores.push(campo === 'checklist' ? JSON.stringify(valor) : valor);
    i++;
  }
  campos.push(`actualizado_por=$${i}`); valores.push(req.usuario.sub); i++;
  campos.push(`actualizado_en=now()`);
  valores.push(req.params.eventoId, req.usuario.campana_id);

  const resultado = await query(
    `UPDATE logistica_eventos SET ${campos.join(', ')} WHERE evento_id=$${i} AND campana_id=$${i + 1} RETURNING *`,
    valores
  );
  if (!resultado.rows[0]) {
    const insertado = await query(
      `INSERT INTO logistica_eventos (evento_id, campana_id, checklist, vehiculo_id, chofer_id, hospedaje, alimentacion, costo_estimado, notas_avanzada, estado, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.eventoId, req.usuario.campana_id, JSON.stringify(d.checklist || {}), d.vehiculo_id || null, d.chofer_id || null,
       d.hospedaje || null, d.alimentacion || null, d.costo_estimado || null, d.notas_avanzada || null, d.estado || 'pendiente', req.usuario.sub]
    );
    return res.json({ ok: true, data: insertado.rows[0] });
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

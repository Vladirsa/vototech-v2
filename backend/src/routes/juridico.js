import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get('/calendario', async (req, res) => {
  const resultado = await query('SELECT * FROM calendario_electoral WHERE campana_id=$1 ORDER BY fecha', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaPlazo = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(['plazo_ine', 'plazo_ite', 'veda', 'otro']).default('otro'),
  fecha: z.string(),
  descripcion: z.string().max(500).optional(),
});

router.post('/calendario', async (req, res) => {
  const parseado = esquemaPlazo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO calendario_electoral (campana_id, titulo, tipo, fecha, descripcion) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.usuario.campana_id, d.titulo, d.tipo, d.fecha, d.descripcion || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/calendario/:id/cumplido', async (req, res) => {
  await query('UPDATE calendario_electoral SET cumplido=$1 WHERE id=$2 AND campana_id=$3', [!!req.body.cumplido, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.delete('/calendario/:id', async (req, res) => {
  await query('DELETE FROM calendario_electoral WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.get('/quejas', async (req, res) => {
  const resultado = await query('SELECT * FROM quejas_recursos WHERE campana_id=$1 ORDER BY creado_en DESC', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows });
});

const esquemaQueja = z.object({
  tipo: z.enum(['queja', 'recurso']).default('queja'),
  autoridad: z.enum(['ine', 'ite']).default('ite'),
  numero_expediente: z.string().max(100).optional(),
  descripcion: z.string().min(5).max(2000),
  fecha_presentacion: z.string().optional(),
});

router.post('/quejas', async (req, res) => {
  const parseado = esquemaQueja.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const resultado = await query(
    `INSERT INTO quejas_recursos (campana_id, tipo, autoridad, numero_expediente, descripcion, fecha_presentacion, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.usuario.campana_id, d.tipo, d.autoridad, d.numero_expediente || null, d.descripcion, d.fecha_presentacion || null, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/quejas/:id', async (req, res) => {
  const { estado, resultado: textoResultado, fecha_resolucion, numero_expediente } = req.body;
  const campos = [];
  const valores = [];
  let i = 1;
  if (estado) { campos.push(`estado=$${i++}`); valores.push(estado); }
  if (textoResultado) { campos.push(`resultado=$${i++}`); valores.push(textoResultado); }
  if (fecha_resolucion) { campos.push(`fecha_resolucion=$${i++}`); valores.push(fecha_resolucion); }
  if (numero_expediente) { campos.push(`numero_expediente=$${i++}`); valores.push(numero_expediente); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE quejas_recursos SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.get('/resumen', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const proximosPlazos = await query(
    `SELECT * FROM calendario_electoral WHERE campana_id=$1 AND cumplido=false AND fecha >= CURRENT_DATE ORDER BY fecha LIMIT 5`,
    [campanaId]
  );
  const quejasAbiertas = await query(`SELECT COUNT(*) as total FROM quejas_recursos WHERE campana_id=$1 AND estado != 'resuelta'`, [campanaId]);
  const incidenciasActivas = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1 AND estado='activa'`, [campanaId]);
  const gastoRes = await query(`SELECT COALESCE(SUM(monto),0) as total FROM gastos_campana WHERE campana_id=$1`, [campanaId]);
  const campanaRes = await query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [campanaId]);

  res.json({
    ok: true,
    data: {
      proximos_plazos: proximosPlazos.rows,
      quejas_abiertas: parseInt(quejasAbiertas.rows[0].total),
      incidencias_activas: parseInt(incidenciasActivas.rows[0].total),
      gasto_actual: parseFloat(gastoRes.rows[0].total),
      tope_gasto: campanaRes.rows[0]?.tope_gasto_ople,
    },
  });
});

/**
 * GET/PATCH /api/juridico/fecha-inicio-campana
 * La fecha LEGAL de arranque de campaña — base de la alerta de
 * "acto anticipado" en Activos. La captura manual el equipo jurídico,
 * porque viene del convenio/registro ante el ITE, no de un cálculo.
 */
router.get('/fecha-inicio-campana', async (req, res) => {
  const resultado = await query('SELECT fecha_inicio_campana_oficial FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/fecha-inicio-campana', async (req, res) => {
  const { fecha } = req.body;
  await query('UPDATE campanas SET fecha_inicio_campana_oficial=$1 WHERE id=$2', [fecha || null, req.usuario.campana_id]);
  res.json({ ok: true });
});

/**
 * GET /api/juridico/auditoria
 * Solo altos mandos pueden ver la bitácora completa — es información
 * sensible de quién hizo qué en el sistema.
 */
router.get('/auditoria', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden ver la bitácora de auditoría' });
  }
  const filtroTabla = req.query.tabla ? 'AND tabla=$2' : '';
  const params = filtroTabla ? [req.usuario.campana_id, req.query.tabla] : [req.usuario.campana_id];
  const resultado = await query(
    `SELECT * FROM auditoria WHERE campana_id=$1 ${filtroTabla} ORDER BY creado_en DESC LIMIT 200`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// 🆕 REDACCIÓN CON IA — mismo patrón que Marketing (generar-contenido-ia)
// ═══════════════════════════════════════════════════════════════

const TIPO_DOCUMENTO_JURIDICO = {
  queja_formal: { instruccion: 'Redacta un borrador de escrito de QUEJA formal ante la autoridad electoral, con estructura de oficio: encabezado, hechos narrados en orden cronológico y con numeración, fundamento de derecho genérico (sin inventar artículos específicos que no te den), y petitorio claro.' },
  recurso_formal: { instruccion: 'Redacta un borrador de RECURSO de impugnación, con estructura de oficio: encabezado, acto que se impugna, agravios numerados, y petitorio.' },
  notificacion_incidencia: { instruccion: 'Redacta una notificación formal y breve dirigida a la autoridad electoral, reportando la incidencia descrita, en tono serio y objetivo, sin acusaciones que no estén sustentadas en los hechos narrados.' },
  argumentario_legal: { instruccion: 'Redacta un argumentario de 4-6 puntos con la postura legal de la campaña sobre este tema, cada uno con una explicación breve en lenguaje claro (no solo para abogados) que el candidato pueda usar si le preguntan al respecto.' },
};

const esquemaRedactarIA = z.object({
  tipo_documento: z.enum(Object.keys(TIPO_DOCUMENTO_JURIDICO)),
  hechos: z.string().min(10).max(3000),
  queja_id: z.string().uuid().optional(), // si viene de una queja ya registrada, para dar contexto adicional
});

router.post('/redactar-ia', async (req, res) => {
  const parseado = esquemaRedactarIA.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const config = TIPO_DOCUMENTO_JURIDICO[d.tipo_documento];

  const campanaRes = await query('SELECT nombre_candidato, partido, tipo_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const campana = campanaRes.rows[0];

  try {
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Eres asistente de redacción jurídica para una campaña electoral en México (Tlaxcala). ${config.instruccion}

Candidato/campaña: ${campana?.nombre_candidato || '[NOMBRE DEL CANDIDATO]'} (${campana?.tipo_eleccion || 'campaña local'})

Hechos/tema proporcionado por el usuario:
${d.hechos}

Reglas OBLIGATORIAS:
- Este es un BORRADOR de apoyo — SIEMPRE debe revisarlo un abogado antes de presentarse ante cualquier autoridad. Escribe el documento asumiendo que se le van a hacer ajustes.
- NUNCA cites un artículo, fracción o número de ley específico que no te haya dado el usuario — si necesitas referenciar fundamento legal, usa lenguaje genérico como "conforme a la normatividad electoral aplicable" en vez de inventar un número de artículo.
- NUNCA inventes hechos, fechas, nombres, o cifras que no estén en lo que te proporcionó el usuario.
- No acuses de un delito específico (como "compra de votos" o "coacción") a menos que el usuario ya haya usado esas palabras exactas al describir los hechos.
- Usa español formal de documento legal mexicano, pero sin exagerar el legalismo hasta volverse ilegible.
- Dejar marcado con [CORCHETES] cualquier dato que falte y que el usuario deba completar (número de expediente, fecha exacta, nombre de funcionario, etc.).`,
      }],
    });
    const texto = respuesta.content[0]?.text || '';
    res.json({ ok: true, data: { contenido: texto } });
  } catch (e) {
    console.error('Error redactando documento jurídico con IA:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar el borrador. Intenta de nuevo.' });
  }
});

export default router;

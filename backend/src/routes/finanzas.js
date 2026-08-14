// backend/src/routes/finanzas.js
// VERSIÓN INE-COMPLIANT — Mantiene compatibilidad con gastos_campana/ingresos_campana
// y agrega módulo de pólizas con partida doble, evidencias, agenda, topes, activos fijos

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();
router.use(requiereAuth);

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE CUENTAS INE (en memoria — también está en BD)
// ══════════════════════════════════════════════════════════════
const CATALOGO_CUENTAS = {
  '6-1-01-01': { nombre: 'GASTOS DE PROPAGANDA', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA','MUESTRA'] },
  '6-1-01-02': { nombre: 'GASTOS OPERATIVOS DE CAMPAÑA', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '6-1-01-03': { nombre: 'GASTOS DE PROPAGANDA EN MEDIOS IMPRESOS', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','MUESTRA'] },
  '6-1-01-04': { nombre: 'GASTOS DE PRODUCCIÓN PARA RADIO Y TV', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','MUESTRA_VIDEO_AUDIO'] },
  '6-1-01-05': { nombre: 'GASTOS DE PRESENTACIÓN DE CANDIDATURAS', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '6-1-01-06': { nombre: 'GASTOS DE EXPOSICIÓN DE PROGRAMAS', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '6-1-01-07': { nombre: 'GASTOS DE DIFUSIÓN INTERCAMPAÑA', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '6-1-01-08': { nombre: 'GASTOS DETERMINADOS POR EL INE', tipo: 'EGRESO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO'] },
  '4-1-00-00': { nombre: 'FINANCIAMIENTO PÚBLICO', tipo: 'INGRESO', naturaleza: 'ACREEDORA', evidencias: ['FICHA_DEPOSITO','RECIBO_INTERNO'] },
  '4-2-01-00': { nombre: 'APORTACIONES DE MILITANTES', tipo: 'INGRESO', naturaleza: 'ACREEDORA', evidencias: ['CREDENCIAL_ELECTOR','CONTROL_FOLIOS','RECIBO_APORTACION','CONSTANCIA_SITUACION_FISCAL'] },
  '1-2-01-03': { nombre: 'MOBILIARIO Y EQUIPO DE OFICINA', tipo: 'ACTIVO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '1-2-01-04': { nombre: 'EQUIPO DE TRANSPORTE', tipo: 'ACTIVO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA','POLIZA_SEGURO'] },
  '1-2-01-05': { nombre: 'EQUIPO DE CÓMPUTO', tipo: 'ACTIVO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '1-2-01-06': { nombre: 'EQUIPO DE SONIDO Y VIDEO', tipo: 'ACTIVO', naturaleza: 'DEUDORA', evidencias: ['CFDI_XML','CFDI_PDF','CONTRATO','FOTOGRAFIA'] },
  '1-2-02-00': { nombre: 'DEPRECIACIÓN ACUMULADA', tipo: 'ACTIVO', naturaleza: 'ACREEDORA', evidencias: ['PAPEL_TRABAJO'] },
};

const FUENTES_PROHIBIDAS = ['gobierno', 'extranjero', 'iglesia_o_culto', 'empresa_mercantil', 'organismo_internacional', 'anonimo'];

// ══════════════════════════════════════════════════════════════
// NUEVO: PÓLIZAS CON PARTIDA DOBLE (INE-compliant)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/finanzas/polizas
 * Lista todas las pólizas de la campaña con sus movimientos
 */
router.get('/polizas', async (req, res) => {
  const { rows: polizas } = await query(
    `SELECT p.*, 
      (SELECT COALESCE(SUM(monto), 0) FROM movimientos_poliza WHERE poliza_id = p.id AND tipo_movimiento = 'CARGO') as total_cargos_calc,
      (SELECT COALESCE(SUM(monto), 0) FROM movimientos_poliza WHERE poliza_id = p.id AND tipo_movimiento = 'ABONO') as total_abonos_calc
     FROM polizas p
     WHERE p.campana_id = $1
     ORDER BY p.fecha_poliza DESC, p.created_at DESC`,
    [req.usuario.campana_id]
  );

  // Cargar movimientos de cada póliza
  for (const poliza of polizas) {
    const { rows: movimientos } = await query(
      `SELECT m.*, c.descripcion as cuenta_nombre, c.tipo_cuenta, c.naturaleza
       FROM movimientos_poliza m
       JOIN catalogo_cuentas_ine c ON m.cuenta_id = c.id_cuenta
       WHERE m.poliza_id = $1
       ORDER BY m.tipo_movimiento, m.id`,
      [poliza.id]
    );
    poliza.movimientos = movimientos;
    
    // Cargar evidencias
    const { rows: evidencias } = await query(
      `SELECT * FROM evidencias WHERE poliza_id = $1`,
      [poliza.id]
    );
    poliza.evidencias = evidencias;
  }

  res.json({ ok: true, data: polizas });
});

/**
 * POST /api/finanzas/polizas
 * Crear póliza con partida doble (cargo = abono obligatorio)
 */
const esquemaPoliza = z.object({
  fecha_poliza: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo_poliza: z.enum(['DIARIO', 'EGRESO', 'INGRESO', 'AJUSTE', 'PROVISION']),
  concepto: z.string().min(5).max(500),
  movimientos: z.array(z.object({
    cuenta_id: z.string().regex(/^\d-\d-\d{2}-\d{2}-\d{4}$/),
    tipo_movimiento: z.enum(['CARGO', 'ABONO']),
    monto: z.number().positive(),
    descripcion: z.string().max(300).optional(),
  })).min(2), // Mínimo 2 movimientos (1 cargo + 1 abono)
});

router.post('/polizas', async (req, res) => {
  const parseado = esquemaPoliza.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }

  const d = parseado.data;
  
  // Validar que cargos = abonos
  const totalCargos = d.movimientos.filter(m => m.tipo_movimiento === 'CARGO').reduce((s, m) => s + m.monto, 0);
  const totalAbonos = d.movimientos.filter(m => m.tipo_movimiento === 'ABONO').reduce((s, m) => s + m.monto, 0);
  
  if (Math.abs(totalCargos - totalAbonos) > 0.01) {
    return res.status(400).json({ 
      ok: false, 
      error: `Partida no cuadra: Cargos $${totalCargos.toFixed(2)} ≠ Abonos $${totalAbonos.toFixed(2)}` 
    });
  }

  // Validar que las cuentas existen en el catálogo
  for (const mov of d.movimientos) {
    const { rows } = await query('SELECT 1 FROM catalogo_cuentas_ine WHERE id_cuenta = $1', [mov.cuenta_id]);
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: `Cuenta ${mov.cuenta_id} no existe en el catálogo INE` });
    }
  }

  // Crear póliza
  const { rows: [poliza] } = await query(
    `INSERT INTO polizas (campana_id, fecha_poliza, tipo_poliza, concepto, total_cargos, total_abonos, estatus, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'BORRADOR', $7) RETURNING *`,
    [req.usuario.campana_id, d.fecha_poliza, d.tipo_poliza, d.concepto, totalCargos, totalAbonos, req.usuario.sub]
  );

  // Crear movimientos
  for (const mov of d.movimientos) {
    await query(
      `INSERT INTO movimientos_poliza (poliza_id, cuenta_id, tipo_movimiento, monto, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [poliza.id, mov.cuenta_id, mov.tipo_movimiento, mov.monto, mov.descripcion || null]
    );
  }

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'polizas', registroId: poliza.id,
    detalle: { folio: poliza.folio, concepto: d.concepto, monto: totalCargos },
    ip: req.ip,
  });

  res.status(201).json({ ok: true, data: poliza });
});

/**
 * POST /api/finanzas/polizas/:id/evidencias
 * Subir evidencias a una póliza (CFDI XML, PDF, fotos, contratos)
 */
router.post('/polizas/:id/evidencias', upload.array('archivos', 10), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, error: 'No se recibieron archivos' });

  // Verificar que la póliza existe y pertenece a la campaña
  const { rows: polizaCheck } = await query(
    'SELECT id FROM polizas WHERE id = $1 AND campana_id = $2',
    [req.params.id, req.usuario.campana_id]
  );
  if (polizaCheck.length === 0) return res.status(404).json({ ok: false, error: 'Póliza no encontrada' });

  const evidenciasSubidas = [];
  const tiposPermitidos = req.body.tipos ? req.body.tipos.split(',') : ['OTRO'];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const tipoEvidencia = tiposPermitidos[i] || 'OTRO';
    
    // Generar hash SHA-256
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    
    // Subir a Supabase
    const extension = file.originalname.split('.').pop();
    const ruta = `${req.usuario.campana_id}/evidencias/${req.params.id}/${hash}.${extension}`;
    const { error } = await supabase.storage.from('documentos').upload(ruta, file.buffer, { 
      contentType: file.mimetype,
      upsert: false 
    });
    if (error) continue;

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
    
    // Extraer folio fiscal si es CFDI XML
    let folioFiscal = null;
    if (tipoEvidencia === 'CFDI_XML' && extension === 'xml') {
      const xmlContent = file.buffer.toString('utf-8');
      const match = xmlContent.match(/UUID="([A-Fa-f0-9-]{36})"/);
      if (match) folioFiscal = match[1];
    }

    // Guardar en BD
    const { rows: [evidencia] } = await query(
      `INSERT INTO evidencias (poliza_id, tipo_evidencia, nombre_archivo, url_storage, hash_sha256, folio_fiscal, monto_comprobado, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [req.params.id, tipoEvidencia, file.originalname, urlData.publicUrl, hash, folioFiscal, req.body.monto_comprobado || null]
    );
    
    evidenciasSubidas.push(evidencia);
  }

  res.json({ ok: true, data: evidenciasSubidas });
});

/**
 * POST /api/finanzas/polizas/:id/validar-sat
 * Validar CFDI contra el SAT (mock — requiere integración real con WS SAT)
 */
router.post('/polizas/:id/validar-sat', async (req, res) => {
  const { rows: evidencias } = await query(
    `SELECT * FROM evidencias WHERE poliza_id = $1 AND tipo_evidencia = 'CFDI_XML' AND validacion_sat = 'PENDIENTE'`,
    [req.params.id]
  );

  const resultados = [];
  for (const ev of evidencias) {
    // TODO: Integrar con web service del SAT
    // Por ahora, mock de validación
    const esValido = ev.folio_fiscal && ev.folio_fiscal.length === 36;
    const estado = esValido ? 'VALIDO' : 'INVALIDO';
    
    await query(
      'UPDATE evidencias SET validacion_sat = $1 WHERE id = $2',
      [estado, ev.id]
    );
    
    resultados.push({ evidencia_id: ev.id, folio_fiscal: ev.folio_fiscal, estado });
  }

  res.json({ ok: true, data: resultados });
});

// ══════════════════════════════════════════════════════════════
// AGENDA DE EVENTOS (INE: registro con 7 días de anticipación)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/finanzas/agenda
 */
router.get('/agenda', async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, p.folio as poliza_folio
     FROM agenda_eventos a
     LEFT JOIN polizas p ON p.id = a.poliza_gastos_id
     WHERE a.campana_id = $1
     ORDER BY a.fecha_evento DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: rows });
});

const esquemaEvento = z.object({
  nombre_evento: z.string().min(3).max(200),
  tipo_evento: z.enum(['PRECAMPAÑA', 'OBTENCION_APOYO', 'CAMPAÑA', 'OPERATIVO', 'PRESENTACION_CANDIDATURA', 'JORNADA_ELECTORAL']),
  fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().optional(),
  hora_fin: z.string().optional(),
  direccion: z.string().max(500).optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
});

router.post('/agenda', async (req, res) => {
  const parseado = esquemaEvento.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });

  const d = parseado.data;
  
  // Validar 7 días de anticipación
  const fechaEvento = new Date(d.fecha_evento);
  const hoy = new Date();
  const diffDias = Math.floor((fechaEvento - hoy) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 7) {
    return res.status(400).json({ 
      ok: false, 
      error: `El INE exige registrar eventos con al menos 7 días de anticipación. Faltan ${7 - diffDias} días.` 
    });
  }

  const { rows: [evento] } = await query(
    `INSERT INTO agenda_eventos (campana_id, nombre_evento, tipo_evento, fecha_evento, hora_inicio, hora_fin, direccion, latitud, longitud, estado_registro, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROGRAMADO', $10) RETURNING *`,
    [req.usuario.campana_id, d.nombre_evento, d.tipo_evento, d.fecha_evento, d.hora_inicio || null, d.hora_fin || null, 
     d.direccion || null, d.latitud || null, d.longitud || null, req.usuario.sub]
  );

  res.status(201).json({ ok: true, data: evento });
});

/**
 * POST /api/finanzas/agenda/:id/evidencia
 * Subir foto del evento realizado
 */
router.post('/agenda/:id/evidencia', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió foto' });

  const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const ruta = `${req.usuario.campana_id}/eventos/${req.params.id}/${hash}.jpg`;
  
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto' });

  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
  
  await query(
    'UPDATE agenda_eventos SET evidencia_fotografica = $1, estado_registro = $2 WHERE id = $3 AND campana_id = $4',
    [urlData.publicUrl, 'REALIZADO', req.params.id, req.usuario.campana_id]
  );

  res.json({ ok: true, data: { evidencia_url: urlData.publicUrl } });
});

// ══════════════════════════════════════════════════════════════
// ACTIVOS FIJOS (con depreciación)
// ══════════════════════════════════════════════════════════════

router.get('/activos-fijos', async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, p.folio as poliza_folio
     FROM activos_fijos a
     LEFT JOIN polizas p ON p.id = a.poliza_alta_id
     WHERE a.campana_id = $1 AND a.estado != 'BAJA'
     ORDER BY a.fecha_adquisicion DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: rows });
});

const esquemaActivo = z.object({
  tipo_activo: z.enum(['TERRENO', 'EDIFICIO', 'MOBILIARIO', 'VEHICULO', 'EQUIPO_COMPUTO', 'EQUIPO_SONIDO', 'EQUIPO_COMUNICACION', 'MAQUINARIA', 'EQUIPO_AUDIOVISUAL']),
  descripcion: z.string().min(3).max(500),
  marca: z.string().max(100).optional(),
  modelo: z.string().max(100).optional(),
  numero_serie: z.string().max(100).optional(),
  valor_adquisicion: z.number().positive(),
  vida_util_meses: z.number().int().min(1).max(600),
  fecha_adquisicion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direccion_ubicacion: z.string().max(500).optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  es_aportacion_especie: z.boolean().default(false),
  es_comodato: z.boolean().default(false),
});

router.post('/activos-fijos', async (req, res) => {
  const parseado = esquemaActivo.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });

  const d = parseado.data;
  
  // Calcular tasa de depreciación mensual (línea recta)
  const tasaMensual = 1 / d.vida_util_meses;
  
  // Crear póliza de alta del activo
  const { rows: [poliza] } = await query(
    `INSERT INTO polizas (campana_id, fecha_poliza, tipo_poliza, concepto, total_cargos, total_abonos, estatus, created_by)
     VALUES ($1, $2, 'DIARIO', $3, $4, $4, 'COMPROBADA', $5) RETURNING *`,
    [req.usuario.campana_id, d.fecha_adquisicion, `Alta de activo: ${d.descripcion}`, d.valor_adquisicion, req.usuario.sub]
  );

  // Movimientos: Cargo al activo, Abono a bancos (simplificado)
  await query(
    `INSERT INTO movimientos_poliza (poliza_id, cuenta_id, tipo_movimiento, monto, descripcion)
     VALUES ($1, $2, 'CARGO', $3, 'Alta de activo fijo')`,
    [poliza.id, `1-2-01-0${d.tipo_activo === 'TERRENO' ? '1' : d.tipo_activo === 'EDIFICIO' ? '2' : '3'}`, d.valor_adquisicion]
  );

  const { rows: [activo] } = await query(
    `INSERT INTO activos_fijos (campana_id, poliza_alta_id, tipo_activo, descripcion, marca, modelo, numero_serie, 
      valor_adquisicion, vida_util_meses, tasa_depreciacion_mensual, fecha_adquisicion, direccion_ubicacion, latitud, longitud,
      es_aportacion_especie, es_comodato, estado, id_responsable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'ACTIVO', $17) RETURNING *`,
    [req.usuario.campana_id, poliza.id, d.tipo_activo, d.descripcion, d.marca || null, d.modelo || null, d.numero_serie || null,
     d.valor_adquisicion, d.vida_util_meses, tasaMensual, d.fecha_adquisicion, d.direccion_ubicacion || null,
     d.latitud || null, d.longitud || null, d.es_aportacion_especie, d.es_comodato, req.usuario.sub]
  );

  res.status(201).json({ ok: true, data: activo });
});

// ══════════════════════════════════════════════════════════════
// TOPES DE GASTO (por tipo de elección, distrito, municipio)
// ══════════════════════════════════════════════════════════════

router.get('/topes', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM topes_gasto WHERE campana_id = $1 AND activo = TRUE',
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: rows });
});

router.post('/topes', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'encargado_finanzas'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso' });
  }

  const esquemaTope = z.object({
    tipo_eleccion: z.string().min(3),
    entidad_federativa: z.string().max(100),
    distrito_electoral: z.number().int().optional(),
    municipio: z.string().max(100).optional(),
    monto_tope: z.number().positive(),
    acuerdo_ine: z.string().max(100),
  });

  const parseado = esquemaTope.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });

  const d = parseado.data;
  
  const { rows: [tope] } = await query(
    `INSERT INTO topes_gasto (campana_id, proceso_electoral, tipo_eleccion, entidad_federativa, distrito_electoral, municipio, monto_tope, tipo_tope, acuerdo_ine)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.usuario.campana_id, '2026-2027', d.tipo_eleccion, d.entidad_federativa, d.distrito_electoral || null, 
     d.municipio || null, d.monto_tope, d.distrito_electoral ? 'POR_DISTRITO' : d.municipio ? 'POR_MUNICIPIO' : 'NACIONAL', 
     d.acuerdo_ine]
  );

  res.status(201).json({ ok: true, data: tope });
});

// ══════════════════════════════════════════════════════════════
// REPRESENTANTES DE CASILLA Y CEP
// ══════════════════════════════════════════════════════════════

router.get('/representantes', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM representantes_casilla WHERE campana_id = $1 ORDER BY seccion_electoral, casilla`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: rows });
});

const esquemaRepresentante = z.object({
  clave_elector: z.string().length(18),
  nombre_completo: z.string().min(3).max(300),
  tipo: z.enum(['GENERAL', 'ANTE_MESA_DIRECTIVA']),
  distrito_electoral: z.number().int(),
  seccion_electoral: z.number().int(),
  casilla: z.string().max(50),
  monto_provisionado: z.number().nonnegative().default(0),
  tipo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'GRATUIDAD']).default('TRANSFERENCIA'),
});

router.post('/representantes', async (req, res) => {
  const parseado = esquemaRepresentante.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });

  const d = parseado.data;
  
  const { rows: [rep] } = await query(
    `INSERT INTO representantes_casilla (campana_id, clave_elector, nombre_completo, tipo, distrito_electoral, seccion_electoral, casilla, monto_provisionado, tipo_pago, estatus_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDIENTE') RETURNING *`,
    [req.usuario.campana_id, d.clave_elector, d.nombre_completo, d.tipo, d.distrito_electoral, d.seccion_electoral, 
     d.casilla, d.monto_provisionado, d.tipo_pago]
  );

  res.status(201).json({ ok: true, data: rep });
});

/**
 * POST /api/finanzas/representantes/:id/cep
 * Generar Comprobante Electrónico de Pago
 */
router.post('/representantes/:id/cep', async (req, res) => {
  const { rows: [rep] } = await query(
    'SELECT * FROM representantes_casilla WHERE id = $1 AND campana_id = $2',
    [req.params.id, req.usuario.campana_id]
  );
  if (!rep) return res.status(404).json({ ok: false, error: 'Representante no encontrado' });

  // Generar folio CEP
  const folioCEP = `CEP-${Date.now()}-${rep.id.toString().slice(0, 8)}`;
  
  // TODO: Firmar con e.firma del responsable de finanzas
  // Por ahora, mock de firma
  const firmaMock = `FIRMA-${crypto.randomBytes(32).toString('hex')}`;

  const { rows: [cep] } = await query(
    `INSERT INTO comprobantes_cep (representante_id, campana_id, folio_cep, monto, es_gratuidad, fecha_generacion, firma_electronica_responsable)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING *`,
    [rep.id, req.usuario.campana_id, folioCEP, rep.monto_provisionado, rep.tipo_pago === 'GRATUIDAD', firmaMock]
  );

  // Actualizar representante
  await query(
    'UPDATE representantes_casilla SET cep_generado = TRUE, fecha_cep = NOW(), estatus_pago = $1 WHERE id = $2',
    [rep.tipo_pago === 'GRATUIDAD' ? 'NO_APLICA' : 'PAGADO', rep.id]
  );

  res.json({ ok: true, data: cep });
});

// ══════════════════════════════════════════════════════════════
// VISTA DE GASTOS VS TOPE (para el dashboard)
// ══════════════════════════════════════════════════════════════

router.get('/resumen-ine', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  // Obtener tope activo
  const { rows: [tope] } = await query(
    'SELECT * FROM topes_gasto WHERE campana_id = $1 AND activo = TRUE LIMIT 1',
    [campanaId]
  );

  // Gastos desde pólizas (nuevo sistema INE)
  const { rows: polizasData } = await query(
    `SELECT COALESCE(SUM(total_cargos), 0) as total
     FROM polizas
     WHERE campana_id = $1 AND estatus IN ('COMPROBADA', 'APROBADA') AND tipo_poliza IN ('EGRESO', 'DIARIO')`,
    [campanaId]
  );

  // Gastos desde sistema antiguo (compatibilidad)
  const { rows: gastosAntiguos } = await query(
    'SELECT COALESCE(SUM(monto), 0) as total FROM gastos_campana WHERE campana_id = $1',
    [campanaId]
  );

  const totalGastosINE = parseFloat(polizasData[0]?.total || 0);
  const totalGastosAntiguo = parseFloat(gastosAntiguos[0]?.total || 0);
  const totalGastado = totalGastosINE + totalGastosAntiguo;

  const topeMonto = tope ? parseFloat(tope.monto_tope) : null;
  const porcentajeUsado = topeMonto ? +((totalGastado / topeMonto) * 100).toFixed(1) : null;

  let nivelAlertaTope = 'ok';
  if (porcentajeUsado != null) {
    if (porcentajeUsado >= 100) nivelAlertaTope = 'rebasado';
    else if (porcentajeUsado >= 95) nivelAlertaTope = 'critico';
    else if (porcentajeUsado >= 85) nivelAlertaTope = 'alto';
    else if (porcentajeUsado >= 70) nivelAlertaTope = 'medio';
  }

  // Eventos próximos
  const { rows: eventosProximos } = await query(
    `SELECT * FROM agenda_eventos 
     WHERE campana_id = $1 AND fecha_evento >= CURRENT_DATE 
     ORDER BY fecha_evento LIMIT 5`,
    [campanaId]
  );

  // Activos fijos
  const { rows: activos } = await query(
    `SELECT * FROM activos_fijos WHERE campana_id = $1 AND estado = 'ACTIVO'`,
    [campanaId]
  );

  res.json({
    ok: true,
    data: {
      tope: tope || null,
      total_gastado: totalGastado,
      total_gastos_ine: totalGastosINE,
      total_gastos_antiguo: totalGastosAntiguo,
      porcentaje_usado: porcentajeUsado,
      nivel_alerta_tope: nivelAlertaTope,
      disponible: topeMonto ? topeMonto - totalGastado : null,
      eventos_proximos: eventosProximos,
      activos_fijos: activos,
      representantes_pendientes: 0, // TODO: contar
    }
  });
});

// ══════════════════════════════════════════════════════════════
// MANTENER COMPATIBILIDAD: Endpoints antiguos (gastos_campana)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/finanzas (ANTIGUO — mantener por compatibilidad)
 */
router.get('/', async (req, res) => {
  const [gastos, ingresos, campana] = await Promise.all([
    query(
      `SELECT g.*, u.nombre as registrado_por_nombre FROM gastos_campana g
       LEFT JOIN usuarios u ON u.id = g.registrado_por
       WHERE g.campana_id=$1 ORDER BY g.fecha DESC`,
      [req.usuario.campana_id]
    ),
    query(
      `SELECT i.*, u.nombre as registrado_por_nombre FROM ingresos_campana i
       LEFT JOIN usuarios u ON u.id = i.registrado_por
       WHERE i.campana_id=$1 ORDER BY i.fecha DESC`,
      [req.usuario.campana_id]
    ),
    query('SELECT tope_gasto_ople FROM campanas WHERE id=$1', [req.usuario.campana_id]),
  ]);

  const totalGastado = gastos.rows.reduce((s, g) => s + parseFloat(g.monto), 0);
  const totalIngresos = ingresos.rows.reduce((s, i) => s + parseFloat(i.monto), 0);
  const tope = campana.rows[0]?.tope_gasto_ople ? parseFloat(campana.rows[0].tope_gasto_ople) : null;
  const sinComprobante = gastos.rows.filter((g) => !g.tipo_comprobante || g.tipo_comprobante === 'sin_comprobante').length;
  const porcentajeUsado = tope ? +((totalGastado / tope) * 100).toFixed(1) : null;

  let nivelAlertaTope = 'ok';
  if (porcentajeUsado != null) {
    if (porcentajeUsado >= 100) nivelAlertaTope = 'rebasado';
    else if (porcentajeUsado >= 95) nivelAlertaTope = 'critico';
    else if (porcentajeUsado >= 85) nivelAlertaTope = 'alto';
    else if (porcentajeUsado >= 70) nivelAlertaTope = 'medio';
  }

  res.json({
    ok: true,
    data: gastos.rows,
    ingresos: ingresos.rows,
    resumen: {
      total_gastado: totalGastado,
      total_ingresos: totalIngresos,
      balance: totalIngresos - totalGastado,
      tope_ople: tope,
      disponible: tope ? tope - totalGastado : null,
      porcentaje_usado: porcentajeUsado,
      nivel_alerta_tope: nivelAlertaTope,
      gastos_sin_comprobante: sinComprobante,
    },
  });
});

const esquemaGasto = z.object({
  categoria: z.string().min(2).max(40),
  descripcion: z.string().min(2).max(300),
  monto: z.number().positive(),
  fecha: z.string(),
  proveedor: z.string().max(200).optional(),
  rfc: z.string().max(20).optional(),
  factura_uuid: z.string().max(100).optional(),
  forma_pago: z.enum(['transferencia', 'cheque', 'efectivo', 'tarjeta']).default('transferencia'),
  tipo_comprobante: z.enum(['factura', 'nota', 'recibo', 'sin_comprobante']).default('sin_comprobante'),
  numero_comprobante: z.string().max(100).optional(),
  utilitario_tipo: z.string().max(100).optional(),
  utilitario_cantidad: z.number().int().positive().optional(),
  utilitario_activo_id: z.string().uuid().optional(),
});

router.post('/', async (req, res) => {
  const parseado = esquemaGasto.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  let activoId = null;
  if (d.categoria === 'utilitarios' && d.utilitario_cantidad) {
    if (d.utilitario_activo_id) {
      const actualizado = await query(
        `UPDATE activos SET cantidad = COALESCE(cantidad,0) + $1 WHERE id=$2 AND campana_id=$3 RETURNING id`,
        [d.utilitario_cantidad, d.utilitario_activo_id, req.usuario.campana_id]
      );
      activoId = actualizado.rows[0]?.id || null;
    } else if (d.utilitario_tipo) {
      const nuevo = await query(
        `INSERT INTO activos (campana_id, tipo, subtipo, direccion, cantidad, costo, fecha_ini, registrado_por)
         VALUES ($1,'utilitario',$2,$2,$3,$4,$5,$6) RETURNING id`,
        [req.usuario.campana_id, d.utilitario_tipo, d.utilitario_cantidad, d.monto, d.fecha, req.usuario.sub]
      );
      activoId = nuevo.rows[0].id;
    }
  }

  const resultado = await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, rfc, factura_uuid, forma_pago, tipo_comprobante, numero_comprobante, registrado_por, activo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.usuario.campana_id, d.categoria, d.descripcion, d.monto, d.fecha,
     d.proveedor || null, d.rfc || null, d.factura_uuid || null, d.forma_pago,
     d.tipo_comprobante, d.numero_comprobante || null, req.usuario.sub, activoId]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'gastos_campana', registroId: resultado.rows[0].id,
    detalle: { categoria: d.categoria, monto: d.monto, proveedor: d.proveedor },
    ip: req.ip,
  });

  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.post('/:id/evidencia', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor.' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  const ruta = `${req.usuario.campana_id}/comprobantes/${crypto.randomBytes(8).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto' });

  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
  await query('UPDATE gastos_campana SET evidencia_url=$1 WHERE id=$2 AND campana_id=$3', [urlData.publicUrl, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true, data: { evidencia_url: urlData.publicUrl } });
});

const esquemaIngreso = z.object({
  tipo_ingreso: z.enum(['aportacion_efectivo', 'aportacion_especie', 'autofinanciamiento', 'financiamiento_publico', 'rendimientos_financieros']),
  aportante_nombre: z.string().max(200).optional(),
  aportante_identificacion: z.string().max(30).optional(),
  monto: z.number().positive(),
  fecha: z.string(),
  forma_recepcion: z.enum(['efectivo', 'transferencia', 'cheque', 'especie']).default('transferencia'),
  descripcion_especie: z.string().max(300).optional(),
  numero_recibo: z.string().max(100).optional(),
  tipo_persona: z.enum(['fisica_no_militante', 'fisica_militante', 'gobierno', 'extranjero', 'iglesia_o_culto', 'empresa_mercantil', 'organismo_internacional', 'anonimo']).default('fisica_no_militante'),
});

router.post('/ingresos', async (req, res) => {
  const parseado = esquemaIngreso.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;

  const resultado = await query(
    `INSERT INTO ingresos_campana (campana_id, tipo_ingreso, aportante_nombre, aportante_identificacion, monto, fecha, forma_recepcion, descripcion_especie, numero_recibo, registrado_por, tipo_persona)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.usuario.campana_id, d.tipo_ingreso, d.aportante_nombre || null, d.aportante_identificacion || null,
     d.monto, d.fecha, d.forma_recepcion, d.descripcion_especie || null, d.numero_recibo || null, req.usuario.sub, d.tipo_persona]
  );

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'crear', tabla: 'ingresos_campana', registroId: resultado.rows[0].id,
    detalle: { tipo_ingreso: d.tipo_ingreso, monto: d.monto, aportante: d.aportante_nombre },
    ip: req.ip,
  });

  const alertaFuenteProhibida = FUENTES_PROHIBIDAS.includes(d.tipo_persona)
    ? `⚠️ Declaraste esta aportación como "${d.tipo_persona.replace(/_/g, ' ')}" — el Art. 54 de la Ley General de Partidos Políticos PROHÍBE este tipo de financiamiento a campañas. Consulta con tu equipo jurídico antes de usar estos recursos.`
    : null;

  res.status(201).json({ ok: true, data: resultado.rows[0], alerta_fuente_prohibida: alertaFuenteProhibida });
});

router.post('/ingresos/:id/evidencia', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor.' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });

  const ruta = `${req.usuario.campana_id}/recibos-aportacion/${crypto.randomBytes(8).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo subir la foto' });

  const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(ruta);
  await query('UPDATE ingresos_campana SET evidencia_url=$1 WHERE id=$2 AND campana_id=$3', [urlData.publicUrl, req.params.id, req.usuario.campana_id]);
  res.json({ ok: true, data: { evidencia_url: urlData.publicUrl } });
});

router.delete('/ingresos/:id', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'encargado_finanzas'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para borrar ingresos' });
  }
  await query('DELETE FROM ingresos_campana WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

router.put('/tope', async (req, res) => {
  const tope = parseFloat(req.body.tope);
  if (isNaN(tope) || tope <= 0) return res.status(400).json({ ok: false, error: 'Tope inválido' });
  await query('UPDATE campanas SET tope_gasto_ople=$1 WHERE id=$2', [tope, req.usuario.campana_id]);
  res.json({ ok: true });
});

export default router;

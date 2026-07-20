import { Router } from 'express';
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

// A diferencia de fotos.js, aquí NO se comprime con sharp — un PDF o
// un .docx no es una imagen, comprimirlo así lo dejaría inservible.
// Se sube tal cual, solo limitando el tamaño de entrada.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — suficiente para un PDF escaneado
});

const CATEGORIAS_VALIDAS = ['ine', 'nombramiento', 'acta', 'contrato', 'oficio', 'otro'];

/**
 * GET /api/documentos
 * Lista todos los documentos de la campaña, opcionalmente filtrados
 * por categoría.
 */
router.get('/', async (req, res) => {
  const filtroCategoria = req.query.categoria ? 'AND d.categoria=$2' : '';
  const params = req.query.categoria ? [req.usuario.campana_id, req.query.categoria] : [req.usuario.campana_id];
  const resultado = await query(
    `SELECT d.*, u.nombre as subido_por_nombre FROM documentos d
     LEFT JOIN usuarios u ON u.id = d.subido_por
     WHERE d.campana_id=$1 ${filtroCategoria} ORDER BY d.creado_en DESC`,
    params
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * POST /api/documentos/subir
 * Campos: archivo, categoria, nombre (nombre descriptivo, ej. "Nombramiento de Juan Pérez")
 */
router.post('/subir', upload.single('archivo'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado. Agrega SUPABASE_URL y SUPABASE_SERVICE_KEY en el servidor.' });
  }
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });

  const { categoria, nombre } = req.body;
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    return res.status(400).json({ ok: false, error: 'Categoría inválida' });
  }

  try {
    const extension = req.file.originalname.split('.').pop();
    const rutaStorage = `${req.usuario.campana_id}/${categoria}/${crypto.randomBytes(8).toString('hex')}.${extension}`;

    const { error: errorSubida } = await supabase.storage
      .from('documentos')
      .upload(rutaStorage, req.file.buffer, { contentType: req.file.mimetype });
    if (errorSubida) throw errorSubida;

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(rutaStorage);

    const documento = await query(
      `INSERT INTO documentos (campana_id, categoria, nombre, nombre_archivo_original, url, tamano_kb, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.usuario.campana_id, categoria, nombre || req.file.originalname, req.file.originalname,
       urlData.publicUrl, Math.round(req.file.buffer.length / 1024), req.usuario.sub]
    );

    res.status(201).json({ ok: true, data: documento.rows[0] });
  } catch (e) {
    console.error('Error subiendo documento:', e);
    res.status(500).json({ ok: false, error: 'No se pudo subir el documento. Intenta de nuevo.' });
  }
});

/**
 * DELETE /api/documentos/:id
 * Solo altos mandos pueden borrar documentos — es información legal
 * de la campaña, no algo que cualquiera deba poder eliminar.
 */
router.delete('/:id', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden borrar documentos' });
  }
  const doc = await query('SELECT * FROM documentos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!doc.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  await query('DELETE FROM documentos WHERE id=$1', [req.params.id]);

  registrarAuditoria({
    campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
    accion: 'eliminar', tabla: 'documentos', registroId: req.params.id,
    detalle: { nombre: doc.rows[0].nombre, categoria: doc.rows[0].categoria },
    ip: req.ip,
  });

  res.json({ ok: true });
});

export default router;

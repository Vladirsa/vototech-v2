import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// Supabase Storage: usa el MISMO proyecto de Supabase que la base de
// datos — no hay que contratar nada nuevo. Solo se necesitan 2
// variables de entorno más (SUPABASE_URL y SUPABASE_SERVICE_KEY).
function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// multer en memoria: la foto llega, se comprime, se sube — nunca
// toca el disco del servidor (importante en Render, que no tiene
// disco persistente en el plan gratuito)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // máx 15MB de entrada (las fotos de celular modernas)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (las fotos de tu celular). Videos: disponible en planes superiores.'));
  },
});

const LIMITES = {
  incidencia: 5,   // máximo 5 fotos por incidencia
  acta: 3,         // hasta 3 actas por casilla (elecciones concurrentes: Ayto + Dip Local + Gubernatura)
  casa: 1,         // 1 foto por casa (evidencia de visita)
};

/**
 * POST /api/fotos/subir
 * Sube una foto, la comprime automáticamente (una foto de celular de
 * 8MB queda en ~300-500KB sin perder legibilidad), y devuelve la URL.
 *
 * Campos del formulario:
 * - foto: el archivo
 * - contexto: 'incidencia' | 'acta' | 'casa'
 * - referencia_id: el id del registro al que pertenece
 */
router.post('/subir', upload.single('foto'), async (req, res) => {
  const supabase = clienteSupabase();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Almacenamiento de fotos no configurado. Agrega SUPABASE_URL y SUPABASE_SERVICE_KEY en el servidor.' });
  }

  const { contexto, referencia_id } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ninguna foto' });
  if (!LIMITES[contexto]) return res.status(400).json({ ok: false, error: 'Contexto inválido' });

  try {
    // Verificar límite de fotos para este registro
    const existentes = await query(
      'SELECT COUNT(*) as total FROM fotos WHERE campana_id=$1 AND contexto=$2 AND referencia_id=$3',
      [req.usuario.campana_id, contexto, referencia_id]
    );
    if (parseInt(existentes.rows[0].total) >= LIMITES[contexto]) {
      return res.status(400).json({ ok: false, error: `Máximo ${LIMITES[contexto]} foto(s) para este registro` });
    }

    // Comprimir: max 1600px del lado largo, JPEG calidad 78 — un acta
    // sigue siendo perfectamente legible y pesa 20 veces menos
    const comprimida = await sharp(req.file.buffer)
      .rotate() // respeta la orientación EXIF del celular
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();

    const nombre = `${req.usuario.campana_id}/${contexto}/${referencia_id}/${crypto.randomBytes(8).toString('hex')}.jpg`;

    const { error: errorSubida } = await supabase.storage
      .from('fotos')
      .upload(nombre, comprimida, { contentType: 'image/jpeg' });
    if (errorSubida) throw errorSubida;

    const { data: urlData } = supabase.storage.from('fotos').getPublicUrl(nombre);
    const url = urlData.publicUrl;

    // Guardar el registro de la foto en la BD
    const foto = await query(
      `INSERT INTO fotos (campana_id, contexto, referencia_id, url, subido_por, peso_kb)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.usuario.campana_id, contexto, referencia_id, url, req.usuario.sub, Math.round(comprimida.length / 1024)]
    );

    res.status(201).json({ ok: true, data: foto.rows[0] });
  } catch (e) {
    console.error('Error subiendo foto:', e);
    res.status(500).json({ ok: false, error: 'No se pudo subir la foto. Intenta de nuevo.' });
  }
});

/**
 * GET /api/fotos/:contexto/:referenciaId
 * Lista las fotos de un registro específico.
 */
router.get('/:contexto/:referenciaId', async (req, res) => {
  const resultado = await query(
    `SELECT f.*, u.nombre as subido_por_nombre FROM fotos f
     JOIN usuarios u ON u.id = f.subido_por
     WHERE f.campana_id=$1 AND f.contexto=$2 AND f.referencia_id=$3
     ORDER BY f.creado_en`,
    [req.usuario.campana_id, req.params.contexto, req.params.referenciaId]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.delete('/:id', async (req, res) => {
  const foto = await query('SELECT * FROM fotos WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!foto.rows[0]) return res.status(404).json({ ok: false, error: 'Foto no encontrada' });

  const supabase = clienteSupabase();
  if (supabase) {
    // Extraer la ruta interna del archivo desde la URL pública
    const ruta = foto.rows[0].url.split('/fotos/')[1];
    if (ruta) await supabase.storage.from('fotos').remove([ruta]);
  }
  await query('DELETE FROM fotos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';

const router = Router();

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function generarSlug(titulo) {
  return titulo
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 200);
}

/** Sube cualquier imagen (portada, o insertada dentro de un artículo) a Storage y regresa su URL pública. */
async function subirImagenAStorage(archivo) {
  const supabase = clienteSupabase();
  if (!supabase) throw new Error('Almacenamiento no configurado en el servidor');
  const ruta = `blog/imagenes/${crypto.randomBytes(8).toString('hex')}-${archivo.originalname}`;
  const { error } = await supabase.storage.from('documentos').upload(ruta, archivo.buffer, { contentType: archivo.mimetype });
  if (error) throw new Error('No se pudo subir la imagen: ' + error.message);
  return supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
}

const esquemaPublicacion = z.object({
  titulo: z.string({ required_error: 'Falta el título' }).min(5, 'El título es muy corto').max(200),
  tipo: z.enum(['articulo', 'pdf', 'video']).default('articulo'),
  resumen: z.string().max(300).optional(),
  contenido: z.string().optional(),
  url_video: z.preprocess((v) => (v === '' ? undefined : v), z.string().url('El link del video no es válido').optional()),
  imagen_portada: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  etiquetas: z.array(z.string()).default([]),
  meta_titulo: z.string().max(200).optional(),
  meta_descripcion: z.string().max(300).optional(),
  publicado: z.boolean().default(false),
});

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN — protegido con la misma clave del Panel de Admin
// ══════════════════════════════════════════════════════════

/** GET /api/blog/admin — todas las publicaciones, publicadas o no, para el panel */
router.get('/admin', requiereSuperAdmin, async (req, res) => {
  const r = await query('SELECT * FROM blog_publicaciones ORDER BY creado_en DESC');
  res.json({ ok: true, data: r.rows });
});

/**
 * 🆕 POST /api/blog/admin/subir-imagen
 * Sube UNA imagen (portada, o para insertar dentro del cuerpo del
 * artículo) y regresa su URL — no crea ni edita ninguna publicación,
 * solo sube el archivo. El panel usa esto tanto para la portada
 * como para el botón "📷 Insertar imagen" dentro del editor.
 */
router.post('/admin/subir-imagen', requiereSuperAdmin, upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo de imagen' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ ok: false, error: 'El archivo debe ser una imagen (jpg, png, webp, etc.)' });
  try {
    const url = await subirImagenAStorage(req.file);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/blog/admin
 * Crea una publicación nueva. Si es tipo "pdf", espera el archivo en
 * el campo "archivo" (multipart/form-data). La imagen de portada
 * (opcional, cualquier tipo) va en el campo "imagen_portada_archivo".
 */
router.post('/admin', requiereSuperAdmin, upload.fields([{ name: 'archivo', maxCount: 1 }, { name: 'imagen_portada_archivo', maxCount: 1 }]), async (req, res) => {
  const cuerpo = { ...req.body };
  if (typeof cuerpo.etiquetas === 'string') {
    cuerpo.etiquetas = cuerpo.etiquetas.split(',').map((e) => e.trim()).filter(Boolean);
  }
  if (typeof cuerpo.publicado === 'string') cuerpo.publicado = cuerpo.publicado === 'true';

  const parseado = esquemaPublicacion.safeParse(cuerpo);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  const archivoPdf = req.files?.archivo?.[0];
  const archivoImagenPortada = req.files?.imagen_portada_archivo?.[0];

  let urlArchivo = d.url_video || null;
  if (d.tipo === 'pdf') {
    if (!archivoPdf) return res.status(400).json({ ok: false, error: 'Falta subir el archivo PDF' });
    const supabase = clienteSupabase();
    if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado en el servidor' });
    const ruta = `blog/${crypto.randomBytes(8).toString('hex')}-${archivoPdf.originalname}`;
    const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, archivoPdf.buffer, { contentType: archivoPdf.mimetype });
    if (errorSubida) return res.status(500).json({ ok: false, error: 'No se pudo subir el PDF' });
    urlArchivo = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
  }

  // 🆕 Imagen de portada — ya sea que la subieron como archivo, o
  // (formato anterior) pegaron directo una URL.
  let imagenPortada = d.imagen_portada || null;
  if (archivoImagenPortada) {
    try {
      imagenPortada = await subirImagenAStorage(archivoImagenPortada);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  let slugBase = generarSlug(d.titulo);
  let slug = slugBase;
  let intento = 1;
  while ((await query('SELECT 1 FROM blog_publicaciones WHERE slug=$1', [slug])).rows[0]) {
    slug = `${slugBase}-${++intento}`;
  }

  const resultado = await query(
    `INSERT INTO blog_publicaciones
      (titulo, slug, tipo, resumen, contenido, url_archivo, imagen_portada, etiquetas, meta_titulo, meta_descripcion, publicado, fecha_publicacion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.titulo, slug, d.tipo, d.resumen || null, d.contenido || null, urlArchivo, imagenPortada,
     d.etiquetas, d.meta_titulo || null, d.meta_descripcion || null, d.publicado, d.publicado ? new Date() : null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

/** PATCH /api/blog/admin/:id — editar o publicar/despublicar */
router.patch('/admin/:id', requiereSuperAdmin, upload.fields([{ name: 'archivo', maxCount: 1 }, { name: 'imagen_portada_archivo', maxCount: 1 }]), async (req, res) => {
  const cuerpo = { ...req.body };
  if (typeof cuerpo.etiquetas === 'string') {
    cuerpo.etiquetas = cuerpo.etiquetas.split(',').map((e) => e.trim()).filter(Boolean);
  }
  if (typeof cuerpo.publicado === 'string') cuerpo.publicado = cuerpo.publicado === 'true';

  const actual = await query('SELECT * FROM blog_publicaciones WHERE id=$1', [req.params.id]);
  if (!actual.rows[0]) return res.status(404).json({ ok: false, error: 'Publicación no encontrada' });

  const archivoPdf = req.files?.archivo?.[0];
  const archivoImagenPortada = req.files?.imagen_portada_archivo?.[0];

  let urlArchivo = cuerpo.url_video || actual.rows[0].url_archivo;
  if (archivoPdf) {
    const supabase = clienteSupabase();
    if (!supabase) return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
    const ruta = `blog/${crypto.randomBytes(8).toString('hex')}-${archivoPdf.originalname}`;
    const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, archivoPdf.buffer, { contentType: archivoPdf.mimetype });
    if (errorSubida) return res.status(500).json({ ok: false, error: 'No se pudo subir el archivo' });
    urlArchivo = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
  }

  // 🆕 Imagen de portada nueva (si subieron una) — si no, se conserva la que ya había
  let imagenPortada = cuerpo.imagen_portada || actual.rows[0].imagen_portada;
  if (archivoImagenPortada) {
    try {
      imagenPortada = await subirImagenAStorage(archivoImagenPortada);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  const seVaAPublicar = cuerpo.publicado === true;

  const resultado = await query(
    `UPDATE blog_publicaciones SET
       titulo=COALESCE($1,titulo), resumen=COALESCE($2,resumen), contenido=COALESCE($3,contenido),
       url_archivo=$4, imagen_portada=$5, etiquetas=COALESCE($6,etiquetas),
       meta_titulo=COALESCE($7,meta_titulo), meta_descripcion=COALESCE($8,meta_descripcion),
       publicado=COALESCE($9,publicado),
       fecha_publicacion=CASE WHEN $9=true AND fecha_publicacion IS NULL THEN now() ELSE fecha_publicacion END,
       actualizado_en=now()
     WHERE id=$10 RETURNING *`,
    [cuerpo.titulo, cuerpo.resumen, cuerpo.contenido, urlArchivo, imagenPortada,
     cuerpo.etiquetas, cuerpo.meta_titulo, cuerpo.meta_descripcion, cuerpo.publicado, req.params.id]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});

/** DELETE /api/blog/admin/:id */
router.delete('/admin/:id', requiereSuperAdmin, async (req, res) => {
  await query('DELETE FROM blog_publicaciones WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════
// PÚBLICAS — sin autenticación, para vototech.com.mx/blog
// ══════════════════════════════════════════════════════════

/** GET /api/blog?etiqueta=X — lista de publicaciones publicadas */
router.get('/', async (req, res) => {
  const { etiqueta } = req.query;
  const params = [];
  let filtroEtiqueta = '';
  if (etiqueta) { params.push(etiqueta); filtroEtiqueta = `AND $${params.length} = ANY(etiquetas)`; }
  const r = await query(
    `SELECT id, titulo, slug, tipo, resumen, imagen_portada, etiquetas, fecha_publicacion, vistas
     FROM blog_publicaciones WHERE publicado=true ${filtroEtiqueta}
     ORDER BY fecha_publicacion DESC LIMIT 100`,
    params
  );
  res.json({ ok: true, data: r.rows });
});

/** GET /api/blog/:slug — una publicación completa, cuenta la vista */
router.get('/:slug', async (req, res) => {
  const r = await query('SELECT * FROM blog_publicaciones WHERE slug=$1 AND publicado=true', [req.params.slug]);
  if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });
  query('UPDATE blog_publicaciones SET vistas=vistas+1 WHERE id=$1', [r.rows[0].id]).catch(() => {});
  res.json({ ok: true, data: r.rows[0] });
});

export default router;

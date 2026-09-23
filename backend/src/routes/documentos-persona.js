import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { subirPrivado, enlaceParaVer, TIPOS_DOCUMENTO_PERMITIDOS } from '../lib/almacenamientoPrivado.js';

/**
 * 🔒 Documentos personales (INE, acta de nacimiento, comprobante de
 * domicilio) — antes CUALQUIER usuario con sesión, hasta un promotor,
 * podía ver o reemplazar los del candidato. Ahora solo:
 *  - candidato, jefe de campaña, coord. general y encargado jurídico;
 *  - o la propia persona, para sus propios documentos.
 */
const ROLES_DOCUMENTOS = ['candidato', 'jefe_campana', 'coord_general', 'encargado_juridico'];
const puedeVerDocumentosDe = (usuario, usuarioId) => ROLES_DOCUMENTOS.includes(usuario.rol) || usuario.sub === usuarioId;
const SIN_PERMISO = { ok: false, error: 'Solo el candidato, el jefe de campaña, jurídico o la propia persona pueden ver estos documentos.' };

const router = Router();
router.use(requiereAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const clienteSupabase = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
};

/**
 * 🆕 Catálogo de documentos por rol — investigado directo con fuentes
 * del INE (portal de credencial, requisitos de registro de
 * candidaturas) y la LGIPE (Art. 259, 397, Lineamientos de Registro
 * de Representantes). No es asesoría legal — es una lista de apoyo
 * para no llegar sin algo el día que se necesite.
 */
const DOCUMENTOS_POR_ROL = {
  candidato: [
    { tipo: 'acta_nacimiento', label: 'Acta de nacimiento' },
    { tipo: 'identificacion', label: 'Identificación oficial vigente (credencial INE)' },
    { tipo: 'comprobante_domicilio', label: 'Comprobante de domicilio (no mayor a 3 meses)' },
    { tipo: 'constancia_residencia', label: 'Constancia de residencia (si tu domicilio no coincide con el de tu credencial)' },
  ],
  representante_casilla: [
    { tipo: 'identificacion', label: 'Identificación oficial vigente (credencial INE)' },
    { tipo: 'clave_elector', label: 'Clave de elector registrada' },
    { tipo: 'comprobante_domicilio', label: 'Domicilio confirmado (para el nombramiento)' },
    { tipo: 'nombramiento_firmado', label: 'Nombramiento firmado (se puede firmar hasta antes de acreditarse en la casilla, Art. 261 LGIPE)' },
  ],
};

/**
 * GET /api/documentos-persona/:usuarioId
 * El checklist completo de una persona — con los documentos que le
 * tocan según su rol, y cuáles ya se marcaron como entregados.
 */
router.get('/:usuarioId', async (req, res) => {
  if (!puedeVerDocumentosDe(req.usuario, req.params.usuarioId)) return res.status(403).json(SIN_PERMISO);
  const usuarioRes = await query('SELECT id, nombre, rol FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  if (!usuarioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });
  const persona = usuarioRes.rows[0];

  const plantilla = DOCUMENTOS_POR_ROL[persona.rol] || [];
  const existentesRes = await query('SELECT * FROM documentos_persona WHERE usuario_id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  const existentesPorTipo = {};
  existentesRes.rows.forEach((d) => { existentesPorTipo[d.tipo_documento] = d; });

  // 🔒 Los archivos privados se entregan como enlace temporal (5 min).
  const checklist = await Promise.all(plantilla.map(async (doc) => ({
    ...doc,
    entregado: existentesPorTipo[doc.tipo]?.entregado || false,
    archivo_url: await enlaceParaVer(existentesPorTipo[doc.tipo]?.archivo_url),
    notas: existentesPorTipo[doc.tipo]?.notas || null,
  })));

  res.json({
    ok: true,
    data: {
      persona,
      checklist,
      completo: checklist.length > 0 && checklist.every((d) => d.entregado),
      faltantes: checklist.filter((d) => !d.entregado).length,
    },
  });
});

/**
 * 🆕 POST /api/documentos-persona/:usuarioId/:tipoDocumento/subir
 * Sube el archivo real (foto o PDF escaneado) de un documento del
 * checklist — antes solo se podía marcar la casilla de "entregado",
 * sin ningún lugar para guardar el archivo físico. Al subir, se
 * marca "entregado" automáticamente.
 */
router.post('/:usuarioId/:tipoDocumento/subir', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
  if (!puedeVerDocumentosDe(req.usuario, req.params.usuarioId)) return res.status(403).json(SIN_PERMISO);
  if (!TIPOS_DOCUMENTO_PERMITIDOS.includes(req.file.mimetype)) {
    return res.status(400).json({ ok: false, error: 'Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.' });
  }
  const usuarioRes = await query('SELECT id FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  if (!usuarioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });

  // 🔒 Tipo de documento y extensión solo con letras/números/guion —
  // antes se usaban tal cual en la ruta del archivo, y con "../" se
  // podía escribir fuera de la carpeta de la campaña.
  if (!/^[a-z0-9_-]{1,40}$/i.test(req.params.tipoDocumento)) {
    return res.status(400).json({ ok: false, error: 'Tipo de documento inválido' });
  }
  const extensionCruda = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const extension = /^[a-z0-9]{1,5}$/.test(extensionCruda) ? extensionCruda : 'bin';
  const ruta = `${req.usuario.campana_id}/documentos-persona/${req.params.usuarioId}/${req.params.tipoDocumento}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  // 🔒 A la carpeta PRIVADA (antes a una pública, con enlace permanente).
  const archivoUrl = await subirPrivado(ruta, req.file.buffer, req.file.mimetype);
  if (!archivoUrl) return res.status(500).json({ ok: false, error: 'No se pudo subir el archivo' });

  const resultado = await query(
    `INSERT INTO documentos_persona (usuario_id, campana_id, tipo_documento, entregado, archivo_url, actualizado_por)
     VALUES ($1,$2,$3,true,$4,$5)
     ON CONFLICT (usuario_id, tipo_documento)
     DO UPDATE SET entregado=true, archivo_url=$4, actualizado_por=$5, actualizado_en=now()
     RETURNING *`,
    [req.params.usuarioId, req.usuario.campana_id, req.params.tipoDocumento, archivoUrl, req.usuario.sub]
  );
  res.json({ ok: true, data: { ...resultado.rows[0], archivo_url: await enlaceParaVer(archivoUrl) } });
});

/**
 * PATCH /api/documentos-persona/:usuarioId/:tipoDocumento
 * Marcar un documento como entregado/pendiente — con una nota
 * opcional (ej. "trae copia, falta el original").
 */
router.patch('/:usuarioId/:tipoDocumento', async (req, res) => {
  // 🔒 Ya no se acepta "archivo_url" desde fuera (antes se podía plantar
  // cualquier enlace, p. ej. uno falso de phishing, como "documento").
  const { entregado, notas } = req.body;
  if (!puedeVerDocumentosDe(req.usuario, req.params.usuarioId)) return res.status(403).json(SIN_PERMISO);
  if (!/^[a-z0-9_-]{1,40}$/i.test(req.params.tipoDocumento)) return res.status(400).json({ ok: false, error: 'Tipo de documento inválido' });

  const usuarioRes = await query('SELECT id FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  if (!usuarioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });

  const resultado = await query(
    `INSERT INTO documentos_persona (usuario_id, campana_id, tipo_documento, entregado, notas, actualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (usuario_id, tipo_documento)
     DO UPDATE SET entregado=$4, notas=$5, actualizado_por=$6, actualizado_en=now()
     RETURNING *`,
    [req.params.usuarioId, req.usuario.campana_id, req.params.tipoDocumento, !!entregado, typeof notas === 'string' ? notas.slice(0, 500) : null, req.usuario.sub]
  );
  res.json({ ok: true, data: { ...resultado.rows[0], archivo_url: await enlaceParaVer(resultado.rows[0].archivo_url) } });
});

/**
 * 🆕 GET /api/documentos-persona/resumen/faltantes
 * Para un panel general — todas las personas con documentos
 * pendientes, agrupadas, así el candidato/jefe de campaña ve de un
 * vistazo a quién le falta algo sin tener que revisar uno por uno.
 */
router.get('/resumen/faltantes', async (req, res) => {
  if (!ROLES_DOCUMENTOS.includes(req.usuario.rol)) return res.status(403).json(SIN_PERMISO);
  const personas = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios WHERE campana_id=$1 AND rol IN ('candidato', 'representante_casilla')`,
    [req.usuario.campana_id]
  );

  const resultado = [];
  for (const persona of personas.rows) {
    const plantilla = DOCUMENTOS_POR_ROL[persona.rol] || [];
    if (plantilla.length === 0) continue;
    const existentesRes = await query('SELECT tipo_documento, entregado FROM documentos_persona WHERE usuario_id=$1', [persona.id]);
    const entregados = new Set(existentesRes.rows.filter((d) => d.entregado).map((d) => d.tipo_documento));
    const faltantes = plantilla.filter((d) => !entregados.has(d.tipo)).map((d) => d.label);
    if (faltantes.length > 0) {
      resultado.push({ usuario_id: persona.id, nombre: persona.nombre, rol: persona.rol, puesto: persona.puesto, faltantes });
    }
  }

  res.json({ ok: true, data: resultado });
});

export default router;

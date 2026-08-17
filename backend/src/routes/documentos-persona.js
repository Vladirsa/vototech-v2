import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

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
  const usuarioRes = await query('SELECT id, nombre, rol FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  if (!usuarioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });
  const persona = usuarioRes.rows[0];

  const plantilla = DOCUMENTOS_POR_ROL[persona.rol] || [];
  const existentesRes = await query('SELECT * FROM documentos_persona WHERE usuario_id=$1', [req.params.usuarioId]);
  const existentesPorTipo = {};
  existentesRes.rows.forEach((d) => { existentesPorTipo[d.tipo_documento] = d; });

  const checklist = plantilla.map((doc) => ({
    ...doc,
    entregado: existentesPorTipo[doc.tipo]?.entregado || false,
    archivo_url: existentesPorTipo[doc.tipo]?.archivo_url || null,
    notas: existentesPorTipo[doc.tipo]?.notas || null,
  }));

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
 * PATCH /api/documentos-persona/:usuarioId/:tipoDocumento
 * Marcar un documento como entregado/pendiente — con una nota
 * opcional (ej. "trae copia, falta el original").
 */
router.patch('/:usuarioId/:tipoDocumento', async (req, res) => {
  const { entregado, notas, archivo_url } = req.body;

  const usuarioRes = await query('SELECT id FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.usuarioId, req.usuario.campana_id]);
  if (!usuarioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });

  const resultado = await query(
    `INSERT INTO documentos_persona (usuario_id, campana_id, tipo_documento, entregado, notas, archivo_url, actualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (usuario_id, tipo_documento)
     DO UPDATE SET entregado=$4, notas=$5, archivo_url=COALESCE($6, documentos_persona.archivo_url), actualizado_por=$7, actualizado_en=now()
     RETURNING *`,
    [req.params.usuarioId, req.usuario.campana_id, req.params.tipoDocumento, entregado ?? false, notas || null, archivo_url || null, req.usuario.sub]
  );
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * 🆕 GET /api/documentos-persona/resumen/faltantes
 * Para un panel general — todas las personas con documentos
 * pendientes, agrupadas, así el candidato/jefe de campaña ve de un
 * vistazo a quién le falta algo sin tener que revisar uno por uno.
 */
router.get('/resumen/faltantes', async (req, res) => {
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

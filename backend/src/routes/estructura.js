import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { puedeAsignarRol, puedeGestionarA, CAMPOS_EDITABLES_DE_UNO_MISMO, MENSAJE_SIN_RANGO } from '../lib/jerarquiaRoles.js';
const router = Router();
router.use(requiereAuth);

// 🔒 Nombres sin "<" ni ">" — impide esconder código dentro de un
// nombre (se mostraba en el mapa y podía robar sesiones).
const nombreSeguro = z.string().min(2).max(200).regex(/^[^<>]*$/, 'El nombre no puede contener los caracteres < o >');

/** 🔒 Rol y puesto actuales de un miembro de MI campaña (null si no existe o es de otra campaña). */
async function miembroDeMiCampana(usuarioId, campanaId) {
  const r = await query('SELECT rol, puesto FROM usuarios WHERE id=$1 AND campana_id=$2', [usuarioId, campanaId]);
  return r.rows[0] ?? null;
}

/**
 * 🔒 Confirma que un coordinador (parent_id) o región (region_id) que
 * llega en la petición pertenece a MI campaña — antes se aceptaba
 * cualquier identificador, incluso de otra campaña.
 */
async function referenciasSonDeMiCampana({ parent_id, region_id }, campanaId) {
  if (parent_id) {
    const p = await query('SELECT 1 FROM usuarios WHERE id=$1 AND campana_id=$2', [parent_id, campanaId]);
    if (!p.rows[0]) return 'El coordinador indicado no pertenece a esta campaña';
  }
  if (region_id) {
    const r = await query('SELECT 1 FROM regiones_campana WHERE id=$1 AND campana_id=$2', [region_id, campanaId]);
    if (!r.rows[0]) return 'La región indicada no pertenece a esta campaña';
  }
  return null;
}

/** 🆕 Mismas funciones de formato profesional que usa reportes.js —
 * duplicadas aquí en vez de importadas entre routers, para no acoplar
 * dos módulos que hoy son independientes entre sí. */
function iniciarPDF(res, nombreArchivo, titulo, subtitulo) {
  const doc = new PDFDocument({ margin: 40, size: 'letter', bufferPages: true });
  const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const nombreConFecha = nombreArchivo.replace(/\.pdf$/, `_${marcaTiempo}.pdf`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${nombreConFecha}`);
  doc.pipe(res);
  doc.rect(0, 0, doc.page.width, 85).fill('#1e1b4b');
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('VotoTech', 40, 22);
  doc.fontSize(13).font('Helvetica').text(titulo, 40, 46);
  if (subtitulo) doc.fontSize(9).fillColor('#c7d2fe').text(subtitulo, 40, 64);
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text(
    `Descargado: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}, ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
    doc.page.width - 260, 62, { width: 220, align: 'right' }
  );
  doc.y = 105;
  doc.fillColor('#1e293b').font('Helvetica');
  return doc;
}
function seccionPDF(doc, titulo) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(40, y + 1, 4, 14).fill('#4f46e5');
  doc.fillColor('#1e1b4b').fontSize(12).font('Helvetica-Bold').text(titulo, 52, y);
  doc.moveDown(0.6);
  doc.fillColor('#334155').fontSize(9).font('Helvetica');
}
function tablaPDF(doc, encabezados, filas, anchos) {
  const x0 = 40;
  const rowHeight = 18;
  const totalWidth = anchos.reduce((a, b) => a + b, 0);
  if (doc.y > doc.page.height - 100) doc.addPage();
  let y = doc.y;
  doc.rect(x0, y, totalWidth, rowHeight).fill('#4f46e5');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  let x = x0;
  encabezados.forEach((h, i) => { doc.text(h, x + 4, y + 5, { width: anchos[i] - 8 }); x += anchos[i]; });
  y += rowHeight;
  filas.forEach((fila, idx) => {
    if (y > doc.page.height - 60) {
      doc.addPage(); y = 50;
      doc.rect(x0, y, totalWidth, rowHeight).fill('#4f46e5');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      let xh = x0;
      encabezados.forEach((h, i) => { doc.text(h, xh + 4, y + 5, { width: anchos[i] - 8 }); xh += anchos[i]; });
      y += rowHeight;
    }
    doc.rect(x0, y, totalWidth, rowHeight).fill(idx % 2 === 0 ? '#f1f5f9' : '#ffffff');
    doc.fillColor('#1e293b').fontSize(8).font('Helvetica');
    x = x0;
    fila.forEach((celda, i) => { doc.text(String(celda ?? '—'), x + 4, y + 5, { width: anchos[i] - 8 }); x += anchos[i]; });
    y += rowHeight;
  });
  doc.y = y + 12;
}
const NIVELES = {
  jefe_campana: 1, coord_general: 2, coord_distrital: 3,
  coord_municipal: 4, coord_seccional: 5, promotor: 6,
};
const RANGO_SANO = {
  jefe_campana: [3, 10],
  coord_general: [3, 8],
  coord_distrital: [3, 8],
  coord_municipal: [3, 10],
  coord_seccional: [2, 15],
};

// ═══════════════════════════════════════════════════════════════
// 🔐 PERMISOS POR ROL — NUEVO
// Guarda solo las EXCEPCIONES al comportamiento default — si un
// rol/módulo no aparece en la tabla, se asume el default del
// sistema (esto lo resuelve el frontend / el middleware de rutas
// protegidas en cada módulo).
// ═══════════════════════════════════════════════════════════════
router.get('/permisos', async (req, res) => {
  const r = await query(
    'SELECT rol, modulo, permitido FROM permisos_personalizados WHERE campana_id=$1',
    [req.usuario.campana_id]
  );
  const resultado = {};
  r.rows.forEach((row) => {
    if (!resultado[row.rol]) resultado[row.rol] = {};
    resultado[row.rol][row.modulo] = row.permitido;
  });
  res.json({ ok: true, data: resultado });
});

router.put('/permisos', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden cambiar permisos' });
  }
  const { rol, modulo, permitido } = req.body;
  if (!rol || !modulo || typeof permitido !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Faltan datos (rol, modulo, permitido)' });
  }
  if (rol === 'candidato') {
    return res.status(400).json({ ok: false, error: 'El rol Candidato nunca se puede restringir — es una protección para que nadie se bloquee a sí mismo' });
  }
  // 🔒 Solo se pueden cambiar permisos de roles INFERIORES al propio
  // (antes un Coordinador General podía restringir al Jefe de Campaña).
  if (!puedeGestionarA(req.usuario, { rol })) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }
  await query(
    `INSERT INTO permisos_personalizados (campana_id, rol, modulo, permitido) VALUES ($1,$2,$3,$4)
     ON CONFLICT (campana_id, rol, modulo) DO UPDATE SET permitido=$4`,
    [req.usuario.campana_id, rol, modulo, permitido]
  );
  res.json({ ok: true });
});

router.delete('/permisos', async (req, res) => {
  if (!['candidato', 'jefe_campana', 'coord_general'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo altos mandos pueden cambiar permisos' });
  }
  const { rol, modulo } = req.body;
  if (!rol || !modulo) return res.status(400).json({ ok: false, error: 'Faltan datos (rol, modulo)' });
  if (!puedeGestionarA(req.usuario, { rol })) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }
  await query(
    'DELETE FROM permisos_personalizados WHERE campana_id=$1 AND rol=$2 AND modulo=$3',
    [req.usuario.campana_id, rol, modulo]
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🗺️ OPCIONES DE TERRITORIO AL DAR DE ALTA — NUEVO
// Cuando se elige "Municipio" en el formulario, esto regresa la
// lista real de secciones de ese municipio (y cuántas son), para
// que se vea junto al formulario en vez de un número a ciegas.
// ═══════════════════════════════════════════════════════════════
router.get('/secciones-de-municipio/:claveMunicipio', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     WHERE s.estado_id=$1 AND m.clave_ine=$2
     ORDER BY s.numero`,
    [req.usuario.estado_id, req.params.claveMunicipio]
  );
  res.json({
    ok: true,
    data: {
      total_secciones: resultado.rows.length,
      secciones: resultado.rows.map((r) => r.numero),
    },
  });
});

/**
 * GET /api/estructura
 * Devuelve el árbol completo de la campaña, CON el semáforo de salud
 * calculado para cada coordinador (no solo el organigrama plano).
 */
/**
 * 🆕 GET /api/estructura/mi-coordinador
 * Para el botón "Contactar coordinador" de la pantalla del promotor
 * — encuentra a su superior directo (parent_id) y da su teléfono,
 * para que le hable directo por WhatsApp sin tener que buscarlo.
 */
/**
 * 🆕 GET /api/estructura/ficha-persona/:usuarioId
 * Todo lo que hace UNA persona de tu estructura — no el total del
 * equipo, sino específicamente esa persona: cuánto ha promovido,
 * si cumple su meta, sus duplicados, en qué secciones ha trabajado,
 * sus reuniones, sus materiales asignados, y — si es coordinador —
 * cada uno de sus subordinados con su propio desglose individual.
 */
/**
 * 🆕 GET /api/estructura/ficha-persona/:usuarioId — REDISEÑADO
 * Antes solo mostraba a la persona + sus subordinados DIRECTOS (1
 * nivel). Ahora trae TODA la rama hacia abajo (recursivo — nietos,
 * bisnietos, todos), y para cada subordinado directo, el TOTAL
 * AGREGADO de todo SU equipo (no solo lo que él capturó a mano) —
 * para poder comparar equipos completos trabajando en paralelo.
 */
/**
 * 🆕 GET /api/estructura/detector-responsables
 * Skill Estructura Política, secciones 11-12. Detecta 2 cosas
 * distintas (nunca se confunden):
 * - ESTRUCTURA SIN RESPONSABLE: territorio con casillas/actividad
 *   real, pero nadie de tu equipo asignado ahí.
 * - RESPONSABLE SIN ESTRUCTURA: alguien con rol de coordinador que
 *   existe en el sistema, pero no tiene territorio asignado — un
 *   "responsable flotante".
 */
/**
 * 🆕 GET /api/estructura/detector-duplicidad
 * Skill Estructura Política, sección 13. Busca 2 tipos de
 * duplicidad real — nunca borra nada automáticamente, solo
 * clasifica para que la persona revise.
 */
/**
 * 🆕 GET /api/estructura/cobertura-mapa
 * Skill Estructura Política, sección 6 (Mapa Territorial) — clasifica
 * cada sección con casillas en 1 de 4 colores, nunca infiriendo lo
 * que no hay evidencia de:
 * VERDE = responsable asignado + actividad reciente (14 días)
 * AMARILLO = responsable asignado, pero sin actividad reciente
 * ROJO = sin responsable asignado
 * GRIS = sin casillas registradas (no aplica, no se puede evaluar)
 */
/**
 * 🆕 GET /api/estructura/ficha-estructura/:municipioId
 * Skill Estructura Política, sección 7 — Ficha de Estructura, a
 * nivel municipio (la unidad estructural intermedia que aún no
 * tenía su propia ficha). Secciones: resumen, responsable,
 * territorio, integrantes, actividad, incidencias, histórico.
 */
// 🆕 Municipios que en verdad le corresponden a ESTA campaña (no
// todo el estado) — para el selector de "🗂️ Ficha de Estructura" en
// Reportes. Devuelve municipios.id de verdad (antes el selector usaba
// clave_ine de /geo/municipios, que no coincide con el id que espera
// /ficha-estructura/:municipioId — por eso a veces no cargaba nada).
router.get('/municipios-disponibles', async (req, res) => {
  const unidades = await obtenerUnidadesDisponibles(req.usuario.campana_id, req.usuario.estado_id, 'municipio');
  res.json({ ok: true, data: unidades });
});

router.get('/ficha-estructura/:municipioId', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const municipioId = parseInt(req.params.municipioId);

  const municipioRes = await query('SELECT id, nombre FROM municipios WHERE id=$1', [municipioId]);
  if (!municipioRes.rows[0]) return res.status(404).json({ ok: false, error: 'Municipio no encontrado' });

  const [responsableMunicipio, integrantes, actividad, incidencias, historico] = await Promise.all([
    // RESPONSABLE — quién tiene este municipio como territorio directo
    query(`SELECT id, nombre, rol, puesto, creado_en FROM usuarios WHERE campana_id=$1 AND territorio_tipo='municipio' AND territorio_id=$2 AND activo != false`, [campanaId, municipioId]),
    // INTEGRANTES AUTORIZADOS — todos con territorio DENTRO de este municipio (secciones que pertenecen a él)
    query(
      `SELECT u.id, u.nombre, u.rol, u.puesto FROM usuarios u
       WHERE u.campana_id=$1 AND u.activo != false AND u.territorio_tipo='seccion'
       AND u.territorio_id IN (SELECT numero FROM secciones WHERE municipio_id=$2)
       ORDER BY u.rol, u.nombre`,
      [campanaId, municipioId]
    ),
    // ACTIVIDAD — promovidos capturados en secciones de este municipio, últimos 30 días
    query(
      `SELECT COUNT(*) as total FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 AND s.municipio_id=$2 AND p.creado_en > now() - interval '30 days'`,
      [campanaId, municipioId]
    ),
    // INCIDENCIAS abiertas en este municipio
    query(
      `SELECT i.id, i.tipo, i.urgencia FROM incidencias i JOIN secciones s ON s.id = i.seccion_id
       WHERE i.campana_id=$1 AND s.municipio_id=$2 AND i.estado='activa'`,
      [campanaId, municipioId]
    ).catch(() => ({ rows: [] })),
    // HISTÓRICO — cambios de estructura de la gente asignada aquí
    query(
      `SELECT h.motivo, h.creado_en, u.nombre as afectado, uc.nombre as cambiado_por
       FROM estructura_historial h JOIN usuarios u ON u.id = h.usuario_id LEFT JOIN usuarios uc ON uc.id = h.cambiado_por
       WHERE h.campana_id=$1 AND u.territorio_tipo='municipio' AND u.territorio_id=$2
       ORDER BY h.creado_en DESC LIMIT 10`,
      [campanaId, municipioId]
    ).catch(() => ({ rows: [] })),
  ]);

  // 🆕 RAMIFICACIONES — el árbol de equipo del responsable, con datos
  // BRUTOS (sin promediar ni interpretar) de promotores y promovidos
  // de cada quien — para que en Reportes se vea de un vistazo quién
  // reporta a quién y qué ha producido cada persona realmente.
  // Sigue el mismo criterio que /estructura/:id/reporte-equipo.
  let ramificaciones = null;
  const responsable = responsableMunicipio.rows[0];
  if (responsable) {
    const directos = await query(
      'SELECT id, nombre, rol, puesto FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
      [responsable.id, campanaId]
    );
    const ramas = [];
    for (const nivelIntermedio of directos.rows) {
      const hijos = await query(
        'SELECT id, nombre, rol FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
        [nivelIntermedio.id, campanaId]
      );
      const detalleHijos = [];
      let totalRama = 0;
      let comprometidosRama = 0;
      let duplicadosRama = 0;
      for (const h of hijos.rows) {
        const conteo = await query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE comprometido) as comprometidos,
                  COUNT(*) FILTER (WHERE dup.veces > 1) as duplicados
           FROM promovidos prom
           LEFT JOIN (
             SELECT nombre, seccion_id, COUNT(*) as veces
             FROM promovidos WHERE campana_id=$1
             GROUP BY nombre, seccion_id
           ) dup ON dup.nombre = prom.nombre AND dup.seccion_id = prom.seccion_id
           WHERE prom.campana_id=$1 AND prom.registrado_por=$2`,
          [campanaId, h.id]
        );
        const total = parseInt(conteo.rows[0].total);
        const comprometidos = parseInt(conteo.rows[0].comprometidos);
        const dups = parseInt(conteo.rows[0].duplicados);
        totalRama += total; comprometidosRama += comprometidos; duplicadosRama += dups;
        detalleHijos.push({ id: h.id, nombre: h.nombre, rol: h.rol, total_promovidos: total, comprometidos, duplicados: dups });
      }
      // También cuenta lo que el propio nivel intermedio capturó directamente (sin equipo)
      const propio = await query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos FROM promovidos WHERE campana_id=$1 AND registrado_por=$2`,
        [campanaId, nivelIntermedio.id]
      );
      ramas.push({
        id: nivelIntermedio.id, nombre: nivelIntermedio.nombre, rol: nivelIntermedio.rol, puesto: nivelIntermedio.puesto,
        total_personas_directas: hijos.rows.length,
        propio_total_promovidos: parseInt(propio.rows[0].total),
        propio_comprometidos: parseInt(propio.rows[0].comprometidos),
        total_promovidos: totalRama, total_comprometidos: comprometidosRama, total_duplicados: duplicadosRama,
        promotores: detalleHijos,
      });
    }
    ramificaciones = { responsable_id: responsable.id, ramas };
  }

  res.json({
    ok: true,
    data: {
      municipio: municipioRes.rows[0],
      responsable: responsableMunicipio.rows[0] || null,
      estado: responsableMunicipio.rows.length > 0 ? 'ACTIVA' : 'SIN RESPONSABLE',
      integrantes: integrantes.rows,
      actividad_30d: parseInt(actividad.rows[0].total),
      incidencias: incidencias.rows,
      historico: historico.rows,
      ramificaciones,
    },
  });
});

router.get('/cobertura-mapa', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const estadoId = req.usuario.estado_id;

  // 🆕 CORRECCIÓN REAL — esto solo buscaba responsables dados de alta
  // con el rol EXACTO 'coord_seccional' y territorio_tipo='seccion'
  // en la tabla usuarios. Pero "Modo Sectorización" (el que traza
  // zonas en el mapa) NO asigna así — guarda la asignación en la
  // tabla zonas_asignadas (ver routes/zonas.js, POST /zonas/asignar),
  // con cualquier usuario/rol que elijas del selector. Por eso una
  // sección con responsable asignado por Sectorización SIEMPRE se
  // veía en rojo ("sin responsable") aquí. Ahora se cuentan las DOS
  // fuentes: el responsable "formal" por rol, y cualquier asignación
  // hecha desde Sectorización.
  const [secciones, responsablesPorRol, responsablesPorZona, actividad] = await Promise.all([
    query(`SELECT DISTINCT s.numero FROM casillas c JOIN secciones s ON s.id = c.seccion_id WHERE c.campana_id=$1`, [campanaId]),
    query(`SELECT territorio_id FROM usuarios WHERE campana_id=$1 AND rol='coord_seccional' AND territorio_tipo='seccion' AND territorio_id IS NOT NULL AND activo != false`, [campanaId]),
    query(
      `SELECT s.numero FROM zonas_asignadas z JOIN secciones s ON s.id = z.seccion_id WHERE z.campana_id=$1`,
      [campanaId]
    ),
    query(
      `SELECT s.numero FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 AND p.creado_en > now() - interval '14 days' GROUP BY s.numero`,
      [campanaId]
    ),
  ]);

  const conResponsable = new Set([
    ...responsablesPorRol.rows.map((r) => r.territorio_id),
    ...responsablesPorZona.rows.map((r) => r.numero),
  ]);
  const conActividad = new Set(actividad.rows.map((a) => a.numero));

  const clasificacion = {};
  secciones.rows.forEach((s) => {
    if (!conResponsable.has(s.numero)) clasificacion[s.numero] = 'rojo';
    else if (!conActividad.has(s.numero)) clasificacion[s.numero] = 'amarillo';
    else clasificacion[s.numero] = 'verde';
  });

  res.json({ ok: true, data: clasificacion });
});

router.get('/detector-duplicidad', async (req, res) => {
  const campanaId = req.usuario.campana_id;

  const [mismoTerritorioMismoRol, telefonoDuplicado] = await Promise.all([
    // Mismo territorio (tipo+id) asignado a 2+ personas del MISMO
    // rol — ej. 2 coord_seccional en la misma sección. No siempre es
    // un error (puede haber co-coordinación intencional), por eso se
    // clasifica como REVISIÓN, no como ERROR automático.
    query(
      `SELECT territorio_tipo, territorio_id, rol, array_agg(nombre) as nombres, array_agg(id) as ids, COUNT(*) as total
       FROM usuarios WHERE campana_id=$1 AND activo != false AND territorio_id IS NOT NULL
       GROUP BY territorio_tipo, territorio_id, rol HAVING COUNT(*) > 1 ORDER BY total DESC`,
      [campanaId]
    ),
    // Mismo teléfono usado por 2+ personas DISTINTAS en tu estructura
    query(
      `SELECT telefono, array_agg(nombre) as nombres, array_agg(id) as ids, array_agg(rol) as roles, COUNT(*) as total
       FROM usuarios WHERE campana_id=$1 AND activo != false AND telefono IS NOT NULL AND telefono != ''
       GROUP BY telefono HAVING COUNT(*) > 1 ORDER BY total DESC`,
      [campanaId]
    ),
  ]);

  res.json({
    ok: true,
    data: {
      mismo_territorio_mismo_rol: mismoTerritorioMismoRol.rows.map((r) => ({ ...r, clasificacion: 'REVISIÓN' })),
      telefono_duplicado: telefonoDuplicado.rows.map((r) => ({ ...r, clasificacion: 'ADVERTENCIA' })),
    },
  });
});

router.get('/detector-responsables', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const estadoId = req.usuario.estado_id;

  const [seccionesSinResponsable, responsablesSinEstructura] = await Promise.all([
    // Secciones con casillas registradas (evidencia de operación real
    // ahí) pero sin nadie con territorio_tipo='seccion' asignado.
    query(
      `SELECT DISTINCT s.numero, m.nombre as municipio, s.distrito_local,
         (SELECT COUNT(*) FROM casillas c2 WHERE c2.campana_id=$2 AND c2.seccion_id=s.id) as total_casillas
       FROM casillas c JOIN secciones s ON s.id = c.seccion_id JOIN municipios m ON m.id = s.municipio_id
       WHERE c.campana_id=$2 AND s.estado_id=$1
       AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.campana_id=$2 AND u.territorio_tipo='seccion' AND u.territorio_id=s.numero AND u.activo != false)
       ORDER BY s.numero`,
      [estadoId, campanaId]
    ),
    // Coordinadores (cualquier nivel) sin territorio_id asignado —
    // existen en el sistema pero no tienen de qué ser responsables.
    query(
      `SELECT id, nombre, rol, puesto, creado_en FROM usuarios
       WHERE campana_id=$1 AND activo != false AND territorio_id IS NULL
       AND rol IN ('coord_general','coord_distrital','coord_municipal','coord_seccional')
       ORDER BY rol, nombre`,
      [campanaId]
    ),
  ]);

  res.json({
    ok: true,
    data: {
      estructura_sin_responsable: seccionesSinResponsable.rows,
      responsable_sin_estructura: responsablesSinEstructura.rows,
    },
  });
});

/**
 * 🆕 PATCH /api/estructura/:usuarioId/asignar-territorio
 * La acción "ASIGNAR" que pide la skill — nunca automática, siempre
 * la dispara la persona con sesión real, y queda registrada.
 */
router.patch('/:usuarioId/asignar-territorio', async (req, res) => {
  const { territorio_tipo, territorio_id } = req.body;
  if (!['seccion', 'municipio', 'distrito_local', 'distrito_federal', 'estatal'].includes(territorio_tipo)) {
    return res.status(400).json({ ok: false, error: 'territorio_tipo inválido' });
  }
  // 🔒 Solo se asigna territorio a alguien de rango inferior (antes
  // cualquiera con acceso a Estructura podía mover a cualquiera).
  const objetivo = await miembroDeMiCampana(req.params.usuarioId, req.usuario.campana_id);
  if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
  if (!puedeGestionarA(req.usuario, objetivo)) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }
  const resultado = await query(
    `UPDATE usuarios SET territorio_tipo=$1, territorio_id=$2 WHERE id=$3 AND campana_id=$4 RETURNING id, nombre, territorio_tipo, territorio_id`,
    [territorio_tipo, territorio_id, req.params.usuarioId, req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
  // 🆕 Registro de auditoría — reusa la tabla ya existente de
  // historial de estructura (columnas reales: motivo, cambiado_por).
  await query(
    `INSERT INTO estructura_historial (campana_id, usuario_id, motivo, cambiado_por, creado_en)
     VALUES ($1,$2,$3,$4, now())`,
    [req.usuario.campana_id, req.params.usuarioId, `Asignación de territorio: ${territorio_tipo} ${territorio_id}`, req.usuario.sub]
  ).catch(() => {}); // si falla el registro de auditoría, no bloquea la asignación real
  res.json({ ok: true, data: resultado.rows[0] });
});

router.get('/ficha-persona/:usuarioId', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const usuarioId = req.params.usuarioId;

  const personaRes = await query(
    `SELECT id, nombre, rol, puesto, meta_diaria, territorio_tipo, territorio_id, telefono, parent_id
     FROM usuarios WHERE id=$1 AND campana_id=$2`,
    [usuarioId, campanaId]
  );
  if (!personaRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });
  const persona = personaRes.rows[0];

  // 🆕 Rama completa hacia abajo — recursivo, no solo 1 nivel.
  const ramaRes = await query(
    `WITH RECURSIVE rama AS (
       SELECT id, nombre, rol, puesto, meta_diaria, parent_id, 0 as nivel
       FROM usuarios WHERE id=$1
       UNION ALL
       SELECT u.id, u.nombre, u.rol, u.puesto, u.meta_diaria, u.parent_id, r.nivel + 1
       FROM usuarios u JOIN rama r ON u.parent_id = r.id
       WHERE u.campana_id=$2 AND u.activo != false
     )
     SELECT * FROM rama`,
    [usuarioId, campanaId]
  );
  const idsRama = ramaRes.rows.map((r) => r.id);

  const [promovidos, secciones, reuniones, materiales] = await Promise.all([
    // Promovidos capturados por CUALQUIERA de la rama completa
    query(`SELECT id, registrado_por, telefono, comprometido, creado_en, seccion_id FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2::uuid[])`, [campanaId, idsRama]),
    query(
      `SELECT s.numero as seccion_numero, COUNT(p.id) as total
       FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id=$1 AND p.registrado_por = ANY($2::uuid[]) GROUP BY s.numero ORDER BY total DESC`,
      [campanaId, idsRama]
    ),
    query(`SELECT id, titulo, fecha_inicio, seccion_id, realizado, creado_por FROM agenda WHERE campana_id=$1 AND creado_por = ANY($2::uuid[]) ORDER BY fecha_inicio DESC`, [campanaId, idsRama]).catch(() => ({ rows: [] })),
    query(`SELECT id, tipo, subtipo, cantidad, costo, responsable_id FROM activos WHERE campana_id=$1 AND responsable_id = ANY($2::uuid[])`, [campanaId, idsRama]).catch(() => ({ rows: [] })),
  ]);

  // 🆕 Construir el árbol en memoria, y calcular el TOTAL AGREGADO
  // de cada persona (lo que ella capturó + TODO lo de su gente
  // debajo, recursivamente) — así un coordinador se ve con el
  // total real de su equipo completo, no solo lo suyo.
  const porPersona = {};
  ramaRes.rows.forEach((r) => { porPersona[r.id] = { ...r, propio: 0, comprometidos_propio: 0, hijos: [] }; });
  ramaRes.rows.forEach((r) => { if (r.parent_id && porPersona[r.parent_id]) porPersona[r.parent_id].hijos.push(r.id); });
  promovidos.rows.forEach((p) => {
    if (porPersona[p.registrado_por]) {
      porPersona[p.registrado_por].propio++;
      if (p.comprometido) porPersona[p.registrado_por].comprometidos_propio++;
    }
  });
  // Suma recursiva del total de la rama de cada nodo (memoizado)
  const memoTotal = {};
  function totalRama(id) {
    if (memoTotal[id] !== undefined) return memoTotal[id];
    const nodo = porPersona[id];
    let total = nodo.propio;
    let comprometidos = nodo.comprometidos_propio;
    let metaRama = parseInt(nodo.meta_diaria) || 0;
    nodo.hijos.forEach((hijoId) => {
      const sub = totalRama(hijoId);
      total += sub.total;
      comprometidos += sub.comprometidos;
      metaRama += sub.meta_rama;
    });
    memoTotal[id] = { total, comprometidos, meta_rama: metaRama };
    return memoTotal[id];
  }
  Object.keys(porPersona).forEach((id) => totalRama(id));

  // Duplicados — de TODA la rama junta, por teléfono repetido
  const porTelefono = {};
  promovidos.rows.forEach((p) => { if (p.telefono) porTelefono[p.telefono] = (porTelefono[p.telefono] || 0) + 1; });
  const duplicados = Object.entries(porTelefono).filter(([, n]) => n > 1).length;

  const hoy = new Date().toISOString().slice(0, 10);
  const capturadosHoyRama = promovidos.rows.filter((p) => new Date(p.creado_en).toISOString().slice(0, 10) === hoy).length;

  // 🆕 Equipo en paralelo — cada subordinado DIRECTO, con el TOTAL
  // de SU propia rama completa (no solo lo que él capturó a mano).
  const equipoEnParalelo = porPersona[usuarioId].hijos.map((hijoId) => {
    const nodo = porPersona[hijoId];
    const agregado = totalRama(hijoId);
    return {
      id: nodo.id, nombre: nodo.nombre, rol: nodo.rol, puesto: nodo.puesto,
      propio: nodo.propio, total_su_equipo: agregado.total, comprometidos_su_equipo: agregado.comprometidos,
      meta_su_equipo: agregado.meta_rama, tamano_equipo: contarDescendientes(porPersona, hijoId),
      cumple_meta: agregado.meta_rama > 0 ? agregado.total >= agregado.meta_rama : null,
    };
  }).sort((a, b) => b.total_su_equipo - a.total_su_equipo);

  function contarDescendientes(mapa, id) {
    let n = 0;
    mapa[id].hijos.forEach((h) => { n += 1 + contarDescendientes(mapa, h); });
    return n;
  }

  const totalGeneral = totalRama(usuarioId);

  res.json({
    ok: true,
    data: {
      persona: { id: persona.id, nombre: persona.nombre, rol: persona.rol, puesto: persona.puesto, meta_diaria: persona.meta_diaria },
      // 🆕 Totales de TODA la rama (él + todo su equipo hacia abajo)
      totales_rama: {
        total_promovidos: totalGeneral.total, comprometidos: totalGeneral.comprometidos,
        meta_total_rama: totalGeneral.meta_rama, capturados_hoy: capturadosHoyRama,
        cumple_meta: totalGeneral.meta_rama > 0 ? totalGeneral.total >= totalGeneral.meta_rama : null,
        tamano_equipo_completo: idsRama.length - 1, // sin contarse a sí mismo
        duplicados,
      },
      // 🆕 Lo que ÉL capturó con sus propias manos, aparte del total de su equipo
      propio: { total_promovidos: porPersona[usuarioId].propio, comprometidos: porPersona[usuarioId].comprometidos_propio },
      // 🆕 Cada rama directa, en paralelo, para comparar equipos entre sí
      equipo_en_paralelo: equipoEnParalelo,
      secciones_trabajadas: secciones.rows,
      reuniones: { total: reuniones.rows.length, realizadas: reuniones.rows.filter((r) => r.realizado).length, detalle: reuniones.rows },
      materiales: { total_items: materiales.rows.length, costo_total: materiales.rows.reduce((s, m) => s + (parseFloat(m.costo) || 0), 0), detalle: materiales.rows },
    },
  });
});

const ROL_LABEL_PDF = {
  candidato: 'Candidato', jefe_campana: 'Jefe de Campaña', coord_general: 'Coord. General',
  coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional',
  promotor: 'Promotor', representante_casilla: 'Repres. de Casilla',
  encargado_juridico: 'Encargado Jurídico', encargado_finanzas: 'Encargado Finanzas', voluntario: 'Voluntario',
};

/**
 * 🆕 GET /api/estructura/pdf/persona/:usuarioId
 * Reporte de Estructura en PDF — la cascada completa de un
 * coordinador y su equipo, descargable, con control documental.
 */
router.get('/pdf/persona/:usuarioId', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const usuarioId = req.params.usuarioId;

  const personaRes = await query('SELECT id, nombre, rol, puesto, meta_diaria FROM usuarios WHERE id=$1 AND campana_id=$2', [usuarioId, campanaId]);
  if (!personaRes.rows[0]) return res.status(404).json({ ok: false, error: 'Persona no encontrada' });
  const persona = personaRes.rows[0];

  const ramaRes = await query(
    `WITH RECURSIVE rama AS (
       SELECT id, nombre, rol, puesto, meta_diaria, parent_id, 0 as nivel
       FROM usuarios WHERE id=$1
       UNION ALL
       SELECT u.id, u.nombre, u.rol, u.puesto, u.meta_diaria, u.parent_id, r.nivel + 1
       FROM usuarios u JOIN rama r ON u.parent_id = r.id
       WHERE u.campana_id=$2 AND u.activo != false
     )
     SELECT * FROM rama`,
    [usuarioId, campanaId]
  );
  const idsRama = ramaRes.rows.map((r) => r.id);

  const promovidos = await query(
    `SELECT registrado_por, comprometido FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2::uuid[])`,
    [campanaId, idsRama]
  );

  const porPersona = {};
  ramaRes.rows.forEach((r) => { porPersona[r.id] = { ...r, propio: 0, comprometidos_propio: 0, hijos: [] }; });
  ramaRes.rows.forEach((r) => { if (r.parent_id && porPersona[r.parent_id]) porPersona[r.parent_id].hijos.push(r.id); });
  promovidos.rows.forEach((p) => {
    if (porPersona[p.registrado_por]) {
      porPersona[p.registrado_por].propio++;
      if (p.comprometido) porPersona[p.registrado_por].comprometidos_propio++;
    }
  });
  const memoTotal = {};
  function totalRama(id) {
    if (memoTotal[id] !== undefined) return memoTotal[id];
    const nodo = porPersona[id];
    let total = nodo.propio, comprometidos = nodo.comprometidos_propio, metaRama = parseInt(nodo.meta_diaria) || 0;
    nodo.hijos.forEach((hijoId) => {
      const sub = totalRama(hijoId);
      total += sub.total; comprometidos += sub.comprometidos; metaRama += sub.meta_rama;
    });
    memoTotal[id] = { total, comprometidos, meta_rama: metaRama };
    return memoTotal[id];
  }
  Object.keys(porPersona).forEach((id) => totalRama(id));
  const totalGeneral = totalRama(usuarioId);

  const equipoEnParalelo = porPersona[usuarioId].hijos.map((hijoId) => {
    const nodo = porPersona[hijoId];
    const agregado = totalRama(hijoId);
    return { nombre: nodo.nombre, rol: ROL_LABEL_PDF[nodo.rol] || nodo.rol, total_su_equipo: agregado.total, comprometidos_su_equipo: agregado.comprometidos, meta_su_equipo: agregado.meta_rama };
  }).sort((a, b) => b.total_su_equipo - a.total_su_equipo);

  const doc = iniciarPDF(res, 'reporte_estructura_persona.pdf', 'Reporte de Estructura — Cascada de Equipo', `${persona.nombre} · ${ROL_LABEL_PDF[persona.rol] || persona.rol}`);

  seccionPDF(doc, 'Control Documental');
  tablaPDF(doc, ['Campo', 'Valor'], [
    ['ID del informe', `ESTRUCTURA-${usuarioId.slice(0, 8).toUpperCase()}-${Date.now()}`],
    ['Fecha de corte', new Date().toLocaleDateString('es-MX')],
    ['Fuente de datos', 'Módulo Estructura (en vivo)'],
    ['Tamaño de la rama completa', `${idsRama.length - 1} personas debajo`],
  ], [200, 300]);

  seccionPDF(doc, 'Total de Toda la Rama');
  tablaPDF(doc, ['Indicador', 'Valor'], [
    ['Promovidos (toda la rama)', totalGeneral.total],
    ['Comprometidos', totalGeneral.comprometidos],
    ['Meta total de la rama', totalGeneral.meta_rama || 'Sin meta configurada'],
    ['Lo que él/ella capturó personalmente', porPersona[usuarioId].propio],
  ], [280, 220]);

  if (equipoEnParalelo.length > 0) {
    seccionPDF(doc, `Su Equipo en Paralelo — ${equipoEnParalelo.length} ramas directas`);
    tablaPDF(doc, ['Nombre', 'Rol', 'Total su rama', 'Comprometidos', 'Meta'],
      equipoEnParalelo.map((e) => [e.nombre, e.rol, e.total_su_equipo, e.comprometidos_su_equipo, e.meta_su_equipo || '—']),
      [140, 110, 90, 90, 70]
    );
  }

  doc.end();
});

router.get('/mi-coordinador', async (req, res) => {
  const yo = await query('SELECT parent_id FROM usuarios WHERE id=$1', [req.usuario.sub]);
  if (!yo.rows[0]?.parent_id) return res.json({ ok: true, data: null });
  const coordinador = await query('SELECT nombre, telefono, rol FROM usuarios WHERE id=$1', [yo.rows[0].parent_id]);
  res.json({ ok: true, data: coordinador.rows[0] || null });
});

router.get('/', async (req, res) => {
  const esRamaLimitada = req.usuario.rol === 'coord_seccional';
  const resultado = await query(
    esRamaLimitada
      ? `WITH RECURSIVE mi_rama AS (
           SELECT id FROM usuarios WHERE id = $2
           UNION ALL
           SELECT u.id FROM usuarios u JOIN mi_rama r ON u.parent_id = r.id
         )
         SELECT id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id,
                meta_diaria, activo, ultimo_acceso, creado_en
         FROM usuarios WHERE campana_id = $1 AND id IN (SELECT id FROM mi_rama) ORDER BY creado_en`
      : `SELECT id, nombre, email, telefono, rol, puesto, parent_id, territorio_tipo, territorio_id,
                meta_diaria, activo, ultimo_acceso, creado_en
         FROM usuarios WHERE campana_id = $1 ORDER BY creado_en`,
    esRamaLimitada ? [req.usuario.campana_id, req.usuario.sub] : [req.usuario.campana_id]
  );
  const usuarios = resultado.rows;
  const conteoDirectos = {};
  usuarios.forEach((u) => {
    if (u.parent_id) conteoDirectos[u.parent_id] = (conteoDirectos[u.parent_id] || 0) + 1;
  });
  const conSalud = usuarios.map((u) => {
    const directos = conteoDirectos[u.id] || 0;
    const rango = RANGO_SANO[u.rol];
    let salud = 'na';
    if (rango) {
      if (directos === 0) salud = 'vacio';
      else if (directos < rango[0]) salud = 'bajo';
      else if (directos > rango[1]) salud = 'sobrecargado';
      else salud = 'sano';
    }
    return { ...u, reportes_directos: directos, salud };
  });
  res.json({ ok: true, data: conSalud });
});

router.get('/cadena/:usuarioId', async (req, res) => {
  const cadena = [];
  let actualId = req.params.usuarioId;
  let vueltas = 0;
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
  res.json({ ok: true, data: cadena.reverse() });
});

router.get('/salud', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const todos = await query(
    `SELECT id, rol, parent_id, telefono, puesto, territorio_id, creado_en FROM usuarios WHERE campana_id = $1 AND activo != false`,
    [campanaId]
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

  // 🆕 PANEL DE SALUD DE LA ESTRUCTURA (skill Estructura Política,
  // sección 29) — 6 indicadores separados, cada uno con su fórmula
  // exacta. Nunca se combinan en un solo score — la skill lo prohíbe
  // explícitamente si las reglas no están formalmente definidas.
  const total = todos.rows.length;
  const conDatosCompletos = todos.rows.filter((u) => u.telefono).length;
  const conTerritorio = todos.rows.filter((u) => u.territorio_id !== null).length;

  const promovidosRes = await query(
    `SELECT COUNT(DISTINCT registrado_por) as con_actividad FROM promovidos WHERE campana_id=$1 AND creado_en > now() - interval '14 days'`,
    [campanaId]
  );

  const incidenciasRes = await query(`SELECT COUNT(*) as total FROM incidencias WHERE campana_id=$1 AND estado='activa'`, [campanaId]);

  const seccionesRes = await query(
    `SELECT COUNT(DISTINCT s.id) as total_con_casillas,
       COUNT(DISTINCT s.id) FILTER (WHERE EXISTS (SELECT 1 FROM usuarios u WHERE u.campana_id=$1 AND u.territorio_tipo='seccion' AND u.territorio_id=s.numero AND u.activo != false)) as con_responsable
     FROM secciones s JOIN casillas c ON c.seccion_id = s.id WHERE c.campana_id=$1`,
    [campanaId]
  );

  const ultimaActualizacion = await query(`SELECT MAX(creado_en) as fecha FROM estructura_historial WHERE campana_id=$1`, [campanaId]).catch(() => ({ rows: [{ fecha: null }] }));

  const panelSalud = [
    {
      indicador: 'Completitud de Datos', valor: total > 0 ? Math.round((conDatosCompletos / total) * 100) : 0,
      formula: `${conDatosCompletos} de ${total} personas con teléfono capturado`,
    },
    {
      indicador: 'Asignaciones (con territorio)', valor: total > 0 ? Math.round((conTerritorio / total) * 100) : 0,
      formula: `${conTerritorio} de ${total} personas con territorio asignado`,
    },
    {
      indicador: 'Actividad Registrada', valor: total > 0 ? Math.round((parseInt(promovidosRes.rows[0].con_actividad) / total) * 100) : 0,
      formula: `${promovidosRes.rows[0].con_actividad} de ${total} personas capturaron al menos 1 promovido en los últimos 14 días`,
    },
    {
      indicador: 'Incidencias Abiertas', valor: parseInt(incidenciasRes.rows[0].total),
      formula: `Conteo directo de incidencias con estado 'activa' (no es porcentaje)`, esConteo: true,
    },
    {
      indicador: 'Cobertura Territorial', valor: seccionesRes.rows[0].total_con_casillas > 0 ? Math.round((seccionesRes.rows[0].con_responsable / seccionesRes.rows[0].total_con_casillas) * 100) : 0,
      formula: `${seccionesRes.rows[0].con_responsable} de ${seccionesRes.rows[0].total_con_casillas} secciones con casillas tienen responsable asignado`,
    },
    {
      indicador: 'Última Actualización', valor: ultimaActualizacion.rows[0].fecha ? new Date(ultimaActualizacion.rows[0].fecha).toLocaleDateString('es-MX') : 'Sin registros',
      formula: `Fecha del cambio más reciente en estructura_historial`, esFecha: true,
    },
  ];

  res.json({ ok: true, data: { resumen, alertas, panel_salud: panelSalud } });
});

// 🆕 CORREGIDO — faltaba 'coord_regional' en la lista de roles
// válidos. El formulario de "Agregar miembro" (Estructura.jsx) YA
// tenía todo listo para crear un Coordinador Regional y asignarle
// una región (selector, texto de ayuda, envío de region_id) desde
// hace tiempo, pero el backend SIEMPRE rechazaba la petición con un
// error de validación porque 'coord_regional' no estaba en este
// enum — por eso nunca se pudo crear ninguno, y las regiones (y las
// fichas que dependen de saber quién las coordina) se veían
// permanentemente vacías/desactualizadas. También faltaba el campo
// region_id por completo (el formulario ya lo mandaba, pero se
// perdía silenciosamente porque el esquema no lo reconocía).
const esquemaMiembro = z.object({
  nombre: nombreSeguro,
  email: z.string().email(),
  telefono: z.string().max(20).optional(),
  password: z.string().min(8),
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_regional', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor', 'encargado_juridico', 'encargado_finanzas', 'representante_casilla', 'voluntario']),
  puesto: z.string().max(100).optional(),
  parent_id: z.string().uuid().optional(),
  territorio_tipo: z.string().optional(),
  territorio_id: z.number().int().optional(),
  region_id: z.string().uuid().optional(),
  meta_diaria: z.number().int().default(0),
});

router.post('/', async (req, res) => {
  const parseado = esquemaMiembro.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;
  // 🔒 Solo se pueden dar de alta personas de rango INFERIOR al propio
  // (antes un Coordinador Seccional podía crear un Jefe de Campaña con
  // contraseña elegida por él y entrar con esa cuenta).
  if (!puedeAsignarRol(req.usuario, d.rol, d.puesto)) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }
  const errorReferencia = await referenciasSonDeMiCampana(d, req.usuario.campana_id);
  if (errorReferencia) return res.status(400).json({ ok: false, error: errorReferencia });
  try {
    const existente = await query(
      'SELECT id FROM usuarios WHERE campana_id=$1 AND email=$2',
      [req.usuario.campana_id, d.email]
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe un miembro con ese correo' });
    }
    const passwordHash = await bcrypt.hash(d.password, 12);
    let parentId = d.parent_id || null;
    if (!parentId) {
      const candidatoRes = await query(
        `SELECT id FROM usuarios WHERE campana_id=$1 AND rol='candidato' LIMIT 1`,
        [req.usuario.campana_id]
      );
      parentId = candidatoRes.rows[0]?.id || null;
    }
    // 🆕 CORREGIDO — se agregó region_id al INSERT (antes no existía
    // en esta lista, así que aunque el formulario lo mandara, nunca
    // se guardaba en la base de datos).
    const resultado = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, puesto, parent_id, territorio_tipo, territorio_id, region_id, meta_diaria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, nombre, rol, puesto`,
      [req.usuario.campana_id, d.nombre, d.email, d.telefono || null, passwordHash,
       d.rol, d.puesto || null, parentId, d.territorio_tipo || null, d.territorio_id || null, d.region_id || null, d.meta_diaria]
    );
    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (e) {
    console.error('Error creando miembro:', e);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

// 🆕 CORREGIDO — mismo problema que en esquemaMiembro: faltaba
// 'coord_regional' (no se podía editar a alguien para convertirlo en
// Coordinador Regional) y faltaba region_id (no se podía reasignar
// de región desde "Editar miembro"). El UPDATE de abajo ya construye
// sus columnas dinámicamente a partir de lo que llegue validado
// aquí, así que con solo agregar el campo ya queda funcional.
const esquemaEditar = z.object({
  nombre: nombreSeguro.optional(),
  // nullable: el formulario manda null cuando se borra el teléfono
  telefono: z.string().max(20).nullable().optional(),
  rol: z.enum(['jefe_campana', 'coord_general', 'coord_regional', 'coord_distrital', 'coord_municipal', 'coord_seccional', 'promotor', 'encargado_juridico', 'encargado_finanzas', 'representante_casilla', 'voluntario']).optional(),
  puesto: z.string().max(100).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  territorio_tipo: z.string().nullable().optional(),
  territorio_id: z.number().int().nullable().optional(),
  region_id: z.string().uuid().nullable().optional(),
  meta_diaria: z.number().int().optional(),
  activo: z.boolean().optional(),
});

router.patch('/:id', async (req, res) => {
  const parseado = esquemaEditar.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  if (d.parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede ser su propio coordinador' });

  // 🔒 JERARQUÍA — antes cualquiera con acceso a Estructura podía
  // editar a cualquiera, incluyéndose a sí mismo: bastaba mandar
  // {"rol":"jefe_campana"} para subirse de rango.
  const actualRes = await query(
    `SELECT rol, puesto, parent_id, territorio_tipo, territorio_id, region_id, meta_diaria, activo, nombre, telefono
     FROM usuarios WHERE id=$1 AND campana_id=$2`,
    [req.params.id, req.usuario.campana_id]
  );
  const actual = actualRes.rows[0];
  if (!actual) return res.status(404).json({ ok: false, error: 'No encontrado' });
  // El formulario manda todos los campos aunque no cambien — solo
  // cuentan los que SÍ cambian de valor.
  const cambiosReales = Object.keys(d).filter((c) => String(d[c] ?? '') !== String(actual[c] ?? ''))
    // Si el territorio no cambia, el "tipo" que el formulario rellena
    // por defecto tampoco cuenta como cambio.
    .filter((c) => !(c === 'territorio_tipo' && String(d.territorio_id ?? actual.territorio_id ?? '') === String(actual.territorio_id ?? '')));
  const esUnoMismo = req.params.id === req.usuario.sub;
  if (esUnoMismo) {
    const camposProhibidos = cambiosReales.filter((c) => !CAMPOS_EDITABLES_DE_UNO_MISMO.includes(c));
    if (camposProhibidos.length > 0) {
      return res.status(403).json({ ok: false, error: 'De tu propio perfil solo puedes cambiar tu nombre y teléfono. Pide a tu coordinador cualquier otro cambio.' });
    }
  } else {
    if (!puedeGestionarA(req.usuario, actual)) {
      return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
    }
    // Si cambia el rol o el puesto, el NUEVO nivel también debe quedar
    // por debajo de quien hace el cambio.
    if ((cambiosReales.includes('rol') || cambiosReales.includes('puesto'))
      && !puedeAsignarRol(req.usuario, d.rol ?? actual.rol, 'puesto' in d ? d.puesto : actual.puesto)) {
      return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
    }
  }
  const errorReferencia = await referenciasSonDeMiCampana(d, req.usuario.campana_id);
  if (errorReferencia) return res.status(400).json({ ok: false, error: errorReferencia });

  if ('parent_id' in d) {
    const actual = await query('SELECT parent_id FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
    if (actual.rows[0] && actual.rows[0].parent_id !== d.parent_id) {
      await query(
        `INSERT INTO estructura_historial (campana_id, usuario_id, parent_anterior, parent_nuevo, motivo, cambiado_por)
         VALUES ($1,$2,$3,$4,'Edición individual',$5)`,
        [req.usuario.campana_id, req.params.id, actual.rows[0].parent_id, d.parent_id, req.usuario.sub]
      );
    }
  }
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
  if ('rol' in d || 'activo' in d) {
    registrarAuditoria({
      campanaId: req.usuario.campana_id, usuarioId: req.usuario.sub, usuarioNombre: req.usuario.nombre,
      accion: 'editar', tabla: 'usuarios', registroId: req.params.id,
      detalle: { cambios: d, persona_afectada: resultado.rows[0].nombre },
      ip: req.ip,
    });
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

router.post('/:id/reasignar-equipo', async (req, res) => {
  const { nuevo_parent_id } = req.body;
  if (!nuevo_parent_id) return res.status(400).json({ ok: false, error: 'Falta el nuevo coordinador destino' });
  if (nuevo_parent_id === req.params.id) return res.status(400).json({ ok: false, error: 'No puede reasignarse a sí mismo' });
  // 🔒 Solo se mueve el equipo de alguien de rango inferior, y solo
  // hacia un coordinador de esta misma campaña.
  const objetivo = await miembroDeMiCampana(req.params.id, req.usuario.campana_id);
  if (!objetivo) return res.status(404).json({ ok: false, error: 'No encontrado' });
  if (!puedeGestionarA(req.usuario, objetivo)) {
    return res.status(403).json({ ok: false, error: MENSAJE_SIN_RANGO });
  }
  const errorReferencia = await referenciasSonDeMiCampana({ parent_id: nuevo_parent_id }, req.usuario.campana_id);
  if (errorReferencia) return res.status(400).json({ ok: false, error: errorReferencia });
  const hijos = await query('SELECT id FROM usuarios WHERE parent_id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (hijos.rows.length === 0) return res.json({ ok: true, movidos: 0 });
  for (const h of hijos.rows) {
    await query(
      `INSERT INTO estructura_historial (campana_id, usuario_id, parent_anterior, parent_nuevo, motivo, cambiado_por)
       VALUES ($1,$2,$3,$4,'Reasignación en bloque',$5)`,
      [req.usuario.campana_id, h.id, req.params.id, nuevo_parent_id, req.usuario.sub]
    );
  }
  await query(
    `UPDATE usuarios SET parent_id=$1 WHERE parent_id=$2 AND campana_id=$3`,
    [nuevo_parent_id, req.params.id, req.usuario.campana_id]
  );
  res.json({ ok: true, movidos: hijos.rows.length });
});

/**
 * 🆕 GET /api/estructura/historial-completo
 * Histórico de asignaciones de TODA la campaña (skill Estructura
 * Política, sección 10) — reconstruye quién estuvo asignado, cuándo,
 * y quién hizo el cambio, sin tener que abrir persona por persona.
 */
router.get('/historial-completo', async (req, res) => {
  const resultado = await query(
    `SELECT h.*, u.nombre as nombre_afectado, ua.nombre as nombre_anterior, un.nombre as nombre_nuevo, uc.nombre as nombre_cambiado_por
     FROM estructura_historial h
     JOIN usuarios u ON u.id = h.usuario_id
     LEFT JOIN usuarios ua ON ua.id = h.parent_anterior
     LEFT JOIN usuarios un ON un.id = h.parent_nuevo
     LEFT JOIN usuarios uc ON uc.id = h.cambiado_por
     WHERE h.campana_id=$1 ORDER BY h.creado_en DESC LIMIT 200`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/:id/historial', async (req, res) => {
  const resultado = await query(
    `SELECT h.*, ua.nombre as nombre_anterior, un.nombre as nombre_nuevo, uc.nombre as nombre_cambiado_por
     FROM estructura_historial h
     LEFT JOIN usuarios ua ON ua.id = h.parent_anterior
     LEFT JOIN usuarios un ON un.id = h.parent_nuevo
     LEFT JOIN usuarios uc ON uc.id = h.cambiado_por
     WHERE h.usuario_id=$1 AND h.campana_id=$2 ORDER BY h.creado_en DESC`,
    [req.params.id, req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// 📊 REPORTE JERÁRQUICO DE EQUIPO — NUEVO
// Para un coordinador dado (ej. un Coordinador Municipal): cuántos
// reportes directos tiene (ej. Enlaces Seccionales), y para cada
// uno de ELLOS, cuántos promotores tiene, y para cada promotor,
// cuántos promovidos capturó — con duplicados marcados (mismo
// nombre + misma sección, sin importar quién lo capturó).
// ═══════════════════════════════════════════════════════════════
router.get('/:id/reporte-equipo', async (req, res) => {
  const coord = await query('SELECT id, nombre, rol, puesto FROM usuarios WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!coord.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado' });

  const directos = await query(
    'SELECT id, nombre, rol, puesto FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
    [req.params.id, req.usuario.campana_id]
  );

  const ramas = [];
  for (const nivelIntermedio of directos.rows) {
    const hijos = await query(
      'SELECT id, nombre, rol FROM usuarios WHERE parent_id=$1 AND campana_id=$2 ORDER BY nombre',
      [nivelIntermedio.id, req.usuario.campana_id]
    );
    const detalleHijos = [];
    let totalRama = 0;
    let duplicadosRama = 0;
    for (const h of hijos.rows) {
      const conteo = await query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE dup.veces > 1) as duplicados
         FROM promovidos prom
         LEFT JOIN (
           SELECT nombre, seccion_id, COUNT(*) as veces
           FROM promovidos WHERE campana_id=$1
           GROUP BY nombre, seccion_id
         ) dup ON dup.nombre = prom.nombre AND dup.seccion_id = prom.seccion_id
         WHERE prom.campana_id=$1 AND prom.registrado_por=$2`,
        [req.usuario.campana_id, h.id]
      );
      const total = parseInt(conteo.rows[0].total);
      const dups = parseInt(conteo.rows[0].duplicados);
      totalRama += total;
      duplicadosRama += dups;
      detalleHijos.push({ id: h.id, nombre: h.nombre, rol: h.rol, total_promovidos: total, duplicados: dups });
    }
    ramas.push({
      id: nivelIntermedio.id, nombre: nivelIntermedio.nombre, rol: nivelIntermedio.rol, puesto: nivelIntermedio.puesto,
      total_personas_directas: hijos.rows.length,
      total_promovidos: totalRama,
      total_duplicados: duplicadosRama,
      personas: detalleHijos,
    });
  }

  res.json({ ok: true, data: { coordinador: coord.rows[0], ramas } });
});

router.get('/ranking/coordinadores', async (req, res) => {
  const coordinadores = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios
     WHERE campana_id=$1 AND rol != 'promotor' AND rol != 'candidato' AND activo != false`,
    [req.usuario.campana_id]
  );
  const ranking = [];
  for (const c of coordinadores.rows) {
    const rama = await query(
      `WITH RECURSIVE descendientes AS (
         SELECT id FROM usuarios WHERE id=$1
         UNION ALL
         SELECT u.id FROM usuarios u JOIN descendientes d ON u.parent_id = d.id WHERE u.campana_id=$2
       )
       SELECT id FROM descendientes`,
      [c.id, req.usuario.campana_id]
    );
    const idsRama = rama.rows.map((r) => r.id);
    const promos = await query(
      `SELECT COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2)`,
      [req.usuario.campana_id, idsRama]
    );
    ranking.push({
      id: c.id, nombre: c.nombre, rol: c.rol, puesto: c.puesto,
      personas_en_rama: idsRama.length - 1,
      promovidos_rama: parseInt(promos.rows[0].total),
    });
  }
  ranking.sort((a, b) => b.promovidos_rama - a.promovidos_rama);
  res.json({ ok: true, data: ranking });
});

const PUNTOS = {
  promovido: 10,
  comprometido: 25,
  seguimiento: 5,
  convertido: 40,
  resultado_dia_d: 50,
  incidencia: 5,
};
const NIVELES_GAMIFICACION = [
  { min: 1500, nombre: 'Leyenda', ic: '👑' },
  { min: 700, nombre: 'Estrella', ic: '🏆' },
  { min: 300, nombre: 'Líder', ic: '⭐' },
  { min: 100, nombre: 'Activo', ic: '🤝' },
  { min: 0, nombre: 'Novato', ic: '🌱' },
];
function calcularNivel(puntos) {
  return NIVELES_GAMIFICACION.find((n) => puntos >= n.min);
}
router.get('/gamificacion', async (req, res) => {
  const personas = await query(
    `SELECT id, nombre, rol, puesto FROM usuarios WHERE campana_id=$1 AND activo != false AND rol NOT IN ('candidato')`,
    [req.usuario.campana_id]
  );
  const [promovidosPorPersona, comprometidosPorPersona, seguimientosPorPersona, convertidosPorPersona, resultadosPorPersona, incidenciasPorPersona] = await Promise.all([
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND comprometido=true GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, SUM(veces_contactado) as total FROM promovidos WHERE campana_id=$1 AND veces_contactado > 0 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT registrado_por as id, COUNT(*) as total FROM promovidos WHERE campana_id=$1 AND clasificacion='base' AND veces_contactado > 0 GROUP BY registrado_por`, [req.usuario.campana_id]),
    query(`SELECT capturado_por as id, COUNT(*) as total FROM resultados_casilla WHERE campana_id=$1 GROUP BY capturado_por`, [req.usuario.campana_id]),
    query(`SELECT reportado_por as id, COUNT(*) as total FROM incidencias WHERE campana_id=$1 GROUP BY reportado_por`, [req.usuario.campana_id]),
  ]);
  const mapa = (rows) => Object.fromEntries(rows.map((r) => [r.id, parseInt(r.total) || 0]));
  const mProm = mapa(promovidosPorPersona.rows), mComp = mapa(comprometidosPorPersona.rows),
        mSeg = mapa(seguimientosPorPersona.rows), mConv = mapa(convertidosPorPersona.rows),
        mRes = mapa(resultadosPorPersona.rows), mInc = mapa(incidenciasPorPersona.rows);
  const ranking = personas.rows.map((p) => {
    const desglose = {
      promovidos: (mProm[p.id] || 0) * PUNTOS.promovido,
      comprometidos: (mComp[p.id] || 0) * PUNTOS.comprometido,
      seguimientos: (mSeg[p.id] || 0) * PUNTOS.seguimiento,
      convertidos: (mConv[p.id] || 0) * PUNTOS.convertido,
      dia_d: (mRes[p.id] || 0) * PUNTOS.resultado_dia_d,
      incidencias: (mInc[p.id] || 0) * PUNTOS.incidencia,
    };
    const puntos = Object.values(desglose).reduce((a, b) => a + b, 0);
    return { id: p.id, nombre: p.nombre, rol: p.rol, puesto: p.puesto, puntos, nivel: calcularNivel(puntos), desglose };
  });
  ranking.sort((a, b) => b.puntos - a.puntos);
  ranking.forEach((r, i) => { r.posicion = i + 1; });
  res.json({ ok: true, data: ranking });
});

router.get('/alertas/rama-dormida', async (req, res) => {
  const coordinadores = await query(
    `SELECT id, nombre, puesto FROM usuarios WHERE campana_id=$1 AND rol != 'promotor' AND rol != 'candidato' AND activo != false`,
    [req.usuario.campana_id]
  );
  const alertas = [];
  for (const c of coordinadores.rows) {
    const rama = await query(
      `WITH RECURSIVE descendientes AS (
         SELECT id FROM usuarios WHERE id=$1
         UNION ALL
         SELECT u.id FROM usuarios u JOIN descendientes d ON u.parent_id = d.id WHERE u.campana_id=$2
       )
       SELECT id FROM descendientes`,
      [c.id, req.usuario.campana_id]
    );
    const idsRama = rama.rows.map((r) => r.id);
    if (idsRama.length <= 1) continue;
    const actividad = await query(
      `SELECT COUNT(*) as total FROM promovidos
       WHERE campana_id=$1 AND registrado_por = ANY($2) AND creado_en > now() - interval '14 days'`,
      [req.usuario.campana_id, idsRama]
    );
    if (parseInt(actividad.rows[0].total) === 0) {
      alertas.push({ id: c.id, nombre: c.nombre, puesto: c.puesto, personas_en_rama: idsRama.length - 1 });
    }
  }
  res.json({ ok: true, data: alertas });
});

router.get('/vacantes/catalogo', async (req, res) => {
  const CATALOGO = [
    'Secretario Particular', 'Coordinador General de Campaña', 'Coordinador Jurídico', 'Coordinador Territorial', 'Coordinador Político', 'Coordinador de Comunicación', 'Coordinador de Finanzas',
    'Coordinador de Jóvenes', 'Coordinador de Mujeres', 'Coordinador Empresarial', 'Coordinador de Adultos Mayores', 'Coordinador de Colonias', 'Coordinador de Transporte y Logística', 'Coordinador de Eventos',
  ];
  const ocupados = await query(`SELECT DISTINCT puesto FROM usuarios WHERE campana_id=$1 AND puesto IS NOT NULL AND activo != false`, [req.usuario.campana_id]);
  const puestosOcupados = new Set(ocupados.rows.map((r) => r.puesto));
  const vacantes = CATALOGO.filter((p) => !puestosOcupados.has(p));
  res.json({ ok: true, data: vacantes });
});

router.get('/:id/zonas', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero FROM zonas_asignadas z JOIN secciones s ON s.id = z.seccion_id
     WHERE z.campana_id=$1 AND z.usuario_id=$2 ORDER BY s.numero`,
    [req.usuario.campana_id, req.params.id]
  );
  res.json({ ok: true, data: resultado.rows.map((r) => r.numero) });
});

router.get('/:id/rendimiento-rama', async (req, res) => {
  const rama = await query(
    `WITH RECURSIVE descendientes AS (
       SELECT id, nombre, rol, puesto FROM usuarios WHERE id=$1 AND campana_id=$2
       UNION ALL
       SELECT u.id, u.nombre, u.rol, u.puesto FROM usuarios u
       JOIN descendientes d ON u.parent_id = d.id
       WHERE u.campana_id=$2
     )
     SELECT id, nombre, rol, puesto FROM descendientes`,
    [req.params.id, req.usuario.campana_id]
  );
  const idsRama = rama.rows.map((r) => r.id);
  if (idsRama.length === 0) return res.status(404).json({ ok: false, error: 'No encontrado' });
  const idsSinRaiz = idsRama.slice(1);
  const promosRes = await query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE comprometido) as comprometidos
     FROM promovidos WHERE campana_id=$1 AND registrado_por = ANY($2)`,
    [req.usuario.campana_id, idsRama]
  );
  const porNivel = {};
  rama.rows.slice(1).forEach((r) => { porNivel[r.rol] = (porNivel[r.rol] || 0) + 1; });
  const mejorRes = await query(
    `SELECT u.id, u.nombre, u.puesto, COUNT(p.id) as total_promovidos
     FROM usuarios u LEFT JOIN promovidos p ON p.registrado_por = u.id AND p.campana_id=$1
     WHERE u.id = ANY($2) AND u.rol='promotor'
     GROUP BY u.id, u.nombre, u.puesto ORDER BY total_promovidos DESC LIMIT 1`,
    [req.usuario.campana_id, idsRama]
  );
  res.json({
    ok: true,
    data: {
      total_personas_en_rama: idsSinRaiz.length,
      total_promovidos_rama: parseInt(promosRes.rows[0].total),
      total_comprometidos_rama: parseInt(promosRes.rows[0].comprometidos),
      desglose_por_nivel: porNivel,
      mejor_promotor: mejorRes.rows[0] || null,
    },
  });
});

router.get('/representantes-ine', async (req, res) => {
  const resultado = await query(
    `SELECT a.id, a.nombre_rep, a.telefono_rep, a.estado, a.fecha_ini, a.fecha_vence, a.notas,
            s.numero as seccion_numero
     FROM activos a LEFT JOIN secciones s ON s.id = a.seccion_id
     WHERE a.campana_id=$1 AND a.tipo='ine_representante'
     ORDER BY s.numero`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

router.get('/cobertura-casillas', async (req, res) => {
  // Antes esto SIEMPRE traía las 634 secciones del estado completo,
  // sin importar que la campaña fuera municipal — un candidato a
  // Presidente Municipal veía casillas de municipios que ni siquiera
  // le corresponden. Ahora se recorta al territorio real de SU
  // campaña, igual que ya se hace en el Mapa y en Priorización.
  const campana = await query('SELECT territorio_tipo, territorio_id FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const { territorio_tipo, territorio_id } = campana.rows[0] || {};

  let filtroTerritorio = '';
  const params = [req.usuario.estado_id];
  if (territorio_tipo === 'municipio' && territorio_id) {
    filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2)`;
    params.push(territorio_id);
  } else if (territorio_tipo === 'distrito_local' && territorio_id) {
    filtroTerritorio = 'AND s.distrito_local = $2';
    params.push(territorio_id);
  } else if (territorio_tipo === 'distrito_federal' && territorio_id) {
    filtroTerritorio = 'AND s.distrito_federal = $2';
    params.push(territorio_id);
  } else if (territorio_tipo === 'seccion' && territorio_id) {
    filtroTerritorio = 'AND s.numero = $2';
    params.push(territorio_id);
  }
  // territorio_tipo 'estatal' (Gobernador/Senador) o sin definir —
  // no se agrega filtro, sí les corresponde ver todo el estado.

  const oficiales = await query(
    `SELECT co.id, co.seccion_id, co.tipo, co.electores_estimados, s.numero as seccion_numero
     FROM casillas_oficiales co JOIN secciones s ON s.id = co.seccion_id
     WHERE s.estado_id=$1 ${filtroTerritorio} ORDER BY s.numero, co.tipo`,
    params
  );
  const asignadas = await query(
    `SELECT seccion_id, numero, representante_id FROM casillas WHERE campana_id=$1`,
    [req.usuario.campana_id]
  );
  const seccionesConRepresentante = new Set(
    asignadas.rows.filter((a) => a.representante_id).map((a) => a.seccion_id)
  );
  const conteoAsignadasPorSeccion = {};
  asignadas.rows.forEach((a) => {
    if (a.representante_id) conteoAsignadasPorSeccion[a.seccion_id] = (conteoAsignadasPorSeccion[a.seccion_id] || 0) + 1;
  });
  const porSeccion = {};
  oficiales.rows.forEach((o) => {
    if (!porSeccion[o.seccion_id]) porSeccion[o.seccion_id] = { seccion_id: o.seccion_id, seccion_numero: o.seccion_numero, casillas_oficiales: [], cubiertas: 0 };
    porSeccion[o.seccion_id].casillas_oficiales.push({ id: o.id, tipo: o.tipo, electores_estimados: o.electores_estimados });
  });
  Object.values(porSeccion).forEach((s) => {
    s.total_oficiales = s.casillas_oficiales.length;
    s.cubiertas = Math.min(conteoAsignadasPorSeccion[s.seccion_id] || 0, s.total_oficiales);
    s.completa = s.cubiertas >= s.total_oficiales;
  });
  const lista = Object.values(porSeccion).sort((a, b) => a.seccion_numero - b.seccion_numero);
  const incompletas = lista.filter((s) => !s.completa);
  res.json({
    ok: true,
    data: {
      total_secciones: lista.length,
      secciones_completas: lista.length - incompletas.length,
      secciones_incompletas: incompletas.length,
      total_casillas_oficiales: oficiales.rows.length,
      total_casillas_cubiertas: lista.reduce((s, x) => s + x.cubiertas, 0),
      detalle: lista,
    },
  });
});

const esquemaCasillaOficial = z.object({
  seccion_numero: z.number().int(),
  tipo: z.string().min(2).max(20),
  electores_estimados: z.number().int().positive().optional(),
});

router.post('/casillas-oficiales', async (req, res) => {
    // 🔒 La base oficial de casillas es COMPARTIDA por todas las
    // campañas del estado (viene del INE). Antes cualquier campaña
    // podía agregar o borrar casillas y alterar la base de TODAS las
    // demás. Ahora solo se ajusta desde el panel de administrador de
    // VotoTech.
    return res.status(403).json({ ok: false, error: 'La base oficial de casillas es compartida y solo la ajusta el equipo de VotoTech. Si ves un error, escríbenos por WhatsApp y lo corregimos.' });
});

router.delete('/casillas-oficiales/:id', async (req, res) => {
    // 🔒 La base oficial de casillas es COMPARTIDA por todas las
    // campañas del estado (viene del INE). Antes cualquier campaña
    // podía agregar o borrar casillas y alterar la base de TODAS las
    // demás. Ahora solo se ajusta desde el panel de administrador de
    // VotoTech.
    return res.status(403).json({ ok: false, error: 'La base oficial de casillas es compartida y solo la ajusta el equipo de VotoTech. Si ves un error, escríbenos por WhatsApp y lo corregimos.' });
});

const PORCENTAJE_META_PERSONAL = 0.08;
router.get('/sugerir-meta', async (req, res) => {
  const { territorio_tipo, territorio_id } = req.query;
  if (!territorio_tipo || !territorio_id) return res.json({ ok: true, data: null });
  let listaNominal = 0;
  if (territorio_tipo === 'seccion') {
    const r = await query('SELECT lista_nominal FROM secciones WHERE estado_id=$1 AND numero=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = r.rows[0]?.lista_nominal || 0;
  } else if (territorio_tipo === 'municipio') {
    const r = await query(
      `SELECT SUM(s.lista_nominal) as total FROM secciones s
       JOIN municipios m ON m.id = s.municipio_id
       WHERE s.estado_id=$1 AND m.clave_ine=$2`,
      [req.usuario.estado_id, territorio_id]
    );
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  } else if (territorio_tipo === 'distrito_local') {
    const r = await query('SELECT SUM(lista_nominal) as total FROM secciones WHERE estado_id=$1 AND distrito_local=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  } else if (territorio_tipo === 'distrito_federal') {
    const r = await query('SELECT SUM(lista_nominal) as total FROM secciones WHERE estado_id=$1 AND distrito_federal=$2', [req.usuario.estado_id, territorio_id]);
    listaNominal = parseInt(r.rows[0]?.total) || 0;
  }
  const campana = await query('SELECT fecha_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const fechaEleccion = campana.rows[0]?.fecha_eleccion;
  const diasRestantes = fechaEleccion ? Math.max(1, Math.ceil((new Date(fechaEleccion) - new Date()) / 86400000)) : 180;
  const metaTotal = Math.round(listaNominal * PORCENTAJE_META_PERSONAL);
  const metaDiaria = Math.max(1, Math.round(metaTotal / diasRestantes));
  res.json({ ok: true, data: { lista_nominal: listaNominal, meta_total_sugerida: metaTotal, dias_restantes: diasRestantes, meta_diaria_sugerida: metaDiaria } });
});

// ═══════════════════════════════════════════════════════════════
// 🔁 DUPLICADOS — CUÁNTAS PERSONAS DISTINTAS REGISTRAN AL MISMO
// PROMOVIDO — NUEVO
// Mismo criterio de duplicado que ya usa el sistema: mismo nombre +
// misma sección. Aquí se agrega el ángulo que faltaba: no solo
// "cuántas veces se intentó", sino CUÁNTAS PERSONAS DISTINTAS lo
// intentaron — útil para ver de un vistazo si varios promotores
// están trabajando la misma calle sin saberlo.
// ═══════════════════════════════════════════════════════════════
router.get('/duplicados', async (req, res) => {
  const resultado = await query(
    `SELECT s.numero as seccion_numero, prom.nombre,
            COUNT(*) as veces_registrado,
            COUNT(DISTINCT prom.registrado_por) as personas_distintas,
            array_agg(DISTINCT u.nombre) as registrado_por_nombres
     FROM promovidos prom
     JOIN secciones s ON s.id = prom.seccion_id
     LEFT JOIN usuarios u ON u.id = prom.registrado_por
     WHERE prom.campana_id=$1
     GROUP BY s.numero, prom.nombre
     HAVING COUNT(*) > 1
     ORDER BY personas_distintas DESC, veces_registrado DESC
     LIMIT 200`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

// ═══════════════════════════════════════════════════════════════
// 🌎 REGIONES — para organizar el territorio en bloques manejables.
// 🆕 RECONSTRUIDO — la versión anterior nunca llegó a subirse al
// servidor (por eso "no se podía crear" ninguna). Esta vez además
// se corrige el diseño: una campaña de UN SOLO municipio (Ayuntamiento,
// Presidencia de Comunidad) agrupa por SECCIÓN, porque agrupar por
// "municipios" no tiene sentido cuando solo hay 1. Una campaña más
// grande (Diputación, Gobernador) sigue agrupando por municipio.
// ═══════════════════════════════════════════════════════════════

async function obtenerUnidadTipo(campanaId) {
  const campana = await query('SELECT territorio_tipo FROM campanas WHERE id=$1', [campanaId]);
  // Con un solo municipio en juego, la única subdivisión que tiene
  // sentido es por sección — con más de un municipio en juego
  // (distrito, todo el estado), agrupar por municipio sí es útil.
  return campana.rows[0]?.territorio_tipo === 'municipio' ? 'seccion' : 'municipio';
}

// 🆕 Devuelve SOLO las secciones/municipios que en verdad le
// corresponden a la campaña, según su territorio real
// (campanas.territorio_tipo / territorio_id) — mismo criterio que ya
// se usa en Mapa, Priorización y Cobertura de Casillas. Antes el
// selector de "Regiones" siempre pedía las 634 secciones o los 60
// municipios de TODO el estado, sin importar que la campaña fuera de
// un solo municipio.
async function obtenerUnidadesDisponibles(campanaId, estadoId, unidadTipo) {
  const campana = await query('SELECT territorio_tipo, territorio_id FROM campanas WHERE id=$1', [campanaId]);
  const { territorio_tipo, territorio_id } = campana.rows[0] || {};

  if (unidadTipo === 'seccion') {
    // Campaña de un solo municipio — las unidades son las secciones DE ESE municipio.
    let filtro = '';
    const params = [estadoId];
    if (territorio_tipo === 'municipio' && territorio_id) {
      filtro = 'AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2)';
      params.push(territorio_id);
    }
    const r = await query(
      `SELECT s.numero as id, s.numero as nombre FROM secciones s WHERE s.estado_id=$1 ${filtro} ORDER BY s.numero`,
      params
    );
    return r.rows.map((x) => ({ id: x.id, nombre: `Sección ${String(x.nombre).padStart(3, '0')}` }));
  }

  // Campaña de distrito/estado — las unidades son los municipios DENTRO de ese territorio.
  let filtro = '';
  const params = [estadoId];
  if (territorio_tipo === 'distrito_local' && territorio_id) {
    filtro = 'AND m.id IN (SELECT DISTINCT municipio_id FROM secciones WHERE estado_id=$1 AND distrito_local=$2)';
    params.push(territorio_id);
  } else if (territorio_tipo === 'distrito_federal' && territorio_id) {
    filtro = 'AND m.id IN (SELECT DISTINCT municipio_id FROM secciones WHERE estado_id=$1 AND distrito_federal=$2)';
    params.push(territorio_id);
  }
  // territorio_tipo 'estatal' (Gobernador/Senador) o sin definir — le corresponde todo el estado.
  const r = await query(`SELECT m.id, m.nombre FROM municipios m WHERE m.estado_id=$1 ${filtro} ORDER BY m.nombre`, params);
  return r.rows;
}

router.get('/regiones', async (req, res) => {
  const unidadTipo = await obtenerUnidadTipo(req.usuario.campana_id);
  const [resultado, unidades] = await Promise.all([
    query(
      `SELECT r.*, u.nombre as coordinador_nombre,
         (SELECT COUNT(*) FROM usuarios u2 WHERE u2.region_id = r.id) as total_equipo
       FROM regiones_campana r
       LEFT JOIN usuarios u ON u.region_id = r.id AND u.rol = 'coord_regional'
       WHERE r.campana_id = $1 ORDER BY r.nombre`,
      [req.usuario.campana_id]
    ),
    obtenerUnidadesDisponibles(req.usuario.campana_id, req.usuario.estado_id, unidadTipo),
  ]);
  res.json({ ok: true, data: resultado.rows, unidad_tipo: unidadTipo, unidades });
});

const esquemaRegion = z.object({
  nombre: z.string().min(2).max(100),
  unidades_ids: z.array(z.number().int()).min(1, 'Selecciona al menos una unidad'),
});

router.post('/regiones', async (req, res) => {
  const parseado = esquemaRegion.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const unidadTipo = await obtenerUnidadTipo(req.usuario.campana_id);
  const resultado = await query(
    `INSERT INTO regiones_campana (campana_id, nombre, municipios_ids, unidad_tipo, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.usuario.campana_id, d.nombre, d.unidades_ids, unidadTipo, req.usuario.sub]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.patch('/regiones/:id', async (req, res) => {
  const parseado = esquemaRegion.partial().safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  const d = parseado.data;
  const campos = [];
  const valores = [];
  let i = 1;
  if (d.nombre !== undefined) { campos.push(`nombre=$${i++}`); valores.push(d.nombre); }
  if (d.unidades_ids !== undefined) { campos.push(`municipios_ids=$${i++}`); valores.push(d.unidades_ids); }
  if (campos.length === 0) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
  valores.push(req.params.id, req.usuario.campana_id);
  const resultado = await query(`UPDATE regiones_campana SET ${campos.join(', ')} WHERE id=$${i} AND campana_id=$${i + 1} RETURNING *`, valores);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/regiones/:id', async (req, res) => {
  const conGente = await query('SELECT COUNT(*) as total FROM usuarios WHERE region_id=$1', [req.params.id]);
  if (parseInt(conGente.rows[0].total) > 0) {
    return res.status(400).json({ ok: false, error: 'Esta región todavía tiene personas asignadas — reasígnalas antes de borrarla.' });
  }
  await query('DELETE FROM regiones_campana WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// 🗳️ REPRESENTANTES DE CASILLA — lista filtrable, para el selector
// de asignación. 🆕 Antes el selector mostraba TODA la estructura
// (coordinadores, promotores, voluntarios...) — ahora solo trae
// gente con rol representante_casilla, con su disponibilidad
// (si ya está asignado a una casilla o no) para buscar más fácil.
// ═══════════════════════════════════════════════════════════════
router.get('/representantes-casilla', async (req, res) => {
  const { buscar, disponibles } = req.query;
  let sql = `
    SELECT u.id, u.nombre, u.telefono, u.email,
      c.id as casilla_id, c.numero as casilla_numero, s.numero as seccion_numero
    FROM usuarios u
    LEFT JOIN casillas c ON c.representante_id = u.id AND c.campana_id = u.campana_id
    LEFT JOIN secciones s ON s.id = c.seccion_id
    WHERE u.campana_id = $1 AND u.rol = 'representante_casilla' AND u.activo != false`;
  const params = [req.usuario.campana_id];
  if (buscar) { params.push(`%${buscar}%`); sql += ` AND u.nombre ILIKE $${params.length}`; }
  if (disponibles === 'true') sql += ` AND c.id IS NULL`;
  sql += ' ORDER BY u.nombre';
  const resultado = await query(sql, params);
  res.json({ ok: true, data: resultado.rows });
});

export default router;

import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

const ROLES_EXPORT = ['candidato', 'jefe_campana', 'coord_general'];

function estiloEncabezado(hoja) {
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  hoja.getRow(1).height = 22;
}

router.get('/promovidos', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const datos = await query(
    `SELECT p.nombre, p.telefono, p.curp, s.numero as seccion, p.calle,
            p.partido, p.clasificacion, p.temperatura,
            CASE WHEN p.comprometido THEN 'Sí' ELSE 'No' END as comprometido,
            p.num_contactos, p.ultimo_contacto, u.nombre as registrado_por, p.creado_en
     FROM promovidos p
     LEFT JOIN secciones s ON s.id = p.seccion_id
     LEFT JOIN usuarios u ON u.id = p.registrado_por
     WHERE p.campana_id = $1 ORDER BY s.numero, p.nombre`,
    [req.usuario.campana_id]
  );

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Promovidos');
  hoja.columns = [
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Teléfono', key: 'telefono', width: 14 },
    { header: 'CURP', key: 'curp', width: 20 },
    { header: 'Sección', key: 'seccion', width: 9 },
    { header: 'Calle', key: 'calle', width: 25 },
    { header: 'Partido', key: 'partido', width: 10 },
    { header: 'Clasificación', key: 'clasificacion', width: 13 },
    { header: 'Temperatura', key: 'temperatura', width: 12 },
    { header: 'Comprometido', key: 'comprometido', width: 13 },
    { header: 'Contactos', key: 'num_contactos', width: 10 },
    { header: 'Último contacto', key: 'ultimo_contacto', width: 16 },
    { header: 'Registrado por', key: 'registrado_por', width: 22 },
    { header: 'Fecha registro', key: 'creado_en', width: 16 },
  ];
  datos.rows.forEach((f) => hoja.addRow(f));
  estiloEncabezado(hoja);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=promovidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

router.get('/gastos', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const gastos = await query(
    `SELECT g.fecha, g.categoria, g.descripcion, g.monto, g.proveedor, g.rfc,
            g.factura_uuid, g.forma_pago, u.nombre as registrado_por
     FROM gastos_campana g JOIN usuarios u ON u.id = g.registrado_por
     WHERE g.campana_id = $1 ORDER BY g.fecha`,
    [req.usuario.campana_id]
  );
  const campana = await query('SELECT nombre_candidato, tope_gasto_ople FROM campanas WHERE id=$1', [req.usuario.campana_id]);

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Gastos detalle');
  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Categoría', key: 'categoria', width: 20 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Monto (MXN)', key: 'monto', width: 14 },
    { header: 'Proveedor', key: 'proveedor', width: 28 },
    { header: 'RFC', key: 'rfc', width: 16 },
    { header: 'Factura (UUID)', key: 'factura_uuid', width: 38 },
    { header: 'Forma de pago', key: 'forma_pago', width: 14 },
    { header: 'Registró', key: 'registrado_por', width: 22 },
  ];
  gastos.rows.forEach((f) => hoja.addRow({ ...f, monto: parseFloat(f.monto) }));
  hoja.getColumn('monto').numFmt = '$#,##0.00';
  estiloEncabezado(hoja);

  const resumen = libro.addWorksheet('Resumen OPLE');
  const porCategoria = {};
  let total = 0;
  gastos.rows.forEach((g) => {
    porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + parseFloat(g.monto);
    total += parseFloat(g.monto);
  });
  resumen.addRow(['Candidato', campana.rows[0]?.nombre_candidato || '']);
  resumen.addRow(['Fecha de corte', new Date().toLocaleDateString('es-MX')]);
  resumen.addRow([]);
  resumen.addRow(['Categoría', 'Total gastado']);
  Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).forEach(([cat, monto]) => {
    resumen.addRow([cat, monto]);
  });
  resumen.addRow([]);
  resumen.addRow(['TOTAL', total]);
  const tope = campana.rows[0]?.tope_gasto_ople ? parseFloat(campana.rows[0].tope_gasto_ople) : null;
  if (tope) {
    resumen.addRow(['Tope OPLE autorizado', tope]);
    resumen.addRow(['Disponible', tope - total]);
    resumen.addRow(['% utilizado', `${((total / tope) * 100).toFixed(1)}%`]);
  }
  resumen.getColumn(2).numFmt = '$#,##0.00';
  resumen.getColumn(1).width = 28;
  resumen.getColumn(2).width = 18;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=gastos_ople_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

/**
 * 🆕 GET /api/exportar/activos-excel
 * Inventario completo de activos con su ciclo de vida — incluye
 * responsable, estado, y qué pasó con cada uno al darse de baja
 * (transferido/vendido/donado/destruido), tal como lo exige el
 * control de inventarios del Reglamento de Fiscalización.
 */
router.get('/activos-excel', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const datos = await query(
    `SELECT a.codigo_inventario, a.tipo, a.subtipo, a.direccion, a.empresa, a.costo,
            a.fecha_ini, a.fecha_vence, a.estado, r.nombre as responsable,
            a.fecha_baja, a.destino_baja, a.motivo_baja, a.valor_venta
     FROM activos a LEFT JOIN usuarios r ON r.id = a.responsable_id
     WHERE a.campana_id=$1 ORDER BY a.creado_en DESC`,
    [req.usuario.campana_id]
  );

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Inventario de Activos');
  hoja.columns = [
    { header: 'Código', key: 'codigo_inventario', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Detalle', key: 'subtipo', width: 20 },
    { header: 'Ubicación/Descripción', key: 'direccion', width: 28 },
    { header: 'Proveedor/Empresa', key: 'empresa', width: 22 },
    { header: 'Costo', key: 'costo', width: 12 },
    { header: 'Fecha alta', key: 'fecha_ini', width: 14 },
    { header: 'Vigencia', key: 'fecha_vence', width: 14 },
    { header: 'Responsable', key: 'responsable', width: 22 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Fecha de baja', key: 'fecha_baja', width: 14 },
    { header: 'Destino de baja', key: 'destino_baja', width: 18 },
    { header: 'Motivo de baja', key: 'motivo_baja', width: 30 },
    { header: 'Valor de venta', key: 'valor_venta', width: 14 },
  ];
  datos.rows.forEach((f) => hoja.addRow({ ...f, costo: f.costo ? parseFloat(f.costo) : null, valor_venta: f.valor_venta ? parseFloat(f.valor_venta) : null }));
  hoja.getColumn('costo').numFmt = '$#,##0.00';
  hoja.getColumn('valor_venta').numFmt = '$#,##0.00';
  estiloEncabezado(hoja);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=inventario_activos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

/**
 * 🆕 GET /api/exportar/comprobantes-pdf
 * El "paquete de comprobantes" — un PDF armado con cada gasto que
 * tiene evidencia adjunta, mostrando la foto del comprobante junto
 * con sus datos (fecha, monto, proveedor, categoría). Pensado para
 * que el Responsable de Finanzas de la campaña tenga, en un solo
 * documento, todo lo que necesita para recapturar en el SIF —
 * VotoTech prepara el paquete, la presentación oficial la hace la
 * campaña directo en el portal del INE.
 */
router.get('/comprobantes-pdf', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const campana = await query('SELECT nombre_candidato, tipo_eleccion FROM campanas WHERE id=$1', [req.usuario.campana_id]);
  const gastos = await query(
    `SELECT fecha, categoria, descripcion, monto, proveedor, rfc, tipo_comprobante, numero_comprobante, evidencia_url
     FROM gastos_campana WHERE campana_id=$1 ORDER BY fecha`,
    [req.usuario.campana_id]
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=paquete_comprobantes_${new Date().toISOString().slice(0, 10)}.pdf`);

  const doc = new PDFDocument({ margin: 40, size: 'letter' });
  doc.pipe(res);

  doc.fontSize(18).fillColor('#14123D').text('Paquete de Comprobantes de Campaña', { align: 'center' });
  doc.fontSize(10).fillColor('#666').text(campana.rows[0]?.nombre_candidato || '', { align: 'center' });
  doc.text(`Generado el ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center' });
  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#999').text('Documento de apoyo interno — no sustituye la presentación oficial ante el Sistema Integral de Fiscalización (SIF) del INE, la cual debe realizar el Responsable de Finanzas directamente en el portal oficial.', { align: 'left' });
  doc.moveDown(1);

  let totalGeneral = 0;
  let sinEvidencia = 0;

  for (const g of gastos.rows) {
    totalGeneral += parseFloat(g.monto);
    if (doc.y > 650) doc.addPage();

    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#14123D').font('Helvetica-Bold').text(`${g.descripcion}`, { continued: false });
    doc.fontSize(9).fillColor('#333').font('Helvetica');
    doc.text(`Fecha: ${new Date(g.fecha).toLocaleDateString('es-MX')}   ·   Categoría: ${g.categoria}   ·   Monto: $${parseFloat(g.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
    if (g.proveedor) doc.text(`Proveedor: ${g.proveedor}${g.rfc ? ` (RFC: ${g.rfc})` : ''}`);
    doc.text(`Comprobante: ${g.tipo_comprobante || 'sin_comprobante'}${g.numero_comprobante ? ` · Folio ${g.numero_comprobante}` : ''}`);

    if (g.evidencia_url) {
      try {
        const respuesta = await fetch(g.evidencia_url);
        if (respuesta.ok) {
          const buffer = Buffer.from(await respuesta.arrayBuffer());
          const alturaDisponible = 792 - doc.y - 60;
          doc.image(buffer, { fit: [220, Math.min(220, alturaDisponible)], align: 'left' });
          doc.moveDown(0.5);
        }
      } catch (e) {
        doc.fontSize(8).fillColor('#dc2626').text('⚠️ No se pudo cargar la imagen del comprobante');
      }
    } else {
      sinEvidencia++;
      doc.fontSize(8).fillColor('#dc2626').text('⚠️ Sin evidencia fotográfica adjunta');
    }
    doc.moveDown(0.8);
    doc.strokeColor('#e5e5e5').moveTo(40, doc.y).lineTo(570, doc.y).stroke();
  }

  doc.addPage();
  doc.fontSize(14).fillColor('#14123D').font('Helvetica-Bold').text('Resumen');
  doc.fontSize(10).fillColor('#333').font('Helvetica').moveDown(0.5);
  doc.text(`Total de gastos incluidos: ${gastos.rows.length}`);
  doc.text(`Gastos sin evidencia fotográfica: ${sinEvidencia}`);
  doc.text(`Monto total: $${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

  doc.end();
});

/**
 * 🆕 GET /api/exportar/oficio-word
 * Carta/oficio formal editable en Word — para que el candidato o su
 * Responsable de Finanzas la use como portada al entregar el
 * paquete de comprobantes a su contador, o como constancia interna
 * de campaña. Se entrega en .docx para poder editarla libremente
 * antes de imprimir/firmar.
 */
router.get('/oficio-word', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const campana = await query(
    `SELECT nombre_candidato, tipo_eleccion, tope_gasto_ople,
            (SELECT COALESCE(SUM(monto),0) FROM gastos_campana WHERE campana_id=campanas.id) as total_gastado
     FROM campanas WHERE id=$1`,
    [req.usuario.campana_id]
  );
  const c = campana.rows[0];
  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const totalGastado = parseFloat(c.total_gastado || 0);
  const tope = c.tope_gasto_ople ? parseFloat(c.tope_gasto_ople) : null;

  const parrafo = (texto, opciones = {}) => new Paragraph({ children: [new TextRun({ text: texto, ...opciones })], spacing: { after: 200 } });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'OFICIO DE ENTREGA DE COMPROBANTES DE CAMPAÑA', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
        parrafo(`Tlaxcala, Tlaxcala, a ${fecha}.`),
        parrafo(''),
        parrafo('A quien corresponda:'),
        parrafo(''),
        parrafo(`Por medio del presente, se hace entrega del paquete de comprobantes correspondientes a los gastos de la campaña "${c.nombre_candidato}" (${c.tipo_eleccion}), para su revisión y, en su caso, captura en el Sistema Integral de Fiscalización (SIF) del Instituto Nacional Electoral.`),
        parrafo(''),
        parrafo(`Monto total de gastos reportados a la fecha: $${totalGastado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.`, { bold: true }),
        tope ? parrafo(`Tope de gasto autorizado: $${tope.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${((totalGastado / tope) * 100).toFixed(1)}% utilizado).`) : parrafo(''),
        parrafo(''),
        parrafo('Este documento es una constancia interna de campaña, generada como apoyo administrativo. No sustituye la presentación oficial de informes ante el Instituto Nacional Electoral ni ante el organismo público local competente, la cual es responsabilidad exclusiva del Responsable de Finanzas de la campaña.'),
        parrafo(''),
        parrafo(''),
        parrafo('_______________________________', { }),
        parrafo('Responsable de Finanzas de Campaña'),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename=oficio_comprobantes_${new Date().toISOString().slice(0, 10)}.docx`);
  res.send(buffer);
});

router.get('/estructura', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const datos = await query(
    `SELECT u.nombre, u.email, u.telefono, u.rol, p.nombre as reporta_a, u.creado_en
     FROM usuarios u LEFT JOIN usuarios p ON p.id = u.parent_id
     WHERE u.campana_id = $1 ORDER BY u.rol, u.nombre`,
    [req.usuario.campana_id]
  );

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Estructura');
  hoja.columns = [
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Correo', key: 'email', width: 30 },
    { header: 'Teléfono', key: 'telefono', width: 14 },
    { header: 'Rol', key: 'rol', width: 18 },
    { header: 'Reporta a', key: 'reporta_a', width: 30 },
    { header: 'Fecha de alta', key: 'creado_en', width: 16 },
  ];
  datos.rows.forEach((f) => hoja.addRow(f));
  estiloEncabezado(hoja);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=estructura_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

router.get('/incidencias', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const datos = await query(
    `SELECT i.tipo, i.urgencia, i.descripcion, s.numero as seccion, i.casilla,
            i.testigos, CASE WHEN i.notificado_ople THEN 'Sí' ELSE 'No' END as notificado_ople,
            i.estado, u.nombre as reportado_por, i.creado_en
     FROM incidencias i
     LEFT JOIN secciones s ON s.id = i.seccion_id
     JOIN usuarios u ON u.id = i.reportado_por
     WHERE i.campana_id = $1 ORDER BY i.creado_en DESC`,
    [req.usuario.campana_id]
  );

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Incidencias');
  hoja.columns = [
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Urgencia', key: 'urgencia', width: 10 },
    { header: 'Descripción', key: 'descripcion', width: 45 },
    { header: 'Sección', key: 'seccion', width: 9 },
    { header: 'Casilla', key: 'casilla', width: 10 },
    { header: 'Testigos', key: 'testigos', width: 25 },
    { header: 'Notificado OPLE', key: 'notificado_ople', width: 14 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Reportó', key: 'reportado_por', width: 22 },
    { header: 'Fecha', key: 'creado_en', width: 18 },
  ];
  datos.rows.forEach((f) => hoja.addRow(f));
  estiloEncabezado(hoja);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=incidencias_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

router.get('/respaldo-completo', requiereRol(...ROLES_EXPORT), async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const libro = new ExcelJS.Workbook();

  const agregarHoja = async (nombre, sql, columnas) => {
    const datos = await query(sql, [campanaId]);
    const hoja = libro.addWorksheet(nombre);
    hoja.columns = columnas;
    datos.rows.forEach((f) => hoja.addRow(f));
    estiloEncabezado(hoja);
    return datos.rows.length;
  };

  await agregarHoja('Promovidos',
    `SELECT p.nombre, p.telefono, s.numero as seccion, p.partido, p.clasificacion, p.comprometido, p.creado_en
     FROM promovidos p LEFT JOIN secciones s ON s.id=p.seccion_id WHERE p.campana_id=$1 ORDER BY p.creado_en`,
    [{ header: 'Nombre', key: 'nombre', width: 28 }, { header: 'Teléfono', key: 'telefono', width: 14 },
     { header: 'Sección', key: 'seccion', width: 10 }, { header: 'Partido', key: 'partido', width: 12 },
     { header: 'Clasificación', key: 'clasificacion', width: 14 }, { header: 'Comprometido', key: 'comprometido', width: 14 },
     { header: 'Fecha', key: 'creado_en', width: 18 }]);

  await agregarHoja('Estructura',
    `SELECT nombre, email, telefono, rol, puesto, meta_diaria, creado_en FROM usuarios WHERE campana_id=$1 ORDER BY rol`,
    [{ header: 'Nombre', key: 'nombre', width: 28 }, { header: 'Correo', key: 'email', width: 26 },
     { header: 'Teléfono', key: 'telefono', width: 14 }, { header: 'Rol', key: 'rol', width: 16 },
     { header: 'Puesto', key: 'puesto', width: 22 }, { header: 'Meta diaria', key: 'meta_diaria', width: 12 },
     { header: 'Fecha', key: 'creado_en', width: 18 }]);

  await agregarHoja('Activos',
    `SELECT a.tipo, s.numero as seccion, a.direccion, a.empresa, a.costo, a.fecha_ini, a.estado
     FROM activos a LEFT JOIN secciones s ON s.id=a.seccion_id WHERE a.campana_id=$1`,
    [{ header: 'Tipo', key: 'tipo', width: 16 }, { header: 'Sección', key: 'seccion', width: 10 },
     { header: 'Dirección', key: 'direccion', width: 30 }, { header: 'Empresa', key: 'empresa', width: 22 },
     { header: 'Costo', key: 'costo', width: 12 }, { header: 'Fecha colocación', key: 'fecha_ini', width: 16 },
     { header: 'Estado', key: 'estado', width: 12 }]);

  await agregarHoja('Incidencias',
    `SELECT i.tipo, i.urgencia, i.descripcion, s.numero as seccion, i.estado, i.creado_en
     FROM incidencias i LEFT JOIN secciones s ON s.id=i.seccion_id WHERE i.campana_id=$1`,
    [{ header: 'Tipo', key: 'tipo', width: 16 }, { header: 'Urgencia', key: 'urgencia', width: 12 },
     { header: 'Descripción', key: 'descripcion', width: 40 }, { header: 'Sección', key: 'seccion', width: 10 },
     { header: 'Estado', key: 'estado', width: 12 }, { header: 'Fecha', key: 'creado_en', width: 18 }]);

  await agregarHoja('Finanzas',
    `SELECT categoria, descripcion, monto, fecha, proveedor, forma_pago FROM gastos_campana WHERE campana_id=$1 ORDER BY fecha`,
    [{ header: 'Categoría', key: 'categoria', width: 18 }, { header: 'Descripción', key: 'descripcion', width: 30 },
     { header: 'Monto', key: 'monto', width: 12 }, { header: 'Fecha', key: 'fecha', width: 14 },
     { header: 'Proveedor', key: 'proveedor', width: 22 }, { header: 'Forma de pago', key: 'forma_pago', width: 14 }]);

  await agregarHoja('Agenda',
    `SELECT titulo, tipo, fecha_inicio, lugar, realizado FROM agenda WHERE campana_id=$1 ORDER BY fecha_inicio`,
    [{ header: 'Título', key: 'titulo', width: 30 }, { header: 'Tipo', key: 'tipo', width: 14 },
     { header: 'Fecha', key: 'fecha_inicio', width: 18 }, { header: 'Lugar', key: 'lugar', width: 26 },
     { header: 'Realizado', key: 'realizado', width: 12 }]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=respaldo_completo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

export default router;

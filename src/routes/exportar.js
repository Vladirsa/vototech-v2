import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

// Solo roles de dirección pueden exportar bases de datos completas —
// un promotor de campo no debe poder llevarse el padrón entero.
const ROLES_EXPORT = ['candidato', 'jefe_campana', 'coord_general'];

function estiloEncabezado(hoja) {
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  hoja.getRow(1).height = 22;
}

/**
 * GET /api/exportar/promovidos
 * Excel completo del CRM electoral, con clasificación estratégica.
 */
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

/**
 * GET /api/exportar/gastos
 * Excel de gastos con formato de columnas alineado a lo que pide el
 * OPLE/INE para fiscalización (proveedor, RFC, factura, forma de pago),
 * más hoja de resumen por categoría con validación contra el tope.
 */
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

  // Hoja 1: detalle de gastos
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

  // Hoja 2: resumen por categoría + control del tope
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
 * GET /api/exportar/estructura
 * Directorio completo del equipo de campaña.
 */
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

/**
 * GET /api/exportar/incidencias
 * Excel de incidencias con formato para reportar al OPLE — incluye
 * si ya fue notificada formalmente o no.
 */
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

/**
 * GET /api/exportar/respaldo-completo
 * Todo lo que le pertenece a la campaña, en un solo Excel con una
 * hoja por cada tipo de dato — la versión HONESTA de "restaurar
 * campaña": en una base de datos compartida entre muchas campañas,
 * no se puede regresar en el tiempo solo la tuya, pero sí puedes
 * tener tu propia copia completa, descargable cuando quieras, para
 * tu propio respaldo o si algún día decides dejar la plataforma.
 */
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

  const totalHojas = libro.worksheets.length;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=respaldo_completo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await libro.xlsx.write(res);
  res.end();
});

export default router;

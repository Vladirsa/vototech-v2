import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';
import { generarToken } from '../middleware/auth.js';
import { crearDemo } from '../../seed-demo.js';
import { repararListaNominal, cargarResultadosHistoricosGenerico } from '../../seed.js';
import { importarCallesInegi } from '../../import-calles-inegi.js';
import { listarRespaldos, generarLinkDescarga, ejecutarRestauracion } from '../lib/respaldoAutomatico.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(requiereSuperAdmin); // TODO en este archivo requiere la clave secreta

/**
 * POST /api/admin/codigos-acceso
 * Genera un código de acceso — sin uno de estos, nadie puede
 * siquiera empezar a registrar una campaña nueva.
 */
router.post('/codigos-acceso', async (req, res) => {
  const codigo = 'ACC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const resultado = await query(
    'INSERT INTO codigos_acceso_campana (codigo, nota) VALUES ($1,$2) RETURNING *',
    [codigo, req.body.nota || null]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0] });
});

router.get('/codigos-acceso', async (req, res) => {
  const resultado = await query('SELECT * FROM codigos_acceso_campana ORDER BY creado_en DESC');
  res.json({ ok: true, data: resultado.rows });
});

router.get('/campanas', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, COUNT(u.id) as total_usuarios, MAX(u.ultimo_acceso) as ultimo_acceso,
            (SELECT telefono FROM usuarios WHERE campana_id=c.id AND rol='candidato' LIMIT 1) as telefono_candidato
     FROM campanas c LEFT JOIN usuarios u ON u.campana_id = c.id
     GROUP BY c.id ORDER BY c.creado_en DESC`
  );
  res.json({ ok: true, data: resultado.rows });
});

router.patch('/campanas/:id/aprobar', async (req, res) => {
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='aprobada', activa=true,
       fecha_activacion=now(), fecha_vencimiento=now() + interval '1 month'
     WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (resultado.rows[0]) {
    await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'aprobada','1 mes de gracia otorgado')`,
      [req.params.id, resultado.rows[0].nombre_candidato]);
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/campanas/:id/rechazar', async (req, res) => {
  const resultado = await query(
    `UPDATE campanas SET estado_aprobacion='rechazada', activa=false WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (resultado.rows[0]) {
    await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion) VALUES ($1,$2,'rechazada')`,
      [req.params.id, resultado.rows[0].nombre_candidato]);
  }
  res.json({ ok: true, data: resultado.rows[0] });
});

router.get('/municipios', async (req, res) => {
  // 🆕 Ahora acepta ?estado_id= — antes solo mostraba los de Tlaxcala
  // sin importar qué se pidiera.
  const estadoId = req.query.estado_id ? parseInt(req.query.estado_id) : 29;
  const resultado = await query(
    `SELECT clave_ine, nombre FROM municipios WHERE estado_id=$1 ORDER BY nombre`,
    [estadoId]
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * 🆕 GET /api/admin/estados
 * Los 32 estados de México, ya cargados de fábrica en la tabla
 * "estados" — para llenar el selector de "¿en cuál estado hago esto?"
 * en las herramientas de carga de datos.
 */
router.get('/estados', async (req, res) => {
  const resultado = await query('SELECT id, nombre FROM estados WHERE activo=true ORDER BY id');
  res.json({ ok: true, data: resultado.rows });
});

router.post('/crear-demo', async (req, res) => {
  try {
    const { tipoEleccion, municipioClaveIne, nombreMunicipio, distritoNumero, estadoId } = req.body;
    const credenciales = await crearDemo({
      tipoEleccion: tipoEleccion || undefined,
      municipioClaveIne: municipioClaveIne ? parseInt(municipioClaveIne) : undefined,
      nombreMunicipio: nombreMunicipio || undefined,
      distritoNumero: distritoNumero ? parseInt(distritoNumero) : undefined,
      // 🆕 Antes SIEMPRE creaba la demo en Tlaxcala — ahora acepta
      // cualquier estado que ya tenga su cartografía cargada.
      estadoId: estadoId ? parseInt(estadoId) : undefined,
    });
    res.json({ ok: true, data: credenciales, mensaje: 'Cuenta demo creada correctamente' });
  } catch (e) {
    console.error('Error creando demo:', e);
    res.status(500).json({ ok: false, error: 'No se pudo crear la demo: ' + e.message });
  }
});

router.post('/campanas/:id/continuar', async (req, res) => {
  const usuario = await query(
    `SELECT u.*, c.subdominio, c.estado_id FROM usuarios u
     JOIN campanas c ON c.id = u.campana_id
     WHERE u.campana_id = $1 AND u.rol = 'candidato'
     ORDER BY u.creado_en LIMIT 1`,
    [req.params.id]
  );
  if (!usuario.rows[0]) return res.status(404).json({ ok: false, error: 'Esta campaña no tiene un usuario candidato' });

  const token = generarToken(usuario.rows[0]);
  res.json({ ok: true, data: { token, subdominio: usuario.rows[0].subdominio, nombre: usuario.rows[0].nombre } });
});

router.delete('/codigos-acceso/:id', async (req, res) => {
  await query('DELETE FROM codigos_acceso_campana WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.patch('/campanas/:id/renovar', async (req, res) => {
  const meses = parseInt(req.body.meses) || 1;
  if (meses < 1 || meses > 24) return res.status(400).json({ ok: false, error: 'Meses inválido' });

  const resultado = await query(
    `UPDATE campanas SET
       fecha_vencimiento = GREATEST(COALESCE(fecha_vencimiento, now()), now()) + ($1 || ' months')::interval,
       activa = true
     WHERE id=$2 RETURNING *`,
    [meses, req.params.id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'renovada',$3)`,
    [req.params.id, resultado.rows[0].nombre_candidato, `+${meses} mes(es)`]);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/campanas/:id/pausar', async (req, res) => {
  const resultado = await query(`UPDATE campanas SET activa=false WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'pausada',$3)`,
    [req.params.id, resultado.rows[0].nombre_candidato, req.body.motivo || null]);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.patch('/campanas/:id/reactivar', async (req, res) => {
  const resultado = await query(`UPDATE campanas SET activa=true WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'reactivada',NULL)`,
    [req.params.id, resultado.rows[0].nombre_candidato]);
  res.json({ ok: true, data: resultado.rows[0] });
});

router.delete('/campanas/:id', async (req, res) => {
  try {
    const resultado = await query('DELETE FROM campanas WHERE id=$1 RETURNING nombre_candidato', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
    await query(`INSERT INTO admin_bitacora (nombre_campana, accion) VALUES ($1,'borrada')`, [resultado.rows[0].nombre_candidato]);
    res.json({ ok: true, mensaje: `Campaña de ${resultado.rows[0].nombre_candidato} eliminada por completo` });
  } catch (e) {
    console.error('Error borrando campaña:', e);
    res.status(500).json({ ok: false, error: 'No se pudo borrar la campaña. Puede tener datos relacionados que lo impiden.' });
  }
});

router.get('/bitacora', async (req, res) => {
  const resultado = await query('SELECT * FROM admin_bitacora ORDER BY creado_en DESC LIMIT 100');
  res.json({ ok: true, data: resultado.rows });
});

router.post('/reparar-lista-nominal', async (req, res) => {
  try {
    const actualizadas = await repararListaNominal();
    res.json({ ok: true, actualizadas, mensaje: `${actualizadas} secciones actualizadas con su lista nominal real` });
  } catch (e) {
    console.error('Error reparando lista nominal:', e);
    res.status(500).json({ ok: false, error: 'No se pudo reparar: ' + e.message });
  }
});

/**
 * 🆕 POST /api/admin/cargar-resultados-historicos
 * Carga los resultados históricos de CUALQUIER tipo de elección y
 * año — pensado para 2027 y adelante. Solo necesitas subir el
 * archivo con el formato correcto a backend/datos-origen/ antes de
 * tocar el botón.
 */
router.post('/cargar-resultados-historicos', async (req, res) => {
  const { tipoEleccion, anio } = req.body;
  if (!tipoEleccion || !anio) return res.status(400).json({ ok: false, error: 'Falta tipoEleccion o anio' });
  try {
    const resultado = await cargarResultadosHistoricosGenerico(tipoEleccion, anio);
    res.json({ ok: true, ...resultado, mensaje: `✅ ${resultado.filas} filas cargadas desde ${resultado.archivo}` });
  } catch (e) {
    console.error('Error cargando resultados históricos:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * 🆕 GET /api/admin/resumen-datos/:estadoId
 * Cuántas secciones, afiliados, y qué cobertura de resultados
 * históricos ya tienes cargada — para la pantalla de "Carga de Datos
 * por Estado" (así se ve de un vistazo qué falta, sin tener que ir a
 * revisar la base directamente).
 */
router.get('/resumen-datos/:estadoId', async (req, res) => {
  const estadoId = parseInt(req.params.estadoId);
  const secciones = await query(`SELECT COUNT(*) as total FROM secciones WHERE estado_id=$1`, [estadoId]);
  const afiliados = await query(
    `SELECT COUNT(*) as total FROM usuarios u JOIN campanas c ON c.id=u.campana_id WHERE c.estado_id=$1 AND u.rol='voluntario'`,
    [estadoId]
  ).catch(() => ({ rows: [{ total: 0 }] }));
  const porTipo = await query(
    `SELECT rh.tipo_eleccion, rh.anio, COUNT(DISTINCT rh.seccion_id) as secciones_con_dato
     FROM resultados_historicos rh
     JOIN secciones s ON s.id = rh.seccion_id
     WHERE s.estado_id=$1
     GROUP BY rh.tipo_eleccion, rh.anio
     ORDER BY rh.anio DESC, rh.tipo_eleccion`,
    [estadoId]
  );
  res.json({
    ok: true,
    data: {
      total_secciones: parseInt(secciones.rows[0].total),
      total_afiliados: parseInt(afiliados.rows[0]?.total || 0),
      resultados_por_tipo: porTipo.rows.map((r) => ({ ...r, secciones_con_dato: parseInt(r.secciones_con_dato) })),
    },
  });
});

/**
 * 🆕 POST /api/admin/subir-resultados-historicos
 * Sube un CSV con resultados electorales por sección (columnas:
 * seccion,partido,votos — lista_nominal opcional) y los carga a
 * resultados_historicos. Pensado para 2027: en vez de subir un
 * archivo JS al repositorio, se sube el CSV directo desde esta
 * pantalla, sin tocar GitHub ni código.
 */
router.post('/subir-resultados-historicos', upload.single('archivo'), async (req, res) => {
  const { estado_id, tipo_eleccion, anio } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
  if (!estado_id || !tipo_eleccion || !anio) return res.status(400).json({ ok: false, error: 'Falta estado_id, tipo_eleccion o anio' });

  const texto = req.file.buffer.toString('utf-8');
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const encabezado = lineas[0].toLowerCase().split(',').map((c) => c.trim());
  const idxSeccion = encabezado.indexOf('seccion');
  const idxPartido = encabezado.indexOf('partido');
  const idxVotos = encabezado.indexOf('votos');
  const idxListaNominal = encabezado.indexOf('lista_nominal');

  if (idxSeccion === -1 || idxPartido === -1 || idxVotos === -1) {
    return res.status(400).json({ ok: false, error: 'El CSV debe tener las columnas: seccion,partido,votos (lista_nominal es opcional)' });
  }

  let cargadas = 0, errores = 0, seccionesActualizadas = 0;
  for (const linea of lineas.slice(1)) {
    const cols = linea.split(',').map((c) => c.trim());
    const numeroSeccion = parseInt(cols[idxSeccion]);
    const partido = cols[idxPartido]?.toLowerCase();
    const votos = parseInt(cols[idxVotos]);
    if (isNaN(numeroSeccion) || !partido || isNaN(votos)) { errores++; continue; }

    try {
      const seccionRes = await query(`SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2`, [estado_id, numeroSeccion]);
      if (!seccionRes.rows[0]) { errores++; continue; }
      const seccionId = seccionRes.rows[0].id;

      await query(
        `INSERT INTO resultados_historicos (seccion_id, tipo_eleccion, anio, partido, votos)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (seccion_id, tipo_eleccion, anio, partido) DO UPDATE SET votos=EXCLUDED.votos`,
        [seccionId, tipo_eleccion, parseInt(anio), partido, votos]
      );
      cargadas++;

      if (idxListaNominal !== -1 && cols[idxListaNominal]) {
        const ln = parseInt(cols[idxListaNominal]);
        if (!isNaN(ln)) {
          await query(`UPDATE secciones SET lista_nominal=$1 WHERE id=$2`, [ln, seccionId]);
          seccionesActualizadas++;
        }
      }
    } catch (e) { errores++; }
  }

  res.json({
    ok: true,
    mensaje: `✅ ${cargadas} filas cargadas, ${seccionesActualizadas} secciones con lista nominal actualizada, ${errores} filas con error.`,
  });
});

/**
 * 🆕 POST /api/admin/importar-calles-inegi
 * Descarga el catálogo de vialidades del INEGI para Tlaxcala y lo
 * carga a la base — un botón, sin necesitar Shell de Render (que
 * requiere plan de pago). Puede tardar varios minutos; el frontend
 * debe avisar que no se cierre la pestaña mientras corre.
 */
router.post('/importar-calles-inegi', async (req, res) => {
  try {
    // 🆕 Ahora acepta el estado desde el frontend — si no se manda,
    // sigue funcionando igual que antes (Tlaxcala por defecto).
    const estadoId = req.body.estado_id ? parseInt(req.body.estado_id) : 29;
    const resultado = await importarCallesInegi(estadoId);
    if (!resultado.ok) {
      return res.status(422).json(resultado); // capa no detectada — trae el listado para ajustar
    }
    res.json(resultado);
  } catch (e) {
    console.error('Error importando calles del INEGI:', e);
    res.status(500).json({ ok: false, error: 'No se pudo importar: ' + e.message });
  }
});

/**
 * 🆕 POST /api/admin/generar-casillas-oficiales
 * Genera de golpe las casillas estimadas para las 634 secciones del
 * estado (regla INE: 1 casilla por cada 750 electores o fracción) —
 * un catálogo de referencia ESTATAL, independiente de cualquier
 * campaña, para que la numeración (B, C1, C2...) sea consistente sin
 * importar qué campaña la consulte. Seguro de correr más de una vez
 * — no duplica lo que ya existe.
 */
router.post('/generar-casillas-oficiales', async (req, res) => {
  try {
    // 🆕 Ahora acepta el estado desde el frontend — antes SIEMPRE
    // generaba solo las de Tlaxcala (estado_id=29 fijo), sin importar
    // qué se le pidiera.
    const estadoId = req.body.estado_id ? parseInt(req.body.estado_id) : 29;
    const secciones = await query(
      `SELECT id, numero, lista_nominal FROM secciones WHERE estado_id=$1 AND lista_nominal > 0`,
      [estadoId]
    );

    let creadas = 0, secccionesProcesadas = 0;
    for (const s of secciones.rows) {
      secccionesProcesadas++;
      const sugeridas = Math.ceil(Math.max(1, s.lista_nominal || 0) / 750);
      const personasEstimadas = Math.round(s.lista_nominal / sugeridas);
      const nombresCasilla = ['B', ...Array.from({ length: Math.max(0, sugeridas - 1) }, (_, i) => `C${i + 1}`)];

      for (const numero of nombresCasilla) {
        const resultado = await query(
          `INSERT INTO casillas_oficiales_estado (seccion_id, numero, lista_nominal_seccion, personas_estimadas)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (seccion_id, numero) DO NOTHING RETURNING id`,
          [s.id, numero, s.lista_nominal, personasEstimadas]
        );
        if (resultado.rows[0]) creadas++;
      }
    }

    res.json({
      ok: true,
      mensaje: `${creadas} casillas nuevas generadas en ${secccionesProcesadas} secciones (las que ya existían no se duplicaron).`,
      creadas, secccionesProcesadas,
    });
  } catch (e) {
    console.error('Error generando casillas oficiales:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar: ' + e.message });
  }
});

router.get('/respaldos/:campanaId', async (req, res) => {
  const lista = await listarRespaldos(req.params.campanaId);
  res.json({ ok: true, data: lista });
});

router.get('/respaldos/:campanaId/descargar/:archivo', async (req, res) => {
  try {
    const url = await generarLinkDescarga(req.params.campanaId, req.params.archivo);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No se pudo generar el link: ' + e.message });
  }
});

router.get('/solicitudes-restauracion', async (req, res) => {
  const r = await query(
    `SELECT s.*, c.nombre_candidato, u.nombre as solicitado_por_nombre FROM solicitudes_restauracion s
     JOIN campanas c ON c.id = s.campana_id
     LEFT JOIN usuarios u ON u.id = s.solicitado_por
     WHERE s.estado='pendiente' ORDER BY s.creado_en DESC`
  );
  res.json({ ok: true, data: r.rows });
});

router.post('/solicitar-restauracion', async (req, res) => {
  const { campana_id, fecha_respaldo } = req.body;
  if (!campana_id || !fecha_respaldo) return res.status(400).json({ ok: false, error: 'Falta campana_id o fecha_respaldo' });
  const resultado = await query(
    `INSERT INTO solicitudes_restauracion (campana_id, fecha_respaldo, solicitado_por_admin, aprobado_admin)
     VALUES ($1,$2,true,true) RETURNING *`,
    [campana_id, fecha_respaldo]
  );
  res.status(201).json({ ok: true, data: resultado.rows[0], mensaje: 'Solicitud creada — falta que el candidato la apruebe de su lado.' });
});

router.post('/aprobar-restauracion/:id', async (req, res) => {
  const solicitud = await query('SELECT * FROM solicitudes_restauracion WHERE id=$1', [req.params.id]);
  if (!solicitud.rows[0]) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
  if (solicitud.rows[0].estado !== 'pendiente') return res.status(400).json({ ok: false, error: 'Esta solicitud ya fue procesada' });

  await query('UPDATE solicitudes_restauracion SET aprobado_admin=true WHERE id=$1', [req.params.id]);
  const actualizada = (await query('SELECT * FROM solicitudes_restauracion WHERE id=$1', [req.params.id])).rows[0];

  if (actualizada.aprobado_candidato && actualizada.aprobado_admin) {
    try {
      await ejecutarRestauracion(req.params.id);
      return res.json({ ok: true, mensaje: '✅ Restauración completada.' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Error al restaurar: ' + e.message });
    }
  }
  res.json({ ok: true, mensaje: 'Aprobado de tu lado — falta la aprobación del candidato.' });
});

/**
 * 🆕 POST /api/admin/migrar-geometria-secciones
 * Migración de UNA SOLA VEZ: copia la geometría del archivo estático
 * secciones_tlaxcala.geojson hacia la columna secciones.geometria.
 * Después de esto, la base de datos es la fuente de verdad — no el
 * archivo — y cualquier estado nuevo sigue el mismo patrón sin
 * necesitar un archivo .geojson por estado.
 */
router.post('/migrar-geometria-secciones', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const rutaArchivo = path.join(__dirname, '../db/secciones_tlaxcala.geojson');
    const geo = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));

    let migradas = 0, sinCoincidencia = 0;
    for (const feat of geo.features) {
      const numero = feat.properties.seccion;
      const resultado = await query(
        `UPDATE secciones SET geometria=$1::jsonb WHERE estado_id=29 AND numero=$2`,
        [JSON.stringify(feat.geometry), numero]
      );
      if (resultado.rowCount > 0) migradas++;
      else sinCoincidencia++;
    }

    res.json({ ok: true, mensaje: `✅ ${migradas} secciones migradas a la base de datos, ${sinCoincidencia} sin coincidencia.`, migradas, sinCoincidencia });
  } catch (e) {
    console.error('Error migrando geometría:', e);
    res.status(500).json({ ok: false, error: 'No se pudo migrar: ' + e.message });
  }
});

/**
 * 🆕 POST /api/admin/importar-cartografia-estado
 * LA HERRAMIENTA ÚNICA — reemplaza a "Importar Estado Nuevo" +
 * "Importar geometría" (que hacían esto en 2 pasos) Y a "Expandir a
 * Otro Estado" (que tenía pantalla pero nunca tuvo backend real).
 *
 * Un solo archivo GeoJSON de secciones (el que ya bajaste del INE y
 * convertiste con mapshaper.org) trae todo lo necesario en sus
 * propiedades — no hace falta armar un CSV aparte. Detecta solo los
 * nombres de columna más comunes que usa el INE (varían según año y
 * estado), así que no depende de que alguien le diga a mano cómo se
 * llama cada campo.
 */
const CAMPOS_SECCION = ['seccion', 'SECCION', 'Seccion', 'SECCION_', 'NUM_SECCIO', 'seccion_'];
const CAMPOS_MUNICIPIO_NOMBRE = ['municipio', 'MUNICIPIO', 'Municipio', 'NOM_MUN', 'NOMBRE_MUN', 'nom_mun'];
const CAMPOS_MUNICIPIO_CLAVE = ['municipio_clave_ine', 'CVE_MUN', 'cve_mun', 'MUN', 'mun', 'clave_municipio'];
const CAMPOS_DISTRITO_LOCAL = ['distrito_local', 'DISTRITO_L', 'DTO_LOCAL', 'DTO_LOC', 'distrito_loc', 'DISTRITO_LOC'];
const CAMPOS_DISTRITO_FEDERAL = ['distrito_federal', 'DISTRITO_F', 'DTO_FEDERAL', 'DTO_FED', 'distrito_fed', 'DISTRITO_FED'];
const CAMPOS_LISTA_NOMINAL = ['lista_nominal', 'LISTA_NOM', 'LN', 'ln'];

function primerCampoQueExista(propiedades, nombresPosibles) {
  for (const nombre of nombresPosibles) {
    if (propiedades[nombre] !== undefined && propiedades[nombre] !== null && propiedades[nombre] !== '') return propiedades[nombre];
  }
  return null;
}

router.post('/importar-cartografia-estado', upload.single('geojson'), async (req, res) => {
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, error: 'Falta estado_id' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió el archivo GeoJSON' });

  let geo;
  try {
    geo = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'El archivo no es un GeoJSON válido' });
  }
  if (!geo.features || geo.features.length === 0) {
    return res.status(400).json({ ok: false, error: 'El archivo no tiene "features" — no parece un GeoJSON de secciones' });
  }

  // Muestra las propiedades reales del primer elemento si algo
  // esencial no se detecta — así no hay que adivinar a ciegas.
  const propiedadesEjemplo = geo.features[0].properties;
  const seccionDetectada = primerCampoQueExista(propiedadesEjemplo, CAMPOS_SECCION);
  const municipioDetectado = primerCampoQueExista(propiedadesEjemplo, CAMPOS_MUNICIPIO_NOMBRE);
  if (seccionDetectada === null || municipioDetectado === null) {
    return res.status(422).json({
      ok: false,
      error: 'No se pudo detectar automáticamente el número de sección o el nombre del municipio en este archivo.',
      propiedadesDeEjemplo: propiedadesEjemplo,
      sugerencia: 'Copia y pega estas propiedades en el chat — con eso se agregan los nombres de columna que falten.',
    });
  }

  const municipiosCache = {};
  let municipiosCreados = 0, seccionesCreadas = 0, errores = 0;

  for (const feat of geo.features) {
    const p = feat.properties;
    const numeroSeccion = primerCampoQueExista(p, CAMPOS_SECCION);
    const municipioNombre = primerCampoQueExista(p, CAMPOS_MUNICIPIO_NOMBRE);
    const municipioClaveExplicita = primerCampoQueExista(p, CAMPOS_MUNICIPIO_CLAVE);
    const distritoLocal = primerCampoQueExista(p, CAMPOS_DISTRITO_LOCAL);
    const distritoFederal = primerCampoQueExista(p, CAMPOS_DISTRITO_FEDERAL);
    const listaNominal = primerCampoQueExista(p, CAMPOS_LISTA_NOMINAL);

    if (numeroSeccion === null || !municipioNombre) { errores++; continue; }

    try {
      let municipioId = municipiosCache[municipioNombre];
      if (!municipioId) {
        if (municipioClaveExplicita) {
          // El archivo sí trae la clave oficial del municipio — se usa tal cual.
          const creado = await query(
            `INSERT INTO municipios (nombre, clave_ine, estado_id) VALUES ($1,$2,$3)
             ON CONFLICT (estado_id, clave_ine) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`,
            [municipioNombre, parseInt(municipioClaveExplicita), estado_id]
          );
          municipioId = creado.rows[0].id;
        } else {
          // Sin clave explícita — se busca por nombre, o se crea con
          // la siguiente clave disponible para no inventar duplicados.
          const existente = await query('SELECT id FROM municipios WHERE estado_id=$1 AND nombre=$2', [estado_id, municipioNombre]);
          if (existente.rows[0]) {
            municipioId = existente.rows[0].id;
          } else {
            const siguienteClave = await query('SELECT COALESCE(MAX(clave_ine),0)+1 as siguiente FROM municipios WHERE estado_id=$1', [estado_id]);
            const creado = await query(
              `INSERT INTO municipios (nombre, clave_ine, estado_id) VALUES ($1,$2,$3) RETURNING id`,
              [municipioNombre, siguienteClave.rows[0].siguiente, estado_id]
            );
            municipioId = creado.rows[0].id;
          }
        }
        municipiosCache[municipioNombre] = municipioId;
        municipiosCreados++;
      }

      await query(
        `INSERT INTO secciones (estado_id, numero, municipio_id, distrito_local, distrito_federal, lista_nominal, geometria)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (estado_id, numero) DO UPDATE SET
           municipio_id=EXCLUDED.municipio_id,
           distrito_local=COALESCE(EXCLUDED.distrito_local, secciones.distrito_local),
           distrito_federal=COALESCE(EXCLUDED.distrito_federal, secciones.distrito_federal),
           lista_nominal=COALESCE(EXCLUDED.lista_nominal, secciones.lista_nominal),
           geometria=EXCLUDED.geometria`,
        [estado_id, parseInt(numeroSeccion), municipioId,
         distritoLocal !== null ? parseInt(distritoLocal) : null,
         distritoFederal !== null ? parseInt(distritoFederal) : null,
         listaNominal !== null ? parseInt(listaNominal) : null,
         JSON.stringify(feat.geometry)]
      );
      seccionesCreadas++;
    } catch (e) { errores++; }
  }

  res.json({
    ok: true,
    mensaje: `✅ ${municipiosCreados} municipios y ${seccionesCreadas} secciones (con geometría) cargadas de un solo archivo. ${errores} filas con datos insuficientes.`,
    municipiosCreados, seccionesCreadas, errores,
  });
});


export default router;

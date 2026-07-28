import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { query } from '../db/pool.js';
import { requiereSuperAdmin } from '../middleware/superAdmin.js';
import { generarToken } from '../middleware/auth.js';
import { crearDemo } from '../../seed-demo.js';
import { repararListaNominal } from '../../seed.js';
import { calcularPrecisionAutomatica } from './priorizacion.js';
import { invalidarCacheGeoSecciones } from './geo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * GET /api/admin/campanas
 * Todas las campañas registradas en la plataforma, con su estado
 * de aprobación — esto es tu panel de control central.
 */
router.get('/campanas', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, COUNT(u.id) as total_usuarios, MAX(u.ultimo_acceso) as ultimo_acceso,
            (SELECT telefono FROM usuarios WHERE campana_id=c.id AND rol='candidato' LIMIT 1) as telefono_candidato
     FROM campanas c LEFT JOIN usuarios u ON u.campana_id = c.id
     GROUP BY c.id ORDER BY c.creado_en DESC`
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * PATCH /api/admin/campanas/:id/aprobar
 * Sin esto, la campaña puede haberse registrado con un código
 * válido, pero SIGUE sin poder entrar al sistema hasta que tú,
 * manualmente, le des luz verde aquí.
 */
router.patch('/campanas/:id/aprobar', async (req, res) => {
  // Al aprobar, se activa Y se le da 1 mes de gracia automático desde
  // hoy — el candidato ya puede usar el sistema mientras se coordina
  // el primer pago formal.
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

/**
 * GET /api/admin/municipios
 * Catálogo de municipios de Tlaxcala, para el selector al generar demos.
 */
router.get('/municipios', async (req, res) => {
  const resultado = await query(
    `SELECT clave_ine, nombre FROM municipios WHERE estado_id=29 ORDER BY nombre`
  );
  res.json({ ok: true, data: resultado.rows });
});

/**
 * POST /api/admin/crear-demo
 * Crea (o reconstruye desde cero) la cuenta demo con datos de ejemplo
 * completos — ahora personalizable por tipo de elección y municipio,
 * para presentar a cada candidato con SU propio territorio.
 */
router.post('/crear-demo', async (req, res) => {
  try {
    const { tipoEleccion, municipioClaveIne, nombreMunicipio, distritoNumero } = req.body;
    const credenciales = await crearDemo({
      tipoEleccion: tipoEleccion || undefined,
      municipioClaveIne: municipioClaveIne ? parseInt(municipioClaveIne) : undefined,
      nombreMunicipio: nombreMunicipio || undefined,
      distritoNumero: distritoNumero ? parseInt(distritoNumero) : undefined,
    });
    res.json({ ok: true, data: credenciales, mensaje: 'Cuenta demo creada correctamente' });
  } catch (e) {
    console.error('Error creando demo:', e);
    res.status(500).json({ ok: false, error: 'No se pudo crear la demo: ' + e.message });
  }
});

/**
 * POST /api/admin/campanas/:id/continuar
 * Genera un token válido para entrar a revisar CUALQUIER campaña
 * sin necesitar su contraseña — solo tú, con tu SUPER_ADMIN_KEY,
 * puedes hacer esto. Útil para dar soporte o revisar antes de
 * aprobar/renovar. Entra con el usuario 'candidato' de esa campaña.
 */
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

/**
 * DELETE /api/admin/codigos-acceso/:id
 * Elimina un código de acceso que ya no quieres que se pueda usar
 * (por ejemplo, uno que compartiste por error o ya no aplica).
 */
router.delete('/codigos-acceso/:id', async (req, res) => {
  await query('DELETE FROM codigos_acceso_campana WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/**
 * PATCH /api/admin/campanas/:id/renovar
 * Extiende el vencimiento — se usa cada vez que el candidato paga
 * su mensualidad. body: { meses: 1 } (o 3, 12, lo que hayan pagado)
 */
router.patch('/campanas/:id/renovar', async (req, res) => {
  const meses = parseInt(req.body.meses) || 1;
  if (meses < 1 || meses > 24) return res.status(400).json({ ok: false, error: 'Meses inválido' });

  // Si ya venció, la renovación cuenta desde HOY (no desde la fecha
  // vieja de vencimiento) — así no se "acumulan" meses fantasma de
  // cuando estuvo suspendida.
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

/**
 * PATCH /api/admin/campanas/:id/pausar
 * Suspende el acceso SIN borrar nada — nadie de esa campaña puede
 * iniciar sesión mientras esté pausada, pero todos sus datos siguen
 * intactos. Útil para "no ha pagado este mes" o "pidió una pausa
 * temporal", sin la irreversibilidad de borrar.
 */
router.patch('/campanas/:id/pausar', async (req, res) => {
  const resultado = await query(`UPDATE campanas SET activa=false WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'pausada',$3)`,
    [req.params.id, resultado.rows[0].nombre_candidato, req.body.motivo || null]);
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * PATCH /api/admin/campanas/:id/reactivar
 * Levanta la pausa — vuelve a dejar entrar, sin tocar la fecha de
 * vencimiento (eso es cosa de "renovar", no de "reactivar").
 */
router.patch('/campanas/:id/reactivar', async (req, res) => {
  const resultado = await query(`UPDATE campanas SET activa=true WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  await query(`INSERT INTO admin_bitacora (campana_id, nombre_campana, accion, detalle) VALUES ($1,$2,'reactivada',NULL)`,
    [req.params.id, resultado.rows[0].nombre_candidato]);
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * DELETE /api/admin/campanas/:id
 * Borra la campaña por completo — usuarios, promovidos, todo (el
 * CASCADE en las tablas se encarga). No hay reversa, así que el
 * frontend debe confirmar dos veces antes de llamar esto.
 */
router.delete('/campanas/:id', async (req, res) => {
  try {
    const resultado = await query('DELETE FROM campanas WHERE id=$1 RETURNING nombre_candidato', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
    // campana_id queda NULL (la campaña ya no existe) pero el nombre se
    // conserva — así la bitácora sigue teniendo sentido después de borrar.
    await query(`INSERT INTO admin_bitacora (nombre_campana, accion) VALUES ($1,'borrada')`, [resultado.rows[0].nombre_candidato]);
    res.json({ ok: true, mensaje: `Campaña de ${resultado.rows[0].nombre_candidato} eliminada por completo` });
  } catch (e) {
    console.error('Error borrando campaña:', e);
    res.status(500).json({ ok: false, error: 'No se pudo borrar la campaña. Puede tener datos relacionados que lo impiden.' });
  }
});

/**
 * GET /api/admin/bitacora
 * Historial de qué se aprobó, rechazó, renovó o borró, y cuándo.
 */
router.get('/bitacora', async (req, res) => {
  const resultado = await query('SELECT * FROM admin_bitacora ORDER BY creado_en DESC LIMIT 100');
  res.json({ ok: true, data: resultado.rows });
});

/**
 * POST /api/admin/reparar-lista-nominal
 * Corrige bases de datos que se cargaron antes de que el sistema
 * guardara la lista nominal real por sección — un solo click, sin
 * tener que borrar y recargar todo.
 */
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
 * POST /api/admin/generar-casillas-oficiales
 * La misma lógica de generar-casillas-oficiales.js, pero como botón
 * — para cuando no hay acceso a terminal (plan gratuito de Render).
 * Seguro de correr más de una vez: secciones que ya tienen datos se
 * saltan, nunca duplica.
 */
router.post('/generar-casillas-oficiales', async (req, res) => {
  const ELECTORES_POR_CASILLA = 750;
  try {
    const secciones = await query('SELECT id, numero, lista_nominal FROM secciones WHERE estado_id=29');
    let generadas = 0, saltadas = 0;

    for (const s of secciones.rows) {
      const yaExiste = await query('SELECT 1 FROM casillas_oficiales WHERE seccion_id=$1 LIMIT 1', [s.id]);
      if (yaExiste.rows.length > 0) { saltadas++; continue; }

      const listaNominal = s.lista_nominal || 0;
      const numCasillas = Math.max(1, Math.ceil(listaNominal / ELECTORES_POR_CASILLA));

      for (let i = 0; i < numCasillas; i++) {
        const tipo = i === 0 ? 'basica' : `contigua_${i}`;
        const electoresEstimados = i === numCasillas - 1
          ? listaNominal - (ELECTORES_POR_CASILLA * (numCasillas - 1))
          : ELECTORES_POR_CASILLA;
        await query('INSERT INTO casillas_oficiales (seccion_id, tipo, electores_estimados) VALUES ($1,$2,$3)', [s.id, tipo, electoresEstimados]);
        generadas++;
      }
    }
    res.json({ ok: true, mensaje: `✅ ${generadas} casillas oficiales generadas · ${saltadas} secciones ya tenían datos y se saltaron` });
  } catch (e) {
    console.error('Error generando casillas oficiales:', e);
    res.status(500).json({ ok: false, error: 'No se pudo generar: ' + e.message });
  }
});

/**
 * POST /api/admin/cargar-agregados-2024
 * La misma lógica de cargar-agregados-2024.js, como botón — carga
 * Senadurías, Diputación Federal, Diputación Local y Ayuntamientos
 * 2024. Seguro de correr más de una vez, no duplica.
 */
router.post('/cargar-agregados-2024', async (req, res) => {
  const ESTADO = 29, ANIO = 2024;
  const insertar = async (tipo, nivel, distNum, distCab, partido, candidato, votos, pct, gano, alcaldias, notas) => {
    const existe = await query(
      `SELECT id FROM resultados_agregados WHERE estado_id=$1 AND tipo_eleccion=$2 AND anio=$3 AND nivel=$4
       AND COALESCE(distrito_numero,-1)=COALESCE($5,-1) AND partido=$6`,
      [ESTADO, tipo, ANIO, nivel, distNum, partido]
    );
    if (existe.rows[0]) return false;
    await query(
      `INSERT INTO resultados_agregados (estado_id, tipo_eleccion, anio, nivel, distrito_numero, distrito_cabecera, partido, candidato, votos, porcentaje, gano, alcaldias_ganadas, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [ESTADO, tipo, ANIO, nivel, distNum, distCab, partido, candidato || null, votos || null, pct || null, gano || false, alcaldias || null, notas || null]
    );
    return true;
  };

  try {
    let insertados = 0;
    const contar = async (...args) => { if (await insertar(...args)) insertados++; };

    await contar('senaduria', 'estado', null, null, 'morena', 'Álvarez Lima / Ana Lilia Rivera', 296743, 40.43, true, null, 'Coalición ganadora - 2 escaños por Mayoría Relativa');
    await contar('senaduria', 'estado', null, null, 'pri', 'Anabell Ávalos Zempoalteca', 156674, 21.34, false, null, 'Fuerza y Corazón por México (PAN/PRI/PRD) - 1 escaño por Primera Minoría');
    await contar('senaduria', 'estado', null, null, 'pvem', 'Sergio González Hernández', 87781, 11.97, false, null, 'Compitió solo, fuera de coalición nacional');
    await contar('senaduria', 'estado', null, null, 'mc', 'Elsa Cordero Martínez', 73512, 10.02, false, null, null);
    await contar('senaduria', 'estado', null, null, 'pt', 'Rodrigo Cuahutle Salazar', 67337, 9.17, false, null, 'Compitió solo');
    await contar('senaduria', 'estado', null, null, 'nulos', null, 48108, 6.56, false, null, 'Votos nulos y no registrados');

    await contar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'morena', 'Alejandro Aguilar López (PT/Morena/PVEM)', 141617, 60.37, true, null, 'Reelección');
    await contar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'pri', 'Mariana Jiménez Zamora', 52809, 22.51, false, null, null);
    await contar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'mc', 'Delfino Suárez Piedras', 26762, 11.41, false, null, null);
    await contar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'morena', 'Raymundo Vázquez Conchas (Morena y aliados)', 142476, 65.65, true, null, 'Uno de los más votados a nivel nacional');
    await contar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'pri', 'Eladia Torres Muñoz', 38095, 17.55, false, null, null);
    await contar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'mc', 'Rosa Isela Sánchez Rivera', 23025, 10.60, false, null, null);
    await contar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'pt', 'Irma Yordana Garay Loredo (PT y aliados)', 160049, 62.30, true, null, 'Clan político Garay');
    await contar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'pri', 'Juan Manuel Cambrón Soria', 49338, 19.20, false, null, null);
    await contar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'mc', 'Gelasio Montiel Hernández', 29042, 11.30, false, null, null);
    await contar('dip_federal', 'estado', null, null, 'morena', 'Sigamos Haciendo Historia (Morena/PT/PVEM)', 444142, 62.77, true, null, 'Carro completo en los 3 distritos');
    await contar('dip_federal', 'estado', null, null, 'pri', 'Fuerza y Corazón por México (PAN/PRI/PRD)', 140242, 19.82, false, null, null);
    await contar('dip_federal', 'estado', null, null, 'mc', 'Movimiento Ciudadano', 78829, 11.14, false, null, null);
    await contar('dip_federal', 'estado', null, null, 'nulos', null, 44395, 6.27, false, null, 'Votos nulos y no registrados');

    await contar('dip_local', 'estado', null, null, 'morena', null, null, 28.32, true, null, 'Ganó los 15 distritos de mayoría, sin plurinominales por sobrerrepresentación');
    await contar('dip_local', 'estado', null, null, 'pt', null, null, 9.12, false, null, '2 diputaciones plurinominales');
    await contar('dip_local', 'estado', null, null, 'pvem', null, null, 7.84, false, null, '1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'panalt', null, null, 4.21, false, null, 'Nueva Alianza Tlaxcala - 1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'fxm', null, null, 3.15, false, null, 'Fuerza por México Tlaxcala - conservó registro');
    await contar('dip_local', 'estado', null, null, 'rsp', null, null, 3.08, false, null, 'Conservó registro por margen estrecho');
    await contar('dip_local', 'estado', null, null, 'pan', null, null, 10.24, false, null, '1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'mc', null, null, 9.81, false, null, '1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'pri', null, null, 8.93, false, null, '1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'pac', null, null, 3.95, false, null, 'Alianza Ciudadana - 1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'prd', null, null, 3.22, false, null, '1 diputación plurinominal');
    await contar('dip_local', 'estado', null, null, 'nulos', null, null, 6.13, false, null, 'Votos nulos y no registrados');

    await contar('ayuntamiento', 'estado', null, null, 'morena', null, null, 24.51, true, 18, 'Incluye la capital');
    await contar('ayuntamiento', 'estado', null, null, 'pt', null, null, 10.84, false, 9, null);
    await contar('ayuntamiento', 'estado', null, null, 'pvem', null, null, 9.62, false, 9, null);
    await contar('ayuntamiento', 'estado', null, null, 'pan', null, null, 9.15, false, 4, null);
    await contar('ayuntamiento', 'estado', null, null, 'mc', null, null, 8.43, false, 3, null);
    await contar('ayuntamiento', 'estado', null, null, 'pri', null, null, 7.91, false, 3, null);
    await contar('ayuntamiento', 'estado', null, null, 'pac', null, null, 4.82, false, 4, null);
    await contar('ayuntamiento', 'estado', null, null, 'panalt', null, null, 4.10, false, 2, null);
    await contar('ayuntamiento', 'estado', null, null, 'prd', null, null, 3.76, false, 1, null);
    await contar('ayuntamiento', 'estado', null, null, 'fxm', null, null, 3.44, false, 3, null);
    await contar('ayuntamiento', 'estado', null, null, 'rsp', null, null, 3.11, false, 2, null);
    await contar('ayuntamiento', 'estado', null, null, 'independiente', null, null, 1.81, false, 1, null);
    await contar('ayuntamiento', 'estado', null, null, 'nulos', null, null, 8.50, false, null, 'El más alto de la jornada 2024');

    res.json({ ok: true, mensaje: `✅ ${insertados} registros nuevos cargados (Senadurías, Dip. Federal, Dip. Local, Ayuntamientos 2024)` });
  } catch (e) {
    console.error('Error cargando agregados 2024:', e);
    res.status(500).json({ ok: false, error: 'No se pudo cargar: ' + e.message });
  }
});

const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/admin/subir-resultados-historicos
 * Sube resultados reales por SECCIÓN desde un CSV — columnas
 * esperadas: seccion,partido,votos (lista_nominal opcional).
 * El tipo de elección, año y estado se mandan como campos aparte del
 * formulario, no en cada fila (todas las filas del archivo son del
 * mismo tipo/año). Es seguro de correr más de una vez: si ya existe
 * esa combinación exacta (sección+tipo+año+partido), la actualiza en
 * vez de duplicar.
 */
router.post('/subir-resultados-historicos', uploadCsv.single('archivo'), async (req, res) => {
  const { estado_id, tipo_eleccion, anio } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo CSV' });
  if (!estado_id || !tipo_eleccion || !anio) return res.status(400).json({ ok: false, error: 'Faltan estado_id, tipo_eleccion o anio' });

  let filas;
  try {
    filas = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'El CSV no se pudo leer: ' + e.message });
  }

  let insertadas = 0, actualizadas = 0, sinSeccion = [];
  for (const fila of filas) {
    const numSeccion = parseInt(fila.seccion);
    const votos = parseInt(fila.votos);
    if (!numSeccion || !fila.partido || isNaN(votos)) continue;

    const seccion = await query('SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2', [estado_id, numSeccion]);
    if (!seccion.rows[0]) { sinSeccion.push(numSeccion); continue; }

    const existe = await query(
      'SELECT id FROM resultados_historicos WHERE seccion_id=$1 AND tipo_eleccion=$2 AND anio=$3 AND partido=$4',
      [seccion.rows[0].id, tipo_eleccion, anio, fila.partido]
    );
    if (existe.rows[0]) {
      await query('UPDATE resultados_historicos SET votos=$1, lista_nominal=COALESCE($2,lista_nominal) WHERE id=$3',
        [votos, fila.lista_nominal ? parseInt(fila.lista_nominal) : null, existe.rows[0].id]);
      actualizadas++;
    } else {
      await query(
        'INSERT INTO resultados_historicos (seccion_id, tipo_eleccion, anio, partido, votos, lista_nominal) VALUES ($1,$2,$3,$4,$5,$6)',
        [seccion.rows[0].id, tipo_eleccion, anio, fila.partido, votos, fila.lista_nominal ? parseInt(fila.lista_nominal) : null]
      );
      insertadas++;
    }
  }

  // 🎯 Disparo automático — en cuanto llegan resultados reales,
  // comparar contra la última predicción guardada de cada campaña
  // que compite en esta elección, y guardar la precisión para
  // siempre. El candidato no tiene que hacer nada para esto.
  let mensajePrecision = '';
  try {
    const campanasComparadas = await calcularPrecisionAutomatica(estado_id, tipo_eleccion, anio);
    if (campanasComparadas > 0) mensajePrecision = ` · 🎯 Precisión calculada automáticamente para ${campanasComparadas} campaña(s)`;
  } catch (e) {
    console.error('⚠️ Error calculando precisión automática tras carga:', e.message);
  }

  res.json({
    ok: true,
    mensaje: `✅ ${insertadas} filas nuevas, ${actualizadas} actualizadas` + (sinSeccion.length ? ` — ⚠️ ${sinSeccion.length} filas con sección no encontrada (revisa: ${[...new Set(sinSeccion)].slice(0, 10).join(', ')})` : '') + mensajePrecision,
  });
});

/**
 * POST /api/admin/subir-afiliados
 * CSV esperado: nombre,seccion,telefono,direccion,partido (los 3
 * últimos opcionales). Esto es lista de referencia — NO se mezcla
 * con los promovidos de ninguna campaña, es un catálogo aparte por
 * estado.
 */
router.post('/subir-afiliados', uploadCsv.single('archivo'), async (req, res) => {
  const { estado_id } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo CSV' });
  if (!estado_id) return res.status(400).json({ ok: false, error: 'Falta estado_id' });

  let filas;
  try {
    filas = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'El CSV no se pudo leer: ' + e.message });
  }

  let insertados = 0, sinNombre = 0;
  for (const fila of filas) {
    if (!fila.nombre) { sinNombre++; continue; }
    let seccionId = null;
    if (fila.seccion) {
      const s = await query('SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2', [estado_id, parseInt(fila.seccion)]);
      seccionId = s.rows[0]?.id || null;
    }
    await query(
      'INSERT INTO afiliados (estado_id, nombre, seccion_id, telefono, direccion, partido, fuente_archivo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [estado_id, fila.nombre, seccionId, fila.telefono || null, fila.direccion || null, fila.partido || null, req.file.originalname]
    );
    insertados++;
  }

  res.json({ ok: true, mensaje: `✅ ${insertados} afiliados cargados` + (sinNombre ? ` — ${sinNombre} filas sin nombre, ignoradas` : '') });
});

/**
 * GET /api/admin/resumen-datos/:estadoId
 * Para que el panel muestre "qué tan lleno" está cada estado —
 * cuántas secciones, cuántos resultados por tipo, cuántos afiliados.
 */
router.get('/resumen-datos/:estadoId', async (req, res) => {
  const estadoId = req.params.estadoId;
  const [secciones, resultados, afiliados] = await Promise.all([
    query('SELECT COUNT(*) as total FROM secciones WHERE estado_id=$1', [estadoId]),
    query(`SELECT tipo_eleccion, anio, COUNT(DISTINCT seccion_id) as secciones_con_dato
           FROM resultados_historicos rh JOIN secciones s ON s.id=rh.seccion_id
           WHERE s.estado_id=$1 GROUP BY tipo_eleccion, anio ORDER BY tipo_eleccion, anio`, [estadoId]),
    query('SELECT COUNT(*) as total FROM afiliados WHERE estado_id=$1', [estadoId]),
  ]);
  res.json({
    ok: true,
    data: {
      total_secciones: parseInt(secciones.rows[0].total),
      resultados_por_tipo: resultados.rows,
      total_afiliados: parseInt(afiliados.rows[0].total),
    },
  });
});

/**
 * GET /api/admin/estados — lista de estados que ya existen en el
 * sistema, para el desplegable del panel.
 */
router.get('/estados', async (req, res) => {
  const r = await query('SELECT id, nombre, activo FROM estados ORDER BY nombre');
  res.json({ ok: true, data: r.rows });
});

/**
 * POST /api/admin/estados — da de alta un estado nuevo. El id debe
 * ser la clave oficial del INE para ese estado (1-32), para que
 * coincida con lo que traen los archivos oficiales de cartografía y
 * resultados — no es un número inventado.
 */
router.post('/estados', async (req, res) => {
  const { id, nombre } = req.body;
  if (!id || !nombre) return res.status(400).json({ ok: false, error: 'Falta id (clave INE 1-32) o nombre del estado' });
  const existe = await query('SELECT id FROM estados WHERE id=$1', [id]);
  if (existe.rows[0]) return res.status(400).json({ ok: false, error: `Ya existe un estado con id ${id}` });
  await query('INSERT INTO estados (id, nombre, activo) VALUES ($1,$2,true)', [id, nombre]);
  res.status(201).json({ ok: true, mensaje: `Estado "${nombre}" creado con id ${id}` });
});

/**
 * POST /api/admin/subir-municipios
 * CSV esperado: clave_ine,nombre — el catálogo de municipios de un
 * estado. Necesario ANTES de subir la cartografía, porque cada
 * sección del mapa se vincula a su municipio por esta clave.
 */
router.post('/subir-municipios', uploadCsv.single('archivo'), async (req, res) => {
  const { estado_id } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo CSV' });
  if (!estado_id) return res.status(400).json({ ok: false, error: 'Falta estado_id' });

  let filas;
  try {
    filas = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'El CSV no se pudo leer: ' + e.message });
  }

  let creados = 0, actualizados = 0;
  for (const fila of filas) {
    const claveIne = parseInt(fila.clave_ine);
    if (!claveIne || !fila.nombre) continue;
    const existe = await query('SELECT id FROM municipios WHERE estado_id=$1 AND clave_ine=$2', [estado_id, claveIne]);
    if (existe.rows[0]) {
      await query('UPDATE municipios SET nombre=$1 WHERE id=$2', [fila.nombre, existe.rows[0].id]);
      actualizados++;
    } else {
      await query('INSERT INTO municipios (estado_id, clave_ine, nombre) VALUES ($1,$2,$3)', [estado_id, claveIne, fila.nombre]);
      creados++;
    }
  }
  res.json({ ok: true, mensaje: `✅ ${creados} municipios nuevos, ${actualizados} actualizados` });
});

/**
 * POST /api/admin/subir-cartografia
 * El corazón de expandir a otro estado — sube el GeoJSON oficial de
 * secciones (de la Cartografía Electoral del INE). Cada "feature"
 * debe traer en sus properties: seccion, municipio (la CLAVE del
 * municipio, no el nombre), distrito_local, distrito_federal, y
 * opcionalmente lista_nominal. Requiere que los municipios de ese
 * estado YA estén cargados (paso anterior), porque cada sección se
 * vincula a su municipio por esa clave.
 *
 * Hace 2 cosas a la vez: (1) llena la tabla `secciones` en la base
 * de datos — lo que usan Priorización, Reportes, etc. — y (2) guarda
 * el archivo geográfico en disco para que el Mapa Electoral lo
 * pueda dibujar. Es seguro volver a correrlo (actualiza, no duplica).
 */
router.post('/subir-cartografia', uploadCsv.single('archivo'), async (req, res) => {
  const { estado_id } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo GeoJSON' });
  if (!estado_id) return res.status(400).json({ ok: false, error: 'Falta estado_id' });

  let geojson;
  try {
    geojson = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'El archivo no es un GeoJSON válido: ' + e.message });
  }
  if (!geojson.features || !Array.isArray(geojson.features)) {
    return res.status(400).json({ ok: false, error: 'El GeoJSON no tiene "features" — no es cartografía de secciones válida' });
  }

  // Catálogo de municipios de este estado, para resolver clave -> id
  const municipiosRes = await query('SELECT id, clave_ine FROM municipios WHERE estado_id=$1', [estado_id]);
  const municipioIdPorClave = {};
  municipiosRes.rows.forEach((m) => { municipioIdPorClave[m.clave_ine] = m.id; });
  if (municipiosRes.rows.length === 0) {
    return res.status(400).json({ ok: false, error: 'Este estado no tiene municipios cargados todavía — sube primero el catálogo de municipios.' });
  }

  let insertadas = 0, actualizadas = 0;
  const sinMunicipio = new Set();
  const featuresLimpias = [];

  for (const feature of geojson.features) {
    const p = feature.properties || {};
    const numero = parseInt(p.seccion);
    const claveMuni = parseInt(p.municipio);
    if (!numero || !claveMuni) continue;
    const municipioId = municipioIdPorClave[claveMuni];
    if (!municipioId) { sinMunicipio.add(claveMuni); continue; }

    const existe = await query('SELECT id FROM secciones WHERE estado_id=$1 AND numero=$2', [estado_id, numero]);
    if (existe.rows[0]) {
      await query(
        'UPDATE secciones SET municipio_id=$1, distrito_local=$2, distrito_federal=$3, lista_nominal=COALESCE($4,lista_nominal) WHERE id=$5',
        [municipioId, p.distrito_local || null, p.distrito_federal || null, p.lista_nominal ? parseInt(p.lista_nominal) : null, existe.rows[0].id]
      );
      actualizadas++;
    } else {
      await query(
        'INSERT INTO secciones (estado_id, numero, municipio_id, distrito_local, distrito_federal, lista_nominal) VALUES ($1,$2,$3,$4,$5,$6)',
        [estado_id, numero, municipioId, p.distrito_local || null, p.distrito_federal || null, p.lista_nominal ? parseInt(p.lista_nominal) : 0]
      );
      insertadas++;
    }

    // El mapa solo necesita estas 4 propiedades por sección — se
    // guarda una copia "limpia" del archivo, sin todo lo demás que
    // pueda traer el GeoJSON oficial (menos peso para el navegador).
    featuresLimpias.push({
      type: 'Feature',
      properties: { seccion: numero, municipio: claveMuni, distrito_local: p.distrito_local || null, distrito_federal: p.distrito_federal || null },
      geometry: feature.geometry,
    });
  }

  if (featuresLimpias.length === 0) {
    return res.status(400).json({ ok: false, error: 'Ninguna sección del archivo se pudo procesar — revisa que las properties traigan "seccion" y "municipio" correctamente.' });
  }

  const rutaArchivo = path.join(__dirname, '../db', `secciones_estado_${estado_id}.geojson`);
  fs.writeFileSync(rutaArchivo, JSON.stringify({ type: 'FeatureCollection', features: featuresLimpias }));
  invalidarCacheGeoSecciones(estado_id);

  res.json({
    ok: true,
    mensaje: `✅ ${insertadas} secciones nuevas, ${actualizadas} actualizadas, mapa guardado con ${featuresLimpias.length} secciones` +
      (sinMunicipio.size ? ` — ⚠️ ${sinMunicipio.size} claves de municipio no encontradas (revisa: ${[...sinMunicipio].slice(0, 10).join(', ')})` : ''),
  });
});

export default router;

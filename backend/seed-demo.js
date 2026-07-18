// Crea (o reconstruye) una campaña DEMO completa, con datos de
// ejemplo en TODOS los módulos, para mostrar en presentaciones de
// venta — sin exponer planes de precio, solo el sistema funcionando.
//
// Se corre manualmente cuando se necesite: npm run seed:demo
// Es seguro correrlo varias veces — borra y vuelve a crear la demo
// desde cero cada vez, así siempre se ve limpia para la próxima
// presentación.
import bcrypt from 'bcryptjs';
import { pool, query } from './src/db/pool.js';

const DEMO_EMAIL = 'demo@vototech.mx';
const DEMO_PASSWORD = 'VotoTechDemo2027';
const DEMO_SUBDOMINIO = 'demo';

const NOMBRES = ['María González', 'Juan Pérez', 'Rosa Martínez', 'Carlos Hernández', 'Laura Sánchez',
  'Pedro Ramírez', 'Ana Torres', 'Miguel Flores', 'Sofía Rivera', 'Luis Gómez', 'Carmen Díaz',
  'Jorge Vázquez', 'Elena Cruz', 'Roberto Morales', 'Patricia Reyes', 'Fernando Ortiz',
  'Gabriela Jiménez', 'Ricardo Castro', 'Verónica Romero', 'Alejandro Suárez'];

export async function crearDemo(opciones = {}) {
  const tipoEleccion = opciones.tipoEleccion || 'ayuntamiento';
  const municipioClaveIne = opciones.municipioClaveIne || 3; // Apizaco por defecto (tiene datos reales)
  const nombreMunicipio = opciones.nombreMunicipio || 'Apizaco';
  const distritoNumero = opciones.distritoNumero || 1;

  // El territorio correcto depende del tipo de elección — antes SIEMPRE
  // se guardaba como "municipio" sin importar qué se eligiera, y por
  // eso Diputado Local/Federal no mostraban nada coherente en el mapa.
  let territorioTipo, territorioId, nombreTerritorio;
  if (tipoEleccion === 'dip_local') {
    territorioTipo = 'distrito_local'; territorioId = distritoNumero; nombreTerritorio = `Distrito Local ${distritoNumero}`;
  } else if (tipoEleccion === 'dip_federal') {
    territorioTipo = 'distrito_federal'; territorioId = distritoNumero; nombreTerritorio = `Distrito Federal ${distritoNumero}`;
  } else if (tipoEleccion === 'gobernador' || tipoEleccion === 'senador') {
    territorioTipo = 'estatal'; territorioId = null; nombreTerritorio = 'Todo Tlaxcala';
  } else {
    territorioTipo = 'municipio'; territorioId = municipioClaveIne; nombreTerritorio = nombreMunicipio;
  }

  console.log(`🎬 Creando cuenta DEMO (${tipoEleccion} — ${nombreTerritorio})...\n`);

  // Borrar demo anterior si existe (para que cada presentación arranque limpia)
  await query('DELETE FROM campanas WHERE subdominio=$1', [DEMO_SUBDOMINIO]);

  // 1. Crear la campaña demo — Ayuntamiento de Apizaco (tiene datos reales
  // de 2024 cargados, así que el mapa se ve coloreado de verdad)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const campana = await query(
    `INSERT INTO campanas (nombre_candidato, eslogan, partido, tipo_eleccion, estado_id, territorio_tipo, territorio_id,
       subdominio, activa, estado_aprobacion, es_demo, fecha_eleccion, tope_gasto_ople)
     VALUES ('Candidato Demo','Juntos por un mejor futuro','morena',$1,29,$2,$3,
       $4, true, 'aprobada', true, '2027-06-06', 850000)
     RETURNING id`,
    [tipoEleccion, territorioTipo, territorioId, DEMO_SUBDOMINIO]
  );
  const campanaId = campana.rows[0].id;
  console.log(`✅ Campaña demo creada (${tipoEleccion} — ${nombreTerritorio})`);

  // 2. Usuario candidato (cuenta principal de acceso)
  const candidato = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol)
     VALUES ($1,'Candidato Demo',$2,$3,'candidato') RETURNING id`,
    [campanaId, DEMO_EMAIL, passwordHash]
  );
  const candidatoId = candidato.rows[0].id;

  // 3. Estructura de campaña — con un coordinador SANO y uno SOBRECARGADO
  // a propósito, para que el semáforo de salud se vea funcionando en vivo
  const jefeCampana = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id)
     VALUES ($1,'Roberto Jefe de Campaña','jefe@demo.vototech.mx',$2,'jefe_campana',$3) RETURNING id`,
    [campanaId, passwordHash, candidatoId]
  );
  const jefeId = jefeCampana.rows[0].id;

  const coordSano = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id)
     VALUES ($1,'Coordinador Zona Norte','coord1@demo.vototech.mx',$2,'coord_seccional',$3) RETURNING id`,
    [campanaId, passwordHash, jefeId]
  );
  const coordSobrecargado = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id)
     VALUES ($1,'Coordinador Zona Centro','coord2@demo.vototech.mx',$2,'coord_seccional',$3) RETURNING id`,
    [campanaId, passwordHash, jefeId]
  );

  // 8 promotores balanceados bajo el coordinador sano
  const promotorIds = [];
  for (let i = 0; i < 8; i++) {
    const r = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id)
       VALUES ($1,$2,$3,$4,'promotor',$5) RETURNING id`,
      [campanaId, `Promotor ${i + 1}`, `promotor${i + 1}@demo.vototech.mx`, passwordHash, coordSano.rows[0].id]
    );
    promotorIds.push(r.rows[0].id);
  }
  // 22 promotores amontonados bajo el otro coordinador (a propósito, para
  // disparar la alerta roja de "sobrecargado" en el semáforo)
  for (let i = 0; i < 22; i++) {
    const r = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id)
       VALUES ($1,$2,$3,$4,'promotor',$5) RETURNING id`,
      [campanaId, `Promotor Zona Centro ${i + 1}`, `promotorzc${i + 1}@demo.vototech.mx`, passwordHash, coordSobrecargado.rows[0].id]
    );
    promotorIds.push(r.rows[0].id);
  }
  console.log('✅ Estructura de campaña: 1 jefe, 2 coordinadores (1 sano, 1 sobrecargado a propósito), 30 promotores');

  // 4. Promovidos de ejemplo en secciones reales de Apizaco, con las 3
  // clasificaciones representadas para que se vea el motor funcionando
  let filtroSecciones = 'WHERE s.estado_id=29';
  const paramsSecciones = [];
  if (territorioTipo === 'municipio') { filtroSecciones += ' AND m.clave_ine=$1'; paramsSecciones.push(territorioId); }
  else if (territorioTipo === 'distrito_local') { filtroSecciones += ' AND s.distrito_local=$1'; paramsSecciones.push(territorioId); }
  else if (territorioTipo === 'distrito_federal') { filtroSecciones += ' AND s.distrito_federal=$1'; paramsSecciones.push(territorioId); }
  // 'estatal' no agrega filtro — toma cualquier sección del estado

  const seccionesEjemplo = await query(
    `SELECT s.numero FROM secciones s JOIN municipios m ON m.id=s.municipio_id
     ${filtroSecciones} ORDER BY s.numero LIMIT 15`,
    paramsSecciones
  );
  const secciones = seccionesEjemplo.rows.map(r => r.numero);
  if (secciones.length === 0) {
    throw new Error(`No se encontraron secciones para ${nombreTerritorio} — verifica que ese distrito/municipio exista en la base de datos`);
  }

  const perfiles = [
    ...Array(8).fill({ partido: 'morena', comprometido: true, temperatura: 'caliente' }),   // -> base
    ...Array(7).fill({ partido: 'independiente', comprometido: false, temperatura: 'tibio' }), // -> persuadible
    ...Array(3).fill({ partido: 'pan', comprometido: false, temperatura: 'frio' }),          // -> adversario
    ...Array(2).fill({ partido: 'morena', comprometido: false, temperatura: 'tibio' }),      // -> persuadible
  ];

  for (let i = 0; i < NOMBRES.length; i++) {
    const perfil = perfiles[i % perfiles.length];
    const secc = secciones[i % secciones.length];
    const seccionRow = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    await query(
      `INSERT INTO promovidos (campana_id, nombre, telefono, seccion_id, partido, comprometido, temperatura, registrado_por, consentimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [campanaId, NOMBRES[i], `246${1000000 + i * 37}`, seccionRow.rows[0]?.id, perfil.partido, perfil.comprometido, perfil.temperatura, promotorIds[i % promotorIds.length]]
    );
  }
  console.log(`✅ ${NOMBRES.length} promovidos de ejemplo (Base, Persuadibles y Adversarios representados)`);

  // 5. Agenda con eventos de ejemplo
  const eventos = [
    { titulo: 'Recorrido casa por casa - Zona Norte', tipo: 'recorrido', dias: 2, lugar: 'Col. Centro' },
    { titulo: 'Reunión de coordinadores', tipo: 'reunion', dias: 5, lugar: 'Oficina de campaña' },
    { titulo: 'Mitin de arranque', tipo: 'evento', dias: 10, lugar: 'Plaza principal de Apizaco' },
    { titulo: 'Entrevista radio local', tipo: 'entrevista', dias: 3, lugar: 'Radio Apizaco 98.5' },
  ];
  for (const e of eventos) {
    const fecha = new Date(Date.now() + e.dias * 86400000).toISOString();
    await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
      [campanaId, e.titulo, e.tipo, fecha, e.lugar, jefeId]
    );
  }
  console.log('✅ 4 eventos de agenda de ejemplo');

  // 6. Una incidencia y un gasto de ejemplo
  const seccEj = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secciones[0]]);
  await query(
    `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, reportado_por)
     VALUES ($1,'irregularidad','media','Propaganda de otro candidato colocada fuera del perímetro permitido cerca de la casilla',$2,$3)`,
    [campanaId, seccEj.rows[0]?.id, jefeId]
  );
  await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, forma_pago, registrado_por)
     VALUES ($1,'eventos','Renta de equipo de sonido para mitin de arranque',18500,CURRENT_DATE,'Sonido Profesional Tlaxcala','transferencia',$2)`,
    [campanaId, jefeId]
  );
  console.log('✅ 1 incidencia y 1 gasto de ejemplo (Control Financiero)');

  console.log('\n🎉 Cuenta DEMO lista.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Subdominio: demo');
  console.log(`  Correo:     ${DEMO_EMAIL}`);
  console.log(`  Contraseña: ${DEMO_PASSWORD}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { subdominio: DEMO_SUBDOMINIO, email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

// Si se ejecuta directamente con "node seed-demo.js", correr y cerrar.
if (import.meta.url === `file://${process.argv[1]}`) {
  crearDemo()
    .then(() => pool.end())
    .catch((e) => { console.error('❌ Error creando demo:', e); process.exit(1); });
}

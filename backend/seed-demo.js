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

// Bancos para generar CIENTOS de nombres únicos combinando nombre +
// apellido — antes la demo solo tenía 20 promovidos fijos (se sentía
// vacía); combinando estos bancos se generan cientos de variantes
// realistas sin repetir.
const NOMBRES_PILA = ['María', 'Juan', 'Rosa', 'Carlos', 'Laura', 'Pedro', 'Ana', 'Miguel', 'Sofía', 'Luis',
  'Carmen', 'Jorge', 'Elena', 'Roberto', 'Patricia', 'Fernando', 'Gabriela', 'Ricardo', 'Verónica', 'Alejandro',
  'Guadalupe', 'José', 'Martha', 'Francisco', 'Leticia', 'Antonio', 'Silvia', 'Manuel', 'Norma', 'Javier',
  'Alicia', 'Raúl', 'Beatriz', 'Arturo', 'Diana', 'Sergio', 'Claudia', 'Enrique', 'Adriana', 'Héctor',
  'Yolanda', 'Rubén', 'Mónica', 'Salvador', 'Angélica', 'Ignacio', 'Teresa', 'Rodrigo', 'Cecilia', 'Emilio'];
const APELLIDOS = ['González', 'Pérez', 'Martínez', 'Hernández', 'Sánchez', 'Ramírez', 'Torres', 'Flores',
  'Rivera', 'Gómez', 'Díaz', 'Vázquez', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Jiménez', 'Castro', 'Romero',
  'Suárez', 'Mendoza', 'Aguilar', 'Guzmán', 'Contreras', 'Vargas', 'Rojas', 'Delgado', 'Herrera', 'Medina',
  'Castillo', 'Salazar', 'Núñez', 'Cabrera', 'Ibarra', 'Peña', 'Cortés', 'Estrada', 'Domínguez', 'Vega'];
function nombreAleatorio(indice) {
  const pila = NOMBRES_PILA[indice % NOMBRES_PILA.length];
  const ap1 = APELLIDOS[(indice * 7) % APELLIDOS.length];
  const ap2 = APELLIDOS[(indice * 13 + 3) % APELLIDOS.length];
  return `${pila} ${ap1} ${ap2}`;
}

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

  // 3.5. Responsables por territorio (Distrito Federal/Local/Municipio)
  // — antes esto quedaba SIEMPRE vacío en la demo, y la ficha nueva
  // del mapa ("Quién trabaja aquí") se veía con puros "Sin asignar".
  // Solo se crean para los niveles que de verdad apliquen al
  // territorio real de esta campaña.
  const seccionRef = await query(
    `SELECT s.distrito_federal, s.distrito_local, m.clave_ine as municipio_clave
     FROM secciones s JOIN municipios m ON m.id=s.municipio_id
     WHERE s.estado_id=29 AND m.clave_ine=$1 LIMIT 1`,
    [territorioTipo === 'municipio' ? territorioId : municipioClaveIne]
  );
  const refDF = seccionRef.rows[0]?.distrito_federal;
  const refDL = seccionRef.rows[0]?.distrito_local;
  const refMuni = seccionRef.rows[0]?.municipio_clave;
  if (refDF) {
    await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id, territorio_tipo, territorio_id)
       VALUES ($1,'Enlace Distrital Federal','enlacedf@demo.vototech.mx',$2,'enlace_distrital_federal',$3,'distrito_federal',$4)`,
      [campanaId, passwordHash, jefeId, refDF]
    );
  }
  if (refDL) {
    await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id, territorio_tipo, territorio_id)
       VALUES ($1,'Enlace Distrital Local','enlacedl@demo.vototech.mx',$2,'enlace_distrital_local',$3,'distrito_local',$4)`,
      [campanaId, passwordHash, jefeId, refDL]
    );
  }
  if (refMuni) {
    await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id, territorio_tipo, territorio_id)
       VALUES ($1,'Enlace Municipal','enlacemuni@demo.vototech.mx',$2,'enlace_municipal',$3,'municipio',$4)`,
      [campanaId, passwordHash, jefeId, refMuni]
    );
  }
  console.log('✅ Responsables de Distrito Federal/Local/Municipio asignados');

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
     ${filtroSecciones} ORDER BY s.numero LIMIT 60`,
    paramsSecciones
  );
  const secciones = seccionesEjemplo.rows.map(r => r.numero);
  if (secciones.length === 0) {
    throw new Error(`No se encontraron secciones para ${nombreTerritorio} — verifica que ese distrito/municipio exista en la base de datos`);
  }

  // Traer de una sola vez el id de cada sección disponible — antes se
  // hacía un SELECT por cada promovido (300 consultas innecesarias).
  const idsPorSeccion = {};
  for (const secc of secciones) {
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    if (s.rows[0]) idsPorSeccion[secc] = s.rows[0].id;
  }

  // Perfiles realistas: ~20% Base, ~55% Persuadible, ~15% Adversario,
  // resto variado — mezcla que se parece a una campaña real en fase
  // de identificación, no una donde "todos apoyan al candidato".
  const PERFILES = [
    ...Array(20).fill({ clasificacion: 'base', partido: 'morena', comprometido: true, temperatura: 'caliente' }),
    ...Array(38).fill({ clasificacion: 'persuadible', partido: 'independiente', comprometido: false, temperatura: 'tibio' }),
    ...Array(17).fill({ clasificacion: 'persuadible', partido: 'morena', comprometido: false, temperatura: 'tibio' }),
    ...Array(15).fill({ clasificacion: 'adversario', partido: 'pan', comprometido: false, temperatura: 'frio' }),
    ...Array(10).fill({ clasificacion: 'base', partido: 'morena', comprometido: true, temperatura: 'tibio' }),
  ];

  const TOTAL_PROMOVIDOS = 320;
  const DIAS_HACIA_ATRAS = 45; // se reparten en 45 días, para que la
  // gráfica de tendencia del Resumen Ejecutivo se vea como actividad
  // real día a día, no todo capturado en el mismo instante.
  let creados = 0;
  for (let i = 0; i < TOTAL_PROMOVIDOS; i++) {
    const perfil = PERFILES[i % PERFILES.length];
    const secc = secciones[i % secciones.length];
    const seccionId = idsPorSeccion[secc];
    if (!seccionId) continue;
    const diasAtras = Math.floor((i / TOTAL_PROMOVIDOS) * DIAS_HACIA_ATRAS) + Math.floor(Math.random() * 2);
    await query(
      `INSERT INTO promovidos (campana_id, nombre, telefono, seccion_id, partido, comprometido, temperatura, clasificacion, clasificacion_manual, registrado_por, consentimiento, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,true, now() - ($10::int || ' days')::interval)`,
      [campanaId, nombreAleatorio(i), `246${1000000 + i * 37}`, seccionId, perfil.partido, perfil.comprometido, perfil.temperatura, perfil.clasificacion, promotorIds[i % promotorIds.length], diasAtras]
    );
    creados++;
  }
  console.log(`✅ ${creados} promovidos de ejemplo, repartidos en ${DIAS_HACIA_ATRAS} días (Base/Persuadible/Adversario reales)`);

  // 4.6. Zonas asignadas (Sectorización) — a propósito, cubrir SOLO
  // dos terceras partes del territorio, dejando el resto "sin
  // cobertura" a propósito. Antes esto estaba en CERO, y tanto el
  // mapa de Cobertura como la tercera dimensión del Motor de
  // Priorización se veían vacíos en la demo.
  const seccionesConCobertura = secciones.slice(0, Math.floor(secciones.length * 0.65));
  let zonasCreadas = 0;
  for (let i = 0; i < seccionesConCobertura.length; i++) {
    const seccionId = idsPorSeccion[seccionesConCobertura[i]];
    if (!seccionId) continue;
    await query(
      `INSERT INTO zonas_asignadas (campana_id, usuario_id, seccion_id, asignado_por) VALUES ($1,$2,$3,$4)`,
      [campanaId, promotorIds[i % promotorIds.length], seccionId, jefeId]
    );
    zonasCreadas++;
  }
  console.log(`✅ ${zonasCreadas} secciones con estructura asignada (el resto queda "sin cobertura" a propósito, para que el Motor de Riesgos tenga algo real que detectar)`);

  // 4.5. Simular duplicados reales — casos donde dos promotores
  // distintos intentaron registrar a la misma persona (pasa mucho en
  // campo, cuando dos brigadas tocan la misma calle). Así el módulo
  // de "Duplicados" en Promovidos tiene algo real que mostrar.
  const primerosTres = await query(
    `SELECT id, veces_intentado FROM promovidos WHERE campana_id=$1 ORDER BY creado_en LIMIT 3`,
    [campanaId]
  );
  for (const p of primerosTres.rows) {
    const vecesExtra = 1 + Math.floor(Math.random() * 2); // 2 o 3 intentos en total
    await query('UPDATE promovidos SET veces_intentado=$1 WHERE id=$2', [1 + vecesExtra, p.id]);
  }
  console.log(`✅ ${primerosTres.rows.length} promovidos marcados como duplicados (varios promotores los registraron)`);

  // 5. Agenda con eventos de ejemplo
  const eventos = [
    { titulo: 'Recorrido casa por casa - Zona Norte', tipo: 'recorrido', dias: 2, lugar: 'Col. Centro' },
    { titulo: 'Reunión de coordinadores', tipo: 'reunion', dias: 5, lugar: 'Oficina de campaña' },
    { titulo: 'Mitin de arranque', tipo: 'evento', dias: 10, lugar: 'Plaza principal de Apizaco' },
    { titulo: 'Entrevista radio local', tipo: 'entrevista', dias: 3, lugar: 'Radio Apizaco 98.5' },
    { titulo: 'Reunión con líderes de colonia', tipo: 'reunion', dias: 4, lugar: 'Casa ejidal' },
    { titulo: 'Reunión con comerciantes locales', tipo: 'reunion', dias: 7, lugar: 'Mercado municipal' },
    { titulo: 'Reunión semanal de estructura', tipo: 'reunion', dias: 14, lugar: 'Oficina de campaña' },
    { titulo: 'Recorrido casa por casa - Zona Sur', tipo: 'recorrido', dias: 6, lugar: 'Col. Guadalupe' },
    { titulo: 'Recorrido mercado sobre ruedas', tipo: 'recorrido', dias: 8, lugar: 'Tianguis del jueves' },
    { titulo: 'Reunión con jóvenes universitarios', tipo: 'reunion', dias: 11, lugar: 'Auditorio municipal' },
    { titulo: 'Evento con mujeres emprendedoras', tipo: 'evento', dias: 13, lugar: 'Casa de la cultura' },
    { titulo: 'Entrevista periódico local', tipo: 'entrevista', dias: 9, lugar: 'Redacción El Sol de Apizaco' },
    { titulo: 'Reunión de cierre de etapa de identificación', tipo: 'reunion', dias: 18, lugar: 'Oficina de campaña' },
    { titulo: 'Recorrido zona industrial', tipo: 'recorrido', dias: 16, lugar: 'Parque industrial' },
    { titulo: 'Reunión con representantes de casilla', tipo: 'reunion', dias: 20, lugar: 'Oficina de campaña' },
  ];
  for (const e of eventos) {
    const fecha = new Date(Date.now() + e.dias * 86400000).toISOString();
    await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
      [campanaId, e.titulo, e.tipo, fecha, e.lugar, jefeId]
    );
  }
  console.log(`✅ ${eventos.length} eventos de agenda de ejemplo (varias reuniones incluidas)`);

  // 6. Una incidencia y un gasto de ejemplo
  const seccEj = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secciones[0]]);
  await query(
    `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, reportado_por)
     VALUES ($1,'irregularidad','media','Propaganda de otro candidato colocada fuera del perímetro permitido cerca de la casilla',$2,$3)`,
    [campanaId, seccEj.rows[0]?.id, jefeId]
  );
  // Más incidencias variadas — para que el módulo se vea con actividad real
  const incidenciasExtra = [
    { tipo: 'compra_votos', urgencia: 'urgente', desc: 'Reporte de entrega de despensas condicionadas al voto en la colonia' },
    { tipo: 'violencia', urgencia: 'alta', desc: 'Altercado entre simpatizantes de distintos partidos durante recorrido' },
    { tipo: 'logistica', urgencia: 'baja', desc: 'Falta material de identificación para representantes de casilla' },
    { tipo: 'representante', urgencia: 'media', desc: 'Representante de casilla no se presentó, se buscó reemplazo' },
  ];
  for (const inc of incidenciasExtra) {
    const secc = secciones[Math.floor(Math.random() * secciones.length)];
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    await query(
      `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, reportado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
      [campanaId, inc.tipo, inc.urgencia, inc.desc, s.rows[0]?.id, promotorIds[Math.floor(Math.random() * promotorIds.length)]]
    );
  }

  await query(
    `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, forma_pago, registrado_por)
     VALUES ($1,'eventos','Renta de equipo de sonido para mitin de arranque',18500,CURRENT_DATE,'Sonido Profesional Tlaxcala','transferencia',$2)`,
    [campanaId, jefeId]
  );
  // Más gastos variados en distintas categorías, para que Finanzas se
  // vea con historial real y el % del tope OPLE tenga sentido
  const gastosExtra = [
    { cat: 'propaganda_impresa', desc: 'Impresión de 5,000 volantes', monto: 4200, prov: 'Imprenta Rápida Tlax' },
    { cat: 'espectaculares', desc: 'Renta de espectacular en carretera federal', monto: 22000, prov: 'Publicidad Exterior del Centro' },
    { cat: 'transporte', desc: 'Combustible y viáticos equipo de campo', monto: 8600, prov: 'Gasolinera Apizaco' },
    { cat: 'tecnologia', desc: 'Suscripción mensual VotoTech', monto: 2500, prov: 'VotoTech' },
    { cat: 'personal', desc: 'Pago quincenal de coordinadores de campo', monto: 15000, prov: 'Nómina interna' },
    { cat: 'publicidad_digital', desc: 'Campaña de anuncios en redes sociales', monto: 6800, prov: 'Meta Ads' },
  ];
  for (const g of gastosExtra) {
    const diasAtras = Math.floor(Math.random() * 20);
    await query(
      `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, forma_pago, registrado_por)
       VALUES ($1,$2,$3,$4,CURRENT_DATE - $5::int,$6,'transferencia',$7)`,
      [campanaId, g.cat, g.desc, g.monto, diasAtras, g.prov, jefeId]
    );
  }
  console.log('✅ 5 incidencias y 7 gastos de ejemplo (Control Financiero)');

  // 7. Activos de campaña — bardas, espectaculares, mantas, representantes,
  // repartidos en secciones reales, con fechas DESPUÉS del inicio oficial
  // (para no disparar la alerta legal en la demo misma)
  const activosEjemplo = [
    { tipo: 'barda', direccion: 'Av. Juárez esq. Hidalgo', empresa: 'Pintores Unidos Tlax', costo: 3500 },
    { tipo: 'barda', direccion: 'Calle Morelos #45', empresa: 'Pintores Unidos Tlax', costo: 2800 },
    { tipo: 'barda', direccion: 'Carretera a San Luis Teolocholco km 2', empresa: 'Publicidad Rural', costo: 4200 },
    { tipo: 'barda', direccion: 'Calle Independencia #112', empresa: 'Pintores Unidos Tlax', costo: 3100 },
    { tipo: 'barda', direccion: 'Av. Reforma esq. Allende', empresa: 'Publicidad Rural', costo: 2600 },
    { tipo: 'barda', direccion: 'Calle 5 de Mayo #78', empresa: 'Pintores Unidos Tlax', costo: 3900 },
    { tipo: 'barda', direccion: 'Camino a Santa Cruz', empresa: 'Publicidad Rural', costo: 2200 },
    { tipo: 'espectacular', direccion: 'Carretera Federal México-Tlaxcala km 18', empresa: 'Publicidad Exterior del Centro', costo: 22000 },
    { tipo: 'espectacular', direccion: 'Entrada norte de Apizaco', empresa: 'Publicidad Exterior del Centro', costo: 19500 },
    { tipo: 'espectacular', direccion: 'Libramiento sur, km 4', empresa: 'Publicidad Exterior del Centro', costo: 20500 },
    { tipo: 'manta', direccion: 'Puente peatonal Av. Revolución', empresa: 'Lonas y Mantas Express', costo: 1200 },
    { tipo: 'manta', direccion: 'Plaza principal', empresa: 'Lonas y Mantas Express', costo: 950 },
    { tipo: 'manta', direccion: 'Puente vehicular salida a Tlaxco', empresa: 'Lonas y Mantas Express', costo: 1400 },
    { tipo: 'manta', direccion: 'Explanada municipal', empresa: 'Lonas y Mantas Express', costo: 1100 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Playeras y Gorras Tlax', costo: 15000, subtipo: 'playeras', cantidad: 500 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Playeras y Gorras Tlax', costo: 6000, subtipo: 'gorras', cantidad: 300 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Impresos Tlax', costo: 3200, subtipo: 'volantes', cantidad: 8000 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Publicidad Rural', costo: 4500, subtipo: 'lonas pequeñas', cantidad: 150 },
  ];
  for (const a of activosEjemplo) {
    const secc = secciones[Math.floor(Math.random() * secciones.length)];
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    const diasAtras = 5 + Math.floor(Math.random() * 15);
    await query(
      `INSERT INTO activos (campana_id, tipo, seccion_id, direccion, empresa, costo, fecha_ini, subtipo, cantidad, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE - $7::int,$8,$9,$10)`,
      [campanaId, a.tipo, s.rows[0]?.id, a.direccion, a.empresa, a.costo, diasAtras, a.subtipo || null, a.cantidad || null, jefeId]
    );
  }
  // 4 representantes ante casilla, ligados a secciones reales
  const nombresRep = ['Juan Pablo Sánchez', 'María Fernanda López', 'Óscar Iván Torres', 'Guadalupe Hernández'];
  for (let i = 0; i < 4; i++) {
    const secc = secciones[i];
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    await query(
      `INSERT INTO activos (campana_id, tipo, seccion_id, nombre_rep, telefono_rep, registrado_por)
       VALUES ($1,'ine_representante',$2,$3,$4,$5)`,
      [campanaId, s.rows[0]?.id, nombresRep[i], `246${2000000 + i * 11}`, jefeId]
    );
  }
  console.log('✅ 22 activos de campaña (bardas, espectaculares, mantas, utilitarios, representantes)');

  // 8. Casillas registradas con ubicación, algunas con representante
  // confirmado — para que Día de la Elección se vea listo para operar.
  // Cubre TODAS las secciones disponibles (antes solo 18 de 60).
  const letrasCasilla = ['B', 'C1', 'C2', 'C3'];
  let casillasCreadas = 0;
  for (let i = 0; i < secciones.length; i++) {
    const seccionId = idsPorSeccion[secciones[i]];
    if (!seccionId) continue;
    await query(
      `INSERT INTO casillas (campana_id, seccion_id, numero, representante_id, confirmado_asistencia)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (campana_id, seccion_id, numero) DO NOTHING`,
      [campanaId, seccionId, letrasCasilla[i % letrasCasilla.length], promotorIds[i % promotorIds.length], i % 3 !== 0] // 2 de cada 3 confirmadas
    );
    casillasCreadas++;
  }
  console.log(`✅ ${casillasCreadas} casillas registradas — así se ve el Prep de Día D con volumen real`);

  // 9. Una encuesta de ejemplo con varias respuestas, algunas con ubicación
  const encuestaDemo = await query(
    `INSERT INTO encuestas (campana_id, titulo, descripcion, creado_por)
     VALUES ($1,'Prioridades de la comunidad','Encuesta rápida aplicada en campo por los promotores',$2) RETURNING id`,
    [campanaId, jefeId]
  );
  const preguntaOpcion = await query(
    `INSERT INTO encuesta_preguntas (encuesta_id, tipo, texto, opciones, orden)
     VALUES ($1,'opcion_multiple','¿Qué es lo más urgente que necesita su comunidad?',$2,0) RETURNING id`,
    [encuestaDemo.rows[0].id, JSON.stringify(['Agua potable', 'Seguridad', 'Empleo', 'Pavimentación', 'Alumbrado público'])]
  );
  const preguntaAbierta = await query(
    `INSERT INTO encuesta_preguntas (encuesta_id, tipo, texto, orden) VALUES ($1,'abierta','Si usted fuera candidato, ¿qué haría primero en su gestión?',1) RETURNING id`,
    [encuestaDemo.rows[0].id]
  );
  const opcionesEncuesta = ['Agua potable', 'Seguridad', 'Empleo', 'Pavimentación', 'Alumbrado público'];
  const respuestasAbiertas = ['Arreglar las calles principales', 'Más policías en las noches', 'Apoyo a comerciantes locales', 'Mejorar el drenaje', 'Programas para jóvenes'];
  let respuestasCreadas = 0;
  for (let i = 0; i < 55; i++) {
    const secc = secciones[i % secciones.length];
    const seccionId = idsPorSeccion[secc];
    if (!seccionId) continue;
    await query(
      `INSERT INTO encuesta_respuestas (encuesta_id, respuestas, origen, seccion_id, capturado_por)
       VALUES ($1,$2,'campo',$3,$4)`,
      [encuestaDemo.rows[0].id, JSON.stringify({
        [preguntaOpcion.rows[0].id]: opcionesEncuesta[i % opcionesEncuesta.length],
        [preguntaAbierta.rows[0].id]: respuestasAbiertas[i % respuestasAbiertas.length],
      }), seccionId, promotorIds[i % promotorIds.length]]
    );
    respuestasCreadas++;
  }
  console.log(`✅ 1 encuesta con ${respuestasCreadas} respuestas de ejemplo (con ubicación para la capa del mapa)`);

  // 10. Calendario electoral y una queja resuelta — para que Jurídico
  // no se vea vacío en la primera visita
  const plazos = [
    { titulo: 'Inicio oficial de campaña', tipo: 'plazo_ite', dias: -10 },
    { titulo: 'Fecha límite de fiscalización mensual', tipo: 'plazo_ine', dias: 12 },
    { titulo: 'Veda electoral', tipo: 'veda', dias: 85 },
    { titulo: 'Jornada electoral', tipo: 'otro', dias: 90 },
  ];
  for (const pl of plazos) {
    await query(
      `INSERT INTO calendario_electoral (campana_id, titulo, tipo, fecha, cumplido) VALUES ($1,$2,$3,CURRENT_DATE + $4::int, $5)`,
      [campanaId, pl.titulo, pl.tipo, pl.dias, pl.dias < 0]
    );
  }
  await query(
    `INSERT INTO quejas_recursos (campana_id, tipo, autoridad, numero_expediente, descripcion, estado, fecha_presentacion, resultado, creado_por)
     VALUES ($1,'queja','ite','ITE-Q-045/2027','Colocación de propaganda de oposición en equipamiento urbano no autorizado','resuelta',CURRENT_DATE - 8,'Se ordenó el retiro de la propaganda en 48 horas, cumplido por la parte denunciada',$2)`,
    [campanaId, jefeId]
  );
  // También actualiza la fecha oficial de inicio de campaña de la
  // propia campaña demo, para que la alerta legal de Activos tenga
  // con qué compararse desde el primer momento
  await query(`UPDATE campanas SET fecha_inicio_campana_oficial = CURRENT_DATE - 10 WHERE id=$1`, [campanaId]);
  console.log('✅ Calendario electoral (4 plazos) y 1 queja resuelta ante el ITE');

  // 11. Chat interno con mensajes de ejemplo en General
  const mensajesChat = [
    { autor: jefeId, texto: '¡Buenos días equipo! Hoy toca recorrido en la zona norte, nos vemos a las 9am en la oficina.' },
    { autor: coordSano.rows[0].id, texto: 'Confirmado, ya tengo a los 8 promotores listos.' },
    { autor: jefeId, texto: 'Perfecto. No olviden llevar el material nuevo de playeras.' },
    { autor: promotorIds[0], texto: 'Ya llegamos a la zona, empezamos el recorrido 👍' },
  ];
  for (const m of mensajesChat) {
    await query(`INSERT INTO chat_mensajes (campana_id, canal, autor_id, texto) VALUES ($1,'general',$2,$3)`, [campanaId, m.autor, m.texto]);
  }
  console.log('✅ 4 mensajes de ejemplo en el Chat interno');

  // 12. Un anuncio interno fijado en Agenda
  await query(
    `INSERT INTO anuncios (campana_id, titulo, mensaje, importante, creado_por)
     VALUES ($1,'Recordatorio: junta general el viernes','Todos los coordinadores deben asistir a la junta general de campaña este viernes a las 6pm en la oficina central.',true,$2)`,
    [campanaId, jefeId]
  );
  console.log('✅ 1 anuncio interno fijado');

  // 13. Más eventos de agenda ya realizados (para ver historial, no solo futuro)
  const eventosPasados = [
    { titulo: 'Reunión de arranque de campaña', tipo: 'reunion', dias: -12, lugar: 'Oficina central' },
    { titulo: 'Recorrido zona centro', tipo: 'recorrido', dias: -6, lugar: 'Centro de Apizaco' },
  ];
  for (const e of eventosPasados) {
    const fecha = new Date(Date.now() + e.dias * 86400000).toISOString();
    await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por, realizado) VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [campanaId, e.titulo, e.tipo, fecha, e.lugar, jefeId]
    );
  }
  console.log('✅ 2 eventos pasados marcados como realizados');

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

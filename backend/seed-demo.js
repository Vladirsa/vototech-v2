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
     ${filtroSecciones} ORDER BY s.numero LIMIT 20`,
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
    { tipo: 'espectacular', direccion: 'Carretera Federal México-Tlaxcala km 18', empresa: 'Publicidad Exterior del Centro', costo: 22000 },
    { tipo: 'espectacular', direccion: 'Entrada norte de Apizaco', empresa: 'Publicidad Exterior del Centro', costo: 19500 },
    { tipo: 'manta', direccion: 'Puente peatonal Av. Revolución', empresa: 'Lonas y Mantas Express', costo: 1200 },
    { tipo: 'manta', direccion: 'Plaza principal', empresa: 'Lonas y Mantas Express', costo: 950 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Playeras y Gorras Tlax', costo: 15000, subtipo: 'playeras', cantidad: 500 },
    { tipo: 'utilitario', direccion: 'Bodega de campaña', empresa: 'Playeras y Gorras Tlax', costo: 6000, subtipo: 'gorras', cantidad: 300 },
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
  console.log('✅ 13 activos de campaña (bardas, espectaculares, mantas, utilitarios, representantes)');

  // 8. Casillas registradas con ubicación, algunas con representante
  // confirmado — para que Día de la Elección se vea listo para operar
  for (let i = 0; i < 18; i++) {
    const secc = secciones[i % secciones.length];
    const s = await query('SELECT id, numero FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    if (!s.rows[0]) continue;
    await query(
      `INSERT INTO casillas (campana_id, seccion_id, numero, representante_id, confirmado_asistencia)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (campana_id, seccion_id, numero) DO NOTHING`,
      [campanaId, s.rows[0].id, 'B', promotorIds[i % promotorIds.length], i % 3 !== 0] // 2 de cada 3 confirmadas
    );
  }
  console.log('✅ 18 casillas registradas — así se ve el Prep de Día D con volumen real');

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
  for (let i = 0; i < 18; i++) {
    const secc = secciones[i % secciones.length];
    const s = await query('SELECT id, numero FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    await query(
      `INSERT INTO encuesta_respuestas (encuesta_id, respuestas, origen, seccion_id, capturado_por)
       VALUES ($1,$2,'campo',$3,$4)`,
      [encuestaDemo.rows[0].id, JSON.stringify({
        [preguntaOpcion.rows[0].id]: opcionesEncuesta[i % opcionesEncuesta.length],
        [preguntaAbierta.rows[0].id]: respuestasAbiertas[i % respuestasAbiertas.length],
      }), s.rows[0]?.id, promotorIds[i % promotorIds.length]]
    );
  }
  console.log('✅ 1 encuesta con 18 respuestas de ejemplo (con ubicación para la capa del mapa)');

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

  // 🆕 14. Caminatas de ejemplo — trazos reales sobre el mapa, con
  // ruta en GeoJSON (recta simple, suficiente para verse bien en la
  // demo sin depender de la API de rutas real), ligadas a una sección
  // real y con su propia entrada en Agenda, tal como se comporta el
  // módulo real cuando alguien la usa desde el mapa.
  const caminatasEjemplo = [
    {
      titulo: 'Recorrido Av. Juárez — Col. Centro',
      calle_inicio: 'Av. Juárez #10', calle_fin: 'Av. Juárez #180',
      calles_intermedias: 'Calle Hidalgo, Calle Morelos',
      acompanantes: 'Coordinador Zona Norte, 4 brigadistas',
      distancia_km: 1.8, tiempo_min: 24,
      // Puntos aproximados sobre Apizaco — es una demo, no necesita
      // pegarse a calles reales como sí lo hace la función en vivo.
      puntos: [[-98.1520, 19.4160], [-98.1500, 19.4155], [-98.1480, 19.4150], [-98.1465, 19.4145]],
    },
    {
      titulo: 'Caminata Barrio San José',
      calle_inicio: 'Calle 5 de Mayo', calle_fin: 'Calle Independencia',
      calles_intermedias: 'Calle Reforma',
      acompanantes: 'Coordinador Zona Centro, 6 brigadistas',
      distancia_km: 1.2, tiempo_min: 16,
      puntos: [[-98.1550, 19.4180], [-98.1535, 19.4172], [-98.1520, 19.4165]],
    },
  ];
  for (const c of caminatasEjemplo) {
    const secc = secciones[Math.floor(Math.random() * secciones.length)];
    const s = await query('SELECT id FROM secciones WHERE estado_id=29 AND numero=$1', [secc]);
    const diasAdelante = 3 + Math.floor(Math.random() * 5);
    const fecha = new Date(Date.now() + diasAdelante * 86400000).toISOString();

    // Se crea también su evento de Agenda, exactamente como hace la
    // función real cuando alguien traza una caminata pidiendo que se
    // agende.
    const eventoAgenda = await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por) VALUES ($1,$2,'recorrido',$3,$4,$5) RETURNING id`,
      [campanaId, c.titulo, fecha, c.calle_inicio, jefeId]
    );

    const geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: c.puntos },
    };
    await query(
      `INSERT INTO caminatas (campana_id, titulo, calle_inicio, calle_fin, calles_intermedias, ruta_geojson, distancia_km, tiempo_estimado_min, acompanantes, fecha, seccion_id, agenda_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [campanaId, c.titulo, c.calle_inicio, c.calle_fin, c.calles_intermedias, JSON.stringify(geojson),
       c.distancia_km, c.tiempo_min, c.acompanantes, fecha, s.rows[0]?.id, eventoAgenda.rows[0].id, jefeId]
    );
  }
  console.log(`✅ ${caminatasEjemplo.length} caminatas de ejemplo (con su evento de Agenda ligado)`);

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

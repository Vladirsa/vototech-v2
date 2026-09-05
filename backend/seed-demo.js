// Crea (o reconstruye) una campaña DEMO completa, con volumen REAL en
// todos los módulos — para que en una presentación de venta se vea
// una campaña de verdad funcionando, no una maqueta vacía.
//
// Se corre manualmente cuando se necesite: npm run seed:demo
// También se puede disparar desde el Panel de Administración
// (POST /api/admin/crear-demo). Es seguro correrlo varias veces —
// borra y vuelve a crear la demo desde cero cada vez.
import bcrypt from 'bcryptjs';
import { pool, query } from './src/db/pool.js';

const DEMO_EMAIL = 'demo@vototech.mx';
const DEMO_PASSWORD = 'VotoTechDemo2027';
const DEMO_SUBDOMINIO = 'demo';

const NOMBRES_PILA = ['María', 'Juan', 'Rosa', 'Carlos', 'Laura', 'Pedro', 'Ana', 'Miguel', 'Sofía', 'Luis',
  'Carmen', 'Jorge', 'Elena', 'Roberto', 'Patricia', 'Fernando', 'Gabriela', 'Ricardo', 'Verónica', 'Alejandro',
  'Diana', 'Francisco', 'Leticia', 'Arturo', 'Mónica', 'Raúl', 'Silvia', 'Enrique', 'Guadalupe', 'Javier',
  'Claudia', 'Ramón', 'Adriana', 'Salvador', 'Norma', 'Ignacio', 'Alicia', 'Sergio', 'Beatriz', 'Rafael'];
const APELLIDOS = ['González', 'Pérez', 'Martínez', 'Hernández', 'Sánchez', 'Ramírez', 'Torres', 'Flores',
  'Rivera', 'Gómez', 'Díaz', 'Vázquez', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Jiménez', 'Castro', 'Romero',
  'Suárez', 'Mendoza', 'Aguilar', 'Vargas', 'Ramos', 'Chávez', 'Contreras', 'Guerrero', 'Rojas', 'Medina', 'Núñez'];
const nombreAleatorio = () => `${NOMBRES_PILA[Math.floor(Math.random() * NOMBRES_PILA.length)]} ${APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]} ${APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]}`;

const CALLES_GENERICAS = ['Av. Juárez', 'Calle Hidalgo', 'Calle Morelos', 'Av. Revolución', 'Calle Reforma',
  'Calle Independencia', 'Av. 5 de Mayo', 'Calle Zaragoza', 'Calle Allende', 'Av. Insurgentes',
  'Calle Cuauhtémoc', 'Calle Guerrero', 'Av. Constitución', 'Calle Matamoros', 'Calle Aldama'];

export async function crearDemo(opciones = {}) {
  // 🆕 Ahora acepta estadoId — antes SIEMPRE creaba la demo en
  // Tlaxcala (29) sin importar qué otro estado ya tuvieras cargado
  // con la cartografía nueva.
  const estadoId = opciones.estadoId || 29;
  const tipoEleccion = opciones.tipoEleccion || 'ayuntamiento';
  const municipioClaveIne = opciones.municipioClaveIne || 3; // Apizaco por defecto SOLO si es Tlaxcala
  const nombreMunicipio = opciones.nombreMunicipio || 'Apizaco';
  const distritoNumero = opciones.distritoNumero || 1;
  const partidoDemo = opciones.partido || 'morena';

  const nombreEstadoRes = await query('SELECT nombre FROM estados WHERE id=$1', [estadoId]);
  const nombreEstado = nombreEstadoRes.rows[0]?.nombre || 'Tlaxcala';

  let territorioTipo, territorioId, nombreTerritorio;
  if (tipoEleccion === 'dip_local') {
    territorioTipo = 'distrito_local'; territorioId = distritoNumero; nombreTerritorio = `Distrito Local ${distritoNumero}`;
  } else if (tipoEleccion === 'dip_federal') {
    territorioTipo = 'distrito_federal'; territorioId = distritoNumero; nombreTerritorio = `Distrito Federal ${distritoNumero}`;
  } else if (tipoEleccion === 'gobernador' || tipoEleccion === 'senador') {
    territorioTipo = 'estatal'; territorioId = null; nombreTerritorio = `Todo ${nombreEstado}`;
  } else {
    territorioTipo = 'municipio'; territorioId = municipioClaveIne; nombreTerritorio = nombreMunicipio;
  }

  console.log(`🎬 Creando cuenta DEMO (${tipoEleccion} — ${nombreTerritorio})...\n`);

  await query('DELETE FROM campanas WHERE subdominio=$1', [DEMO_SUBDOMINIO]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const campana = await query(
    `INSERT INTO campanas (nombre_candidato, eslogan, partido, tipo_eleccion, estado_id, territorio_tipo, territorio_id,
       subdominio, activa, estado_aprobacion, es_demo, fecha_eleccion, tope_gasto_ople, fecha_inicio_campana_oficial)
     VALUES ('Candidato Demo','Juntos por un mejor futuro',$1,$2,$3,$4,$5,
       $6, true, 'aprobada', true, '2027-06-06', 850000, CURRENT_DATE - 10)
     RETURNING id`,
    [partidoDemo, tipoEleccion, estadoId, territorioTipo, territorioId, DEMO_SUBDOMINIO]
  );
  const campanaId = campana.rows[0].id;
  console.log(`✅ Campaña demo creada (${tipoEleccion} — ${nombreTerritorio} — partido ${partidoDemo})`);

  // ── TERRITORIO — TODAS las secciones disponibles, no solo 20 ──────
  let filtroSecciones = 'WHERE s.estado_id=$1';
  const paramsSecciones = [estadoId];
  if (territorioTipo === 'municipio') { filtroSecciones += ' AND m.clave_ine=$2'; paramsSecciones.push(territorioId); }
  else if (territorioTipo === 'distrito_local') { filtroSecciones += ' AND s.distrito_local=$2'; paramsSecciones.push(territorioId); }
  else if (territorioTipo === 'distrito_federal') { filtroSecciones += ' AND s.distrito_federal=$2'; paramsSecciones.push(territorioId); }

  const seccionesRes = await query(
    `SELECT s.id, s.numero, s.lista_nominal, s.geometria FROM secciones s JOIN municipios m ON m.id=s.municipio_id
     ${filtroSecciones} ORDER BY s.numero`,
    paramsSecciones
  );
  if (seccionesRes.rows.length === 0) {
    throw new Error(`No se encontraron secciones para ${nombreTerritorio} — verifica que ese distrito/municipio exista en la base de datos`);
  }
  const secciones = seccionesRes.rows; // [{id, numero, lista_nominal, geometria}]
  const seccionAl = (i) => secciones[i % secciones.length];
  console.log(`✅ Territorio: ${secciones.length} secciones disponibles`);

  // 🆕 Centro geográfico REAL del territorio — antes esto estaba fijo
  // cerca de Apizaco, así que una demo de otro estado ponía las
  // caminatas y el GPS de los promotores en Tlaxcala por error. Se
  // calcula del centro de la primera sección con geometría cargada;
  // si ninguna la tiene todavía (cartografía no subida aún), usa
  // Apizaco solo como último respaldo para no tronar la demo.
  function centroDeUnaSeccion(geometria) {
    if (!geometria?.coordinates) return null;
    const anillo = geometria.type === 'Polygon' ? geometria.coordinates[0] : geometria.coordinates[0]?.[0];
    if (!anillo || anillo.length === 0) return null;
    let sumaLat = 0, sumaLng = 0;
    anillo.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
    return { lat: sumaLat / anillo.length, lng: sumaLng / anillo.length };
  }
  const seccionConGeometria = secciones.find((s) => s.geometria);
  const centroTerritorio = seccionConGeometria ? centroDeUnaSeccion(seccionConGeometria.geometria) : null;
  const CENTRO_LAT = centroTerritorio?.lat || 19.415;
  const CENTRO_LNG = centroTerritorio?.lng || -98.150;
  if (!centroTerritorio) console.log('⚠️ Ninguna sección de este territorio tiene geometría cargada todavía — usando un punto de referencia genérico para caminatas y GPS.');

  // 1. Usuario candidato
  const candidato = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol) VALUES ($1,'Candidato Demo',$2,$3,'candidato') RETURNING id`,
    [campanaId, DEMO_EMAIL, passwordHash]
  );
  const candidatoId = candidato.rows[0].id;

  // ── 2. ESTRUCTURA COMPLETA — todos los puestos que existen en el
  // sistema, no solo jefe+coordinadores+promotores, para que la demo
  // muestre el organigrama real de 6+ niveles.
  const crearUsuario = async (nombre, emailPrefijo, rol, parentId, puesto = null) => {
    const r = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, parent_id, puesto) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [campanaId, nombre, `${emailPrefijo}@demo.vototech.mx`, passwordHash, rol, parentId, puesto]
    );
    return r.rows[0].id;
  };

  const jefeId = await crearUsuario('Roberto Jiménez — Jefe de Campaña', 'jefe', 'jefe_campana', candidatoId);
  const coordGeneralId = await crearUsuario('Alejandra Torres — Coord. General', 'coordgen', 'coord_general', jefeId, 'Coordinación General de Campo');
  const encJuridicoId = await crearUsuario('Lic. Fernando Ruiz', 'juridico', 'encargado_juridico', jefeId);
  const encFinanzasId = await crearUsuario('C.P. Diana Morales', 'finanzas', 'encargado_finanzas', jefeId);

  // 3 Coordinadores Distritales, 3 Municipales, 8 Seccionales
  const coordsDistritales = [];
  for (let i = 1; i <= 3; i++) coordsDistritales.push(await crearUsuario(`${nombreAleatorio()} — Coord. Distrital ${i}`, `coorddist${i}`, 'coord_distrital', coordGeneralId));
  const coordsMunicipales = [];
  for (let i = 1; i <= 3; i++) coordsMunicipales.push(await crearUsuario(`${nombreAleatorio()} — Coord. Municipal ${i}`, `coordmun${i}`, 'coord_municipal', coordsDistritales[i % coordsDistritales.length]));
  const coordsSeccionales = [];
  for (let i = 1; i <= 8; i++) coordsSeccionales.push(await crearUsuario(`${nombreAleatorio()} — Coord. Seccional ${i}`, `coordsec${i}`, 'coord_seccional', coordsMunicipales[i % coordsMunicipales.length]));

  // 3 Voluntarios especializados
  const voluntarios = [];
  const puestosVoluntario = ['Redes Sociales', 'Logística de Eventos', 'Atención Ciudadana'];
  for (let i = 0; i < 3; i++) voluntarios.push(await crearUsuario(`${nombreAleatorio()} — Voluntario`, `voluntario${i + 1}`, 'voluntario', coordGeneralId, puestosVoluntario[i]));

  // 🆕 100 promotores repartidos entre los 8 coordinadores seccionales
  const promotorIds = [];
  for (let i = 1; i <= 100; i++) {
    const id = await crearUsuario(`${nombreAleatorio()} — Promotor`, `promotor${i}`, 'promotor', coordsSeccionales[i % coordsSeccionales.length]);
    promotorIds.push(id);
  }
  console.log(`✅ Estructura completa: candidato, jefe, coord. general, jurídico, finanzas, 3 distritales, 3 municipales, 8 seccionales, 3 voluntarios, 100 promotores (123 personas)`);

  // 5 Representantes de Casilla, con su cargo asignado
  const representantesCasilla = [];
  for (let i = 1; i <= 5; i++) representantesCasilla.push(await crearUsuario(`${nombreAleatorio()} — Rep. Casilla`, `repcasilla${i}`, 'representante_casilla', coordsSeccionales[i % coordsSeccionales.length]));
  console.log(`✅ 5 Representantes de Casilla`);

  // ── 3. PROMOVIDOS — 500, TODOS del mismo partido de la campaña ──
  // Bulk insert con UNNEST — 500 filas en una sola consulta, no 500
  // consultas separadas (sería muy lento).
  const nombresPromovidos = [], telefonos = [], seccionIds = [], clasificaciones = [], temperaturas = [],
    comprometidos = [], registradoPor = [], calles = [];
  const CLASIFICACIONES = ['base', 'persuadible', 'adversario'];
  const TEMPERATURAS = ['frio', 'tibio', 'caliente'];
  for (let i = 0; i < 500; i++) {
    nombresPromovidos.push(nombreAleatorio().toUpperCase());
    telefonos.push(`246${1000000 + i}`);
    const secc = seccionAl(i);
    seccionIds.push(secc.id);
    calles.push(`${CALLES_GENERICAS[i % CALLES_GENERICAS.length]} #${100 + (i % 300)}`.toUpperCase());
    // 60% base, 30% persuadible, 10% adversario — proporción realista de campaña con ventaja
    const r = Math.random();
    clasificaciones.push(r < 0.6 ? 'base' : r < 0.9 ? 'persuadible' : 'adversario');
    temperaturas.push(TEMPERATURAS[Math.floor(Math.random() * 3)]);
    comprometidos.push(Math.random() < 0.55);
    registradoPor.push(promotorIds[i % promotorIds.length]);
  }
  await query(
    `INSERT INTO promovidos (campana_id, nombre, telefono, seccion_id, calle, partido, clasificacion, comprometido, temperatura, registrado_por, consentimiento)
     SELECT $1, n, t, s, c, $2, cl, comp, temp, rp, true
     FROM UNNEST($3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::boolean[], $9::text[], $10::uuid[])
       AS u(n, t, s, c, cl, comp, temp, rp)`,
    [campanaId, partidoDemo, nombresPromovidos, telefonos, seccionIds, calles, clasificaciones, comprometidos, temperaturas, registradoPor]
  );
  console.log(`✅ 500 promovidos (todos del partido ${partidoDemo}) — 60% base, 30% persuadibles, 10% adversarios`);

  // ── 4. AGENDA — 100 reuniones + 60 eventos (50 regulares + 10 mítines grandes) ──
  const LUGARES_REUNION = ['Oficina de campaña', 'Casa de enlace Zona Norte', 'Casa de enlace Zona Centro', 'Salón ejidal', 'Domicilio de coordinador'];
  const LUGARES_EVENTO = ['Plaza principal', 'Auditorio municipal', 'Cancha techada', 'Parque central', 'Explanada municipal'];
  const titulosAgenda = [], tiposAgenda = [], fechasAgenda = [], lugaresAgenda = [], realizadoAgenda = [];
  for (let i = 0; i < 100; i++) {
    const diasOffset = -20 + Math.floor(Math.random() * 90); // mezcla pasado y futuro
    titulosAgenda.push(`Reunión de coordinación — Semana ${1 + (i % 12)}`);
    tiposAgenda.push('reunion');
    fechasAgenda.push(new Date(Date.now() + diasOffset * 86400000).toISOString());
    lugaresAgenda.push(LUGARES_REUNION[i % LUGARES_REUNION.length]);
    realizadoAgenda.push(diasOffset < 0);
  }
  for (let i = 0; i < 50; i++) {
    const diasOffset = -15 + Math.floor(Math.random() * 100);
    titulosAgenda.push(`Evento de campaña — ${seccionAl(i).numero ? `Sección ${seccionAl(i).numero}` : 'Territorio'}`);
    tiposAgenda.push('evento');
    fechasAgenda.push(new Date(Date.now() + diasOffset * 86400000).toISOString());
    lugaresAgenda.push(LUGARES_EVENTO[i % LUGARES_EVENTO.length]);
    realizadoAgenda.push(diasOffset < 0);
  }
  for (let i = 0; i < 10; i++) {
    const diasOffset = 10 + i * 6;
    titulosAgenda.push(`Mitin masivo — ${nombreMunicipio} ${i + 1}`);
    tiposAgenda.push('evento');
    fechasAgenda.push(new Date(Date.now() + diasOffset * 86400000).toISOString());
    lugaresAgenda.push(LUGARES_EVENTO[i % LUGARES_EVENTO.length]);
    realizadoAgenda.push(false);
  }
  await query(
    `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por, realizado)
     SELECT $1, t, tp, f::timestamptz, l, $2, r
     FROM UNNEST($3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[]) AS u(t, tp, f, l, r)`,
    [campanaId, jefeId, titulosAgenda, tiposAgenda, fechasAgenda, lugaresAgenda, realizadoAgenda]
  );
  console.log(`✅ Agenda: 100 reuniones + 60 eventos (50 regulares + 10 mítines grandes) = 160 entradas`);

  // ── 5. CAMINATAS — 25, cada una con su evento de Agenda ligado ──
  for (let i = 0; i < 25; i++) {
    const secc = seccionAl(i * 3);
    const diasAdelante = 2 + Math.floor(Math.random() * 30);
    const fecha = new Date(Date.now() + diasAdelante * 86400000).toISOString();
    const tituloCaminata = `Caminata ${CALLES_GENERICAS[i % CALLES_GENERICAS.length]} — Sección ${secc.numero}`;
    const eventoAgenda = await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, lugar, creado_por) VALUES ($1,$2,'recorrido',$3,$4,$5) RETURNING id`,
      [campanaId, tituloCaminata, fecha, CALLES_GENERICAS[i % CALLES_GENERICAS.length], jefeId]
    );
    // Puntos aproximados alrededor del centro real del territorio
    // cargado — antes esto era un punto fijo cerca de Apizaco.
    const baseLat = CENTRO_LAT + (Math.random() - 0.5) * 0.02;
    const baseLng = CENTRO_LNG + (Math.random() - 0.5) * 0.02;
    const puntos = Array.from({ length: 4 }, (_, j) => [baseLng + j * 0.0015, baseLat + j * 0.0012]);
    const geojson = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: puntos } };
    await query(
      `INSERT INTO caminatas (campana_id, titulo, calle_inicio, calle_fin, ruta_geojson, distancia_km, tiempo_estimado_min, acompanantes, fecha, seccion_id, agenda_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [campanaId, tituloCaminata, `${CALLES_GENERICAS[i % CALLES_GENERICAS.length]} #1`, `${CALLES_GENERICAS[(i + 3) % CALLES_GENERICAS.length]} #${200 + i}`,
       JSON.stringify(geojson), +(0.8 + Math.random() * 2).toFixed(1), 10 + Math.floor(Math.random() * 25),
       `${2 + Math.floor(Math.random() * 6)} brigadistas`, fecha, secc.id, eventoAgenda.rows[0].id, promotorIds[i % promotorIds.length]]
    );
  }
  console.log('✅ 25 caminatas (cada una con su evento de Agenda ligado)');

  // ── 6. ACTIVOS — 150 bardas + 25 espectaculares + 1000 mantas ──
  // Bulk insert con UNNEST otra vez — 1175 filas en 1 sola consulta.
  const EMPRESAS_PROPAGANDA = ['Pintores Unidos Tlax', 'Publicidad Exterior del Centro', 'Lonas y Mantas Express', 'Impresos Rápidos Tlaxcala', 'Rotulación Total'];
  const tiposActivo = [], direccionesActivo = [], empresasActivo = [], costosActivo = [], seccionesActivo = [], fechasActivo = [];
  const agregarActivos = (tipo, cantidad, costoBase) => {
    for (let i = 0; i < cantidad; i++) {
      const secc = seccionAl(i);
      tiposActivo.push(tipo);
      direccionesActivo.push(`${CALLES_GENERICAS[i % CALLES_GENERICAS.length]} #${100 + (i % 400)}, ${nombreMunicipio}`);
      empresasActivo.push(EMPRESAS_PROPAGANDA[i % EMPRESAS_PROPAGANDA.length]);
      costosActivo.push(costoBase + Math.floor(Math.random() * costoBase * 0.4));
      seccionesActivo.push(secc.id);
      fechasActivo.push(`CURRENT_DATE - ${5 + (i % 20)}`); // placeholder, se resuelve abajo
    }
  };
  agregarActivos('barda', 150, 3200);
  agregarActivos('espectacular', 25, 20000);
  agregarActivos('manta', 1000, 900);

  // fecha_ini como intervalo real (no string SQL crudo) — se calcula
  // en JS para poder mandarlo como parámetro seguro.
  const fechasActivoReales = tiposActivo.map((_, i) => {
    const diasAtras = 5 + (i % 20);
    return new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
  });

  await query(
    `INSERT INTO activos (campana_id, tipo, direccion, empresa, costo, seccion_id, fecha_ini, registrado_por)
     SELECT $1, t, d, e, c, s, f::date, $2
     FROM UNNEST($3::text[], $4::text[], $5::text[], $6::numeric[], $7::int[], $8::text[]) AS u(t, d, e, c, s, f)`,
    [campanaId, jefeId, tiposActivo, direccionesActivo, empresasActivo, costosActivo, seccionesActivo, fechasActivoReales]
  );
  console.log(`✅ Activos: 150 bardas + 25 espectaculares + 1000 mantas = 1,175 registros`);

  // ── 7. CASILLAS — 80% de cobertura, usando la misma regla oficial
  // (máx. ~750 electores por casilla básica) que ya usa el sistema.
  let casillasCreadas = 0, casillasAsignadas = 0;
  for (const secc of secciones) {
    const casillasNecesarias = Math.max(1, Math.ceil((secc.lista_nominal || 750) / 750));
    const casillasAGenerar = Math.max(1, Math.round(casillasNecesarias * 0.8)); // 80% de cobertura
    const letras = ['B', 'C1', 'C2', 'C3', 'C4'];
    for (let i = 0; i < casillasAGenerar; i++) {
      const tieneRepresentante = Math.random() < 0.6; // 60% de las creadas ya con representante asignado
      await query(
        `INSERT INTO casillas (campana_id, seccion_id, numero, representante_id, confirmado_asistencia)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (campana_id, seccion_id, numero) DO NOTHING`,
        [campanaId, secc.id, letras[i % letras.length],
         tieneRepresentante ? promotorIds[Math.floor(Math.random() * promotorIds.length)] : null,
         tieneRepresentante && Math.random() < 0.7]
      );
      casillasCreadas++;
      if (tieneRepresentante) casillasAsignadas++;
    }
  }
  console.log(`✅ Casillas: ${casillasCreadas} registradas (~80% de cobertura), ${casillasAsignadas} con representante asignado`);

  // ── 8. Finanzas, Incidencias, Encuesta, Jurídico, Chat — igual que
  // antes (volumen moderado, no se pidió más aquí) ──
  const gastosExtra = [
    { cat: 'propaganda_impresa', desc: 'Impresión de 5,000 volantes', monto: 4200, prov: 'Imprenta Rápida Tlax' },
    { cat: 'espectaculares', desc: 'Renta de espectacular en carretera federal', monto: 22000, prov: 'Publicidad Exterior del Centro' },
    { cat: 'transporte', desc: 'Combustible y viáticos equipo de campo', monto: 8600, prov: 'Gasolinera Local' },
    { cat: 'tecnologia', desc: 'Suscripción mensual VotoTech', monto: 2500, prov: 'VotoTech' },
    { cat: 'personal', desc: 'Pago quincenal de coordinadores de campo', monto: 15000, prov: 'Nómina interna' },
    { cat: 'publicidad_digital', desc: 'Campaña de anuncios en redes sociales', monto: 6800, prov: 'Meta Ads' },
    { cat: 'eventos', desc: 'Renta de equipo de sonido para mitin de arranque', monto: 18500, prov: 'Sonido Profesional' },
  ];
  for (const g of gastosExtra) {
    const diasAtras = Math.floor(Math.random() * 20);
    await query(
      `INSERT INTO gastos_campana (campana_id, categoria, descripcion, monto, fecha, proveedor, forma_pago, registrado_por)
       VALUES ($1,$2,$3,$4,CURRENT_DATE - $5::int,$6,'transferencia',$7)`,
      [campanaId, g.cat, g.desc, g.monto, diasAtras, g.prov, jefeId]
    );
  }

  const incidenciasExtra = [
    { tipo: 'irregularidad', urgencia: 'media', desc: 'Propaganda de otro candidato colocada fuera del perímetro permitido cerca de la casilla' },
    { tipo: 'compra_votos', urgencia: 'urgente', desc: 'Reporte de entrega de despensas condicionadas al voto en la colonia' },
    { tipo: 'violencia', urgencia: 'alta', desc: 'Altercado entre simpatizantes de distintos partidos durante recorrido' },
    { tipo: 'logistica', urgencia: 'baja', desc: 'Falta material de identificación para representantes de casilla' },
    { tipo: 'representante', urgencia: 'media', desc: 'Representante de casilla no se presentó, se buscó reemplazo' },
  ];
  for (const inc of incidenciasExtra) {
    const secc = seccionAl(Math.floor(Math.random() * secciones.length));
    await query(
      `INSERT INTO incidencias (campana_id, tipo, urgencia, descripcion, seccion_id, reportado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
      [campanaId, inc.tipo, inc.urgencia, inc.desc, secc.id, promotorIds[Math.floor(Math.random() * promotorIds.length)]]
    );
  }
  console.log('✅ 7 gastos y 5 incidencias de ejemplo');

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
  const opcionesEncuesta = ['Agua potable', 'Seguridad', 'Empleo', 'Pavimentación', 'Alumbrado público'];
  for (let i = 0; i < 30; i++) {
    const secc = seccionAl(i);
    await query(
      `INSERT INTO encuesta_respuestas (encuesta_id, respuestas, origen, seccion_id, capturado_por)
       VALUES ($1,$2,'campo',$3,$4)`,
      [encuestaDemo.rows[0].id, JSON.stringify({ [preguntaOpcion.rows[0].id]: opcionesEncuesta[i % opcionesEncuesta.length] }), secc.id, promotorIds[i % promotorIds.length]]
    );
  }

  const plazos = [
    { titulo: 'Inicio oficial de campaña', tipo: 'plazo_ite', dias: -10 },
    { titulo: 'Fecha límite de fiscalización mensual', tipo: 'plazo_ine', dias: 12 },
    { titulo: 'Veda electoral', tipo: 'veda', dias: 85 },
    { titulo: 'Jornada electoral', tipo: 'otro', dias: 90 },
  ];
  for (const pl of plazos) {
    await query(`INSERT INTO calendario_electoral (campana_id, titulo, tipo, fecha, cumplido) VALUES ($1,$2,$3,CURRENT_DATE + $4::int, $5)`,
      [campanaId, pl.titulo, pl.tipo, pl.dias, pl.dias < 0]);
  }
  await query(
    `INSERT INTO quejas_recursos (campana_id, tipo, autoridad, numero_expediente, descripcion, estado, fecha_presentacion, resultado, creado_por)
     VALUES ($1,'queja','ite','ITE-Q-045/2027','Colocación de propaganda de oposición en equipamiento urbano no autorizado','resuelta',CURRENT_DATE - 8,'Se ordenó el retiro de la propaganda en 48 horas, cumplido',$2)`,
    [campanaId, jefeId]
  );

  const mensajesChat = [
    { autor: jefeId, texto: '¡Buenos días equipo! Hoy toca recorrido en la zona norte, nos vemos a las 9am.' },
    { autor: coordsSeccionales[0], texto: 'Confirmado, ya tengo a los promotores listos.' },
    { autor: jefeId, texto: 'Perfecto. No olviden llevar el material nuevo.' },
    { autor: promotorIds[0], texto: 'Ya llegamos a la zona, empezamos el recorrido 👍' },
  ];
  for (const m of mensajesChat) {
    await query(`INSERT INTO chat_mensajes (campana_id, canal, autor_id, texto) VALUES ($1,'general',$2,$3)`, [campanaId, m.autor, m.texto]);
  }
  await query(
    `INSERT INTO anuncios (campana_id, titulo, mensaje, importante, creado_por)
     VALUES ($1,'Recordatorio: junta general el viernes','Todos los coordinadores deben asistir a la junta general este viernes a las 6pm.',true,$2)`,
    [campanaId, jefeId]
  );
  console.log('✅ Encuesta (30 respuestas), calendario electoral, 1 queja, chat y anuncio');

  console.log('\n🎉 Cuenta DEMO lista — con volumen real para presentaciones.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Subdominio: demo');
  console.log(`  Correo:     ${DEMO_EMAIL}`);
  console.log(`  Contraseña: ${DEMO_PASSWORD}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { subdominio: DEMO_SUBDOMINIO, email: DEMO_EMAIL, password: DEMO_PASSWORD };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  crearDemo()
    .then(() => pool.end())
    .catch((e) => { console.error('❌ Error creando demo:', e); process.exit(1); });
}

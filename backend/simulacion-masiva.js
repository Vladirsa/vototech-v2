import { query } from './src/db/pool.js';
import bcrypt from 'bcryptjs';

const API = 'http://localhost:4000/api';
const ERRORES = [];
const AVISOS = [];

function logError(contexto, detalle) {
  ERRORES.push({ contexto, detalle });
  console.log(`❌ ERROR [${contexto}]: ${detalle}`);
}
function logAviso(contexto, detalle) {
  AVISOS.push({ contexto, detalle });
  console.log(`⚠️  AVISO [${contexto}]: ${detalle}`);
}

async function fetchJson(url, opciones = {}) {
  try {
    const r = await fetch(url, opciones);
    const texto = await r.text();
    let data;
    try { data = JSON.parse(texto); } catch { data = { _raw: texto.slice(0, 200) }; }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

const TIPOS_ELECCION = ['ayuntamiento', 'dip_local', 'dip_federal', 'gobernador', 'pres_comunidad'];
const PARTIDOS = ['morena', 'pan', 'pri', 'mc', 'pvem', 'pt'];

async function crearCampana(i, tipo) {
  const nombre = `SIM-${i}-${tipo}`;
  const subdominio = `simulacion${i}`;
  const email = `candidato${i}@simulacion.mx`;
  const passwordHash = await bcrypt.hash('SimPassword123', 10);

  // Limpiar si existe
  await query('DELETE FROM campanas WHERE subdominio=$1', [subdominio]);

  const campanaRes = await query(
    `INSERT INTO campanas (nombre_candidato, tipo_eleccion, subdominio, estado_id, estado_aprobacion, activa, partido, fecha_eleccion, territorio_tipo, territorio_id)
     VALUES ($1,$2,$3,29,'aprobada',true,$4,'2027-06-06',$5,$6) RETURNING id`,
    [nombre, tipo, subdominio, PARTIDOS[i % PARTIDOS.length],
     tipo === 'ayuntamiento' || tipo === 'pres_comunidad' ? 'municipio' : tipo === 'dip_local' ? 'distrito_local' : tipo === 'dip_federal' ? 'distrito_federal' : null,
     tipo === 'gobernador' ? null : 1]
  );
  const campanaId = campanaRes.rows[0].id;

  const userRes = await query(
    `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol, aprobado)
     VALUES ($1,$2,$3,$4,'candidato',true) RETURNING id`,
    [campanaId, `Candidato Simulación ${i}`, email, passwordHash]
  );

  return { campanaId, candidatoId: userRes.rows[0].id, subdominio, email, tipo };
}

async function login(subdominio, email) {
  const r = await fetchJson(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subdominio, email, password: 'SimPassword123' }),
  });
  if (r.status !== 200 || !r.data.token) {
    logError('LOGIN', `No se pudo iniciar sesión para ${subdominio}: HTTP ${r.status} - ${JSON.stringify(r.data)}`);
    return null;
  }
  return r.data.token;
}

async function saturarEstructura(token, campanaId, n) {
  const secciones = await query('SELECT numero FROM secciones WHERE estado_id=29 ORDER BY random() LIMIT $1', [n]);
  let creados = 0, errores = 0;
  for (let i = 0; i < n; i++) {
    const seccion = secciones.rows[i % secciones.rows.length]?.numero;
    const r = await fetchJson(`${API}/estructura`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nombre: `Promotor Sim ${i}`, email: `promotor${i}_${campanaId.slice(0, 6)}@sim.mx`,
        password: 'password123', rol: 'promotor', territorio_tipo: 'seccion', territorio_id: seccion, meta_diaria: 5,
      }),
    });
    if (r.status === 201) creados++;
    else errores++;
  }
  if (errores > 0) logAviso('SATURACIÓN ESTRUCTURA', `${errores} de ${n} creaciones de promotor fallaron`);
  return creados;
}

async function saturarPromovidos(token, n) {
  let creados = 0, errores = 0;
  const clasificaciones = ['base', 'persuadible', 'adversario'];
  const promises = [];
  for (let i = 0; i < n; i++) {
    promises.push(fetchJson(`${API}/promovidos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nombre: `Promovido Simulado ${i}`, telefono: `246${String(1000000 + i).slice(0, 7)}`,
        seccion_numero: Math.floor(Math.random() * 600) + 1,
        partido: PARTIDOS[i % PARTIDOS.length], consentimiento: true,
        comprometido: i % 3 === 0,
      }),
    }));
    // Lotes de 20 concurrentes para no saturar de más
    if (promises.length >= 20) {
      const resultados = await Promise.all(promises);
      resultados.forEach(r => { if (r.status === 201) creados++; else errores++; });
      promises.length = 0;
    }
  }
  if (promises.length) {
    const resultados = await Promise.all(promises);
    resultados.forEach(r => { if (r.status === 201) creados++; else errores++; });
  }
  if (errores > 0) logAviso('SATURACIÓN PROMOVIDOS', `${errores} de ${n} creaciones de promovido fallaron`);
  return creados;
}

async function pruebaCargaConcurrente(token, endpoint, nombreLegible, concurrencia) {
  const inicio = Date.now();
  const promises = Array.from({ length: concurrencia }, () =>
    fetchJson(`${API}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
  );
  const resultados = await Promise.all(promises);
  const tiempoTotal = Date.now() - inicio;
  const exitosos = resultados.filter(r => r.status === 200).length;
  const fallidos = resultados.filter(r => r.status !== 200);
  const tiempoPromedio = tiempoTotal / concurrencia;

  console.log(`  ${nombreLegible}: ${exitosos}/${concurrencia} OK en ${tiempoTotal}ms (${tiempoPromedio.toFixed(0)}ms/req promedio)`);
  if (fallidos.length > 0) {
    logAviso('CARGA CONCURRENTE', `${nombreLegible}: ${fallidos.length}/${concurrencia} peticiones fallaron bajo carga de ${concurrencia} simultáneas. Ejemplo: HTTP ${fallidos[0].status}`);
  }
  if (tiempoPromedio > 1000) {
    logAviso('RENDIMIENTO', `${nombreLegible}: tiempo promedio de ${tiempoPromedio.toFixed(0)}ms por petición bajo carga de ${concurrencia} — lento`);
  }
  return { exitosos, fallidos: fallidos.length, tiempoTotal, tiempoPromedio };
}

async function main() {
  console.log('═══ INICIANDO SIMULACIÓN MASIVA — 5 CAMPAÑAS ═══\n');
  const campanas = [];

  for (let i = 1; i <= 5; i++) {
    const tipo = TIPOS_ELECCION[i - 1];
    console.log(`\n── Campaña ${i}: ${tipo} ──`);
    try {
      const c = await crearCampana(i, tipo);
      campanas.push(c);
      console.log(`  ✅ Campaña creada: ${c.subdominio}`);
    } catch (e) {
      logError('CREACIÓN DE CAMPAÑA', `Tipo ${tipo}: ${e.message}`);
    }
  }

  console.log('\n═══ PROBANDO LOGIN Y SATURANDO CADA CAMPAÑA ═══');
  const tokens = [];
  for (const c of campanas) {
    const token = await login(c.subdominio, c.email);
    if (!token) continue;
    tokens.push({ ...c, token });

    console.log(`\n── Saturando ${c.subdominio} (${c.tipo}) ──`);
    const promotores = await saturarEstructura(token, c.campanaId, 15);
    console.log(`  Promotores creados: ${promotores}/15`);
    const promovidos = await saturarPromovidos(token, 200);
    console.log(`  Promovidos creados: ${promovidos}/200`);
  }

  console.log('\n═══ PRUEBAS DE ENDPOINTS CLAVE (por campaña) ═══');
  for (const c of tokens) {
    console.log(`\n── ${c.subdominio} (${c.tipo}) ──`);
    const endpoints = [
      ['/dashboard/resumen', 'Dashboard'],
      ['/promovidos', 'Lista de Promovidos'],
      ['/estructura', 'Estructura'],
      ['/priorizacion', 'Priorización'],
      ['/reportes/ficha-estado', 'Ficha del Estado'],
      ['/reportes/motor-riesgos', 'Motor de Riesgos'],
      ['/reportes/probabilidad', 'Probabilidad'],
      ['/estructura/gamificacion', 'Gamificación'],
      ['/estructura/cobertura-casillas', 'Cobertura de Casillas'],
      ['/finanzas', 'Finanzas'],
      ['/dia-eleccion/caceria', 'Cacería Día D'],
      ['/promovidos-analitica/por-partido', 'Analítica por Partido'],
    ];
    for (const [ep, nombre] of endpoints) {
      const r = await fetchJson(`${API}${ep}`, { headers: { Authorization: `Bearer ${c.token}` } });
      if (r.status !== 200) {
        logError('ENDPOINT', `${c.tipo} → ${nombre} (${ep}): HTTP ${r.status} - ${JSON.stringify(r.data).slice(0, 200)}`);
      } else {
        console.log(`  ✅ ${nombre}`);
      }
    }
  }

  console.log('\n═══ PRUEBA DE CARGA CONCURRENTE (capacidad del servidor) ═══');
  if (tokens.length > 0) {
    const token = tokens[0].token;
    for (const n of [10, 25, 50, 100]) {
      await pruebaCargaConcurrente(token, '/promovidos', `GET /promovidos`, n);
    }
    for (const n of [10, 25, 50]) {
      await pruebaCargaConcurrente(token, '/dashboard/resumen', `GET /dashboard/resumen`, n);
    }
  }

  console.log('\n═══ PRUEBAS DE LÓGICA Y CASOS LÍMITE ═══');

  // Caso 1: promovido duplicado (mismo teléfono)
  if (tokens[0]) {
    const t = tokens[0].token;
    const tel = '2461119999';
    await fetchJson(`${API}/promovidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ nombre: 'Duplicado Uno', telefono: tel, seccion_numero: 12 }) });
    const r2 = await fetchJson(`${API}/promovidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ nombre: 'Duplicado Dos', telefono: tel, seccion_numero: 12 }) });
    if (r2.status === 201) {
      logAviso('LÓGICA - DUPLICADOS', 'Se pudo crear un segundo promovido con el mismo teléfono sin advertencia de duplicado');
    } else {
      console.log('  ✅ Detección de duplicados funcionando');
    }
  }

  // Caso 2: login con contraseña incorrecta muchas veces (rate limit / fuerza bruta)
  console.log('\n  Probando fuerza bruta de login (10 intentos rápidos)...');
  let bloqueado = false;
  for (let i = 0; i < 10; i++) {
    const r = await fetchJson(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdominio: 'simulacion1', email: 'candidato1@simulacion.mx', password: 'incorrecta' }) });
    if (r.status === 429) { bloqueado = true; break; }
  }
  if (!bloqueado) {
    logAviso('SEGURIDAD - FUERZA BRUTA', '10 intentos fallidos de login seguidos no activaron ningún bloqueo/rate-limit visible en las respuestas');
  } else {
    console.log('  ✅ Rate limit de login activo');
  }

  // Caso 3: territorio inválido
  if (tokens[0]) {
    const r = await fetchJson(`${API}/estructura`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[0].token}` }, body: JSON.stringify({ nombre: 'Test Territorio Invalido', email: 'territorioinvalido@sim.mx', password: 'password123', rol: 'promotor', territorio_tipo: 'seccion', territorio_id: 99999 }) });
    if (r.status === 201) {
      logAviso('LÓGICA - VALIDACIÓN DE TERRITORIO', 'Se pudo asignar una sección inexistente (99999) sin validación');
    } else {
      console.log('  ✅ Validación de territorio inexistente funcionando');
    }
  }

  // Caso 4: campaña sin partido (ya debería estar bloqueado, confirmar)
  const rSinPartido = await fetchJson(`${API}/auth/registrar-campana`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_candidato: 'Sin Partido Test', email: 'sinpartidotest@sim.mx', password: 'password123', tipo_eleccion: 'ayuntamiento', estado_id: 29, subdominio: 'sinpartidotest' }),
  });
  if (rSinPartido.status === 201) {
    logError('LÓGICA - REGISTRO SIN PARTIDO', 'Se pudo registrar una campaña nueva SIN partido — validación rota o ausente');
  } else {
    console.log('  ✅ Bloqueo de registro sin partido sigue funcionando');
  }

  // Caso 5: acceso cruzado entre campañas (aislamiento multi-tenant)
  if (tokens.length >= 2) {
    const tokenA = tokens[0].token;
    const promovidosB = await query('SELECT id FROM promovidos WHERE campana_id=$1 LIMIT 1', [tokens[1].campanaId]);
    if (promovidosB.rows[0]) {
      const idAjeno = promovidosB.rows[0].id;
      const r = await fetchJson(`${API}/promovidos/${idAjeno}`, { headers: { Authorization: `Bearer ${tokenA}` } });
      if (r.status === 200) {
        logError('SEGURIDAD - AISLAMIENTO MULTI-TENANT', `¡CRÍTICO! La campaña A pudo leer un promovido de la campaña B (ID ${idAjeno}) — aislamiento de datos roto`);
      } else {
        console.log('  ✅ Aislamiento multi-tenant funcionando correctamente (403/404 esperado)');
      }
    }
  }

  // Caso 6: SQL injection básico en un campo de texto
  if (tokens[0]) {
    const r = await fetchJson(`${API}/promovidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[0].token}` }, body: JSON.stringify({ nombre: "Robert'); DROP TABLE promovidos;--", telefono: '2460000001', seccion_numero: 12 }) });
    const checkTabla = await query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='promovidos'");
    if (parseInt(checkTabla.rows[0].count) === 0) {
      logError('SEGURIDAD - SQL INJECTION', '¡CRÍTICO! La tabla promovidos fue borrada por una prueba de inyección SQL');
    } else {
      console.log('  ✅ Protegido contra inyección SQL básica (parametrización funcionando)');
    }
  }

  // Caso 7: valores numéricos extremos / negativos en montos
  if (tokens[0]) {
    const r = await fetchJson(`${API}/finanzas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[0].token}` }, body: JSON.stringify({ categoria: 'otro', descripcion: 'Gasto negativo test', monto: -5000, fecha: '2026-01-01' }) });
    if (r.status === 201 || (r.status === 400 && !JSON.stringify(r.data).includes('foto'))) {
      // si pasa la validación de monto (aunque falle por falta de foto), es un problema de validación de monto
      if (!JSON.stringify(r.data).toLowerCase().includes('positive') && !JSON.stringify(r.data).toLowerCase().includes('monto')) {
        logAviso('LÓGICA - VALIDACIÓN DE MONTOS', 'Un monto negativo en gastos no fue claramente rechazado por validación de monto (puede haber sido bloqueado solo por falta de foto)');
      }
    }
  }

  console.log('\n═══ LIMPIEZA ═══');
  for (const c of campanas) {
    await query('DELETE FROM campanas WHERE id=$1', [c.campanaId]);
  }
  console.log('Campañas de simulación borradas.');

  console.log('\n\n═══════════════════════════════════════');
  console.log(`RESUMEN: ${ERRORES.length} errores encontrados, ${AVISOS.length} avisos`);
  console.log('═══════════════════════════════════════');
  console.log(JSON.stringify({ errores: ERRORES, avisos: AVISOS }, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error('FALLO CRÍTICO EN LA SIMULACIÓN:', e); process.exit(1); });

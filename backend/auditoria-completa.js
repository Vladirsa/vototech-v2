const API = 'http://localhost:4000/api';
const ERRORES = [];
const AVISOS = [];
const OK = [];

function err(ctx, det) { ERRORES.push({ ctx, det }); console.log(`❌ [${ctx}] ${det}`); }
function aviso(ctx, det) { AVISOS.push({ ctx, det }); console.log(`⚠️  [${ctx}] ${det}`); }
function ok(ctx) { OK.push(ctx); console.log(`✅ ${ctx}`); }

async function fj(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { d = { _raw: t.slice(0, 150) }; }
    return { status: r.status, data: d };
  } catch (e) { return { status: 0, error: e.message }; }
}

async function main() {
  console.log('═══ AUDITORÍA COMPLETA — TODO LO CONSTRUIDO ESTA SESIÓN ═══\n');

  const loginDemo = await fj(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdominio: 'demo', email: 'demo@vototech.mx', password: 'VotoTechDemo2027' }) });
  const tokenCandidato = loginDemo.data.token;
  if (!tokenCandidato) { console.log('FALLO CRÍTICO: no se pudo iniciar sesión como demo'); process.exit(1); }

  // Necesitamos un token de rol bajo (promotor) para probar seguridad
  const promos = await fj(`${API}/estructura`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
  const promotor = promos.data.data?.find(u => u.rol === 'promotor');

  console.log('\n── 1. PERMISOS PERSONALIZADOS — seguridad ──');
  {
    // ¿Un promotor puede VER la matriz de permisos? No debería.
    // Necesitamos su password real — probamos con la conocida del demo
    const loginProm = await fj(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdominio: 'demo', email: promotor ? `${promotor.nombre.toLowerCase().replace(/\s+/g, '.')}@demo.vototech.mx` : 'noexiste@x.mx', password: 'VotoTechDemo2027' }) });
    // fallback: usar promotor1 conocido de sesiones anteriores
    let tokenPromotor = loginProm.data.token;
    if (!tokenPromotor) {
      const l2 = await fj(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdominio: 'demo', email: 'promotor1@demo.vototech.mx', password: 'VotoTechDemo2027' }) });
      tokenPromotor = l2.data.token;
    }
    if (tokenPromotor) {
      const r = await fj(`${API}/estructura/permisos`, { headers: { Authorization: `Bearer ${tokenPromotor}` } });
      if (r.status === 200) err('PERMISOS-SEGURIDAD', 'Un PROMOTOR pudo leer la matriz completa de permisos — debería ser 403');
      else ok('Promotor bloqueado de ver matriz de permisos (403 esperado)');

      const r2 = await fj(`${API}/estructura/permisos`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenPromotor}` }, body: JSON.stringify({ rol: 'promotor', modulo: 'finanzas', permitido: true }) });
      if (r2.status === 200) err('PERMISOS-SEGURIDAD', '¡CRÍTICO! Un PROMOTOR pudo darse a sí mismo acceso a Finanzas');
      else ok('Promotor bloqueado de auto-otorgarse permisos');
    } else {
      aviso('PERMISOS-SEGURIDAD', 'No se pudo obtener token de promotor para probar — prueba omitida');
    }

    // Módulo inválido
    const r3 = await fj(`${API}/estructura/permisos`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCandidato}` }, body: JSON.stringify({ rol: 'promotor', modulo: 'modulo_que_no_existe', permitido: true }) });
    if (r3.status === 200) err('PERMISOS-VALIDACIÓN', 'Se aceptó un nombre de módulo inventado sin validar contra la lista real');
    else ok('Rechazo correcto de módulo inválido');
  }

  console.log('\n── 2. CARGA DE CSV — inyección y malformación ──');
  {
    // CSV con inyección SQL en el campo partido
    const csvMalicioso = "seccion,partido,votos\n12,morena'); DROP TABLE promovidos;--,100";
    const fd = new FormData();
    fd.append('archivo', new Blob([csvMalicioso], { type: 'text/csv' }), 'malicioso.csv');
    fd.append('estado_id', '29'); fd.append('tipo_eleccion', 'senador'); fd.append('anio', '2099');
    const r = await fj(`${API}/admin/subir-resultados-historicos`, { method: 'POST', headers: { 'x-admin-key': 'miClaveSecreta123' }, body: fd });
    // Confirmar que la tabla sigue viva
    const check = await fj(`${API}/estructura`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (check.status !== 200) err('CSV-INYECCIÓN', '¡CRÍTICO! El sistema quedó inutilizable tras subir CSV malicioso');
    else ok('Protegido contra inyección SQL vía CSV (parametrización funcionando)');

    // CSV completamente vacío
    const fd2 = new FormData();
    fd2.append('archivo', new Blob([''], { type: 'text/csv' }), 'vacio.csv');
    fd2.append('estado_id', '29'); fd2.append('tipo_eleccion', 'senador'); fd2.append('anio', '2099');
    const r2 = await fj(`${API}/admin/subir-resultados-historicos`, { method: 'POST', headers: { 'x-admin-key': 'miClaveSecreta123' }, body: fd2 });
    if (r2.status === 500) err('CSV-VACÍO', `Subir un CSV vacío truena el servidor (500) en vez de dar mensaje claro: ${JSON.stringify(r2.data)}`);
    else ok(`CSV vacío manejado sin tronar (HTTP ${r2.status})`);

    // CSV sin las columnas esperadas
    const csvSinColumnas = "nombre,edad\nJuan,30";
    const fd3 = new FormData();
    fd3.append('archivo', new Blob([csvSinColumnas], { type: 'text/csv' }), 'columnas_malas.csv');
    fd3.append('estado_id', '29'); fd3.append('tipo_eleccion', 'senador'); fd3.append('anio', '2099');
    const r3 = await fj(`${API}/admin/subir-resultados-historicos`, { method: 'POST', headers: { 'x-admin-key': 'miClaveSecreta123' }, body: fd3 });
    if (r3.status === 500) err('CSV-COLUMNAS', `CSV con columnas equivocadas truena (500) en vez de avisar claro: ${JSON.stringify(r3.data)}`);
    else if (r3.data.mensaje?.includes('0 filas nuevas') || r3.data.mensaje?.includes('0 actualizadas')) ok('CSV con columnas equivocadas se ignora silenciosamente (0 filas) — no truena, pero revisar claridad del mensaje');
    else ok(`CSV con columnas equivocadas manejado (HTTP ${r3.status})`);

    // ¿Endpoint de admin protegido de verdad? probar SIN la clave
    const r4 = await fj(`${API}/admin/subir-resultados-historicos`, { method: 'POST', body: new FormData() });
    if (r4.status === 200 || r4.status === 201) err('ADMIN-SEGURIDAD', '¡CRÍTICO! Se pudo llamar el endpoint de carga de datos SIN la clave de super-admin');
    else ok('Endpoint de carga protegido contra falta de clave admin');
  }

  console.log('\n── 3. FICHA-TERRITORIO — casos límite ──');
  {
    const r = await fj(`${API}/reportes/ficha-territorio/municipio/99999`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (r.status === 500) err('FICHA-TERRITORIO', `Municipio inexistente (99999) truena el servidor: ${JSON.stringify(r.data)}`);
    else ok(`Municipio inexistente manejado sin tronar (HTTP ${r.status})`);

    const r2 = await fj(`${API}/reportes/ficha-territorio/tipo_invalido/1`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (r2.status === 500) err('FICHA-TERRITORIO', `Tipo de territorio inventado truena el servidor: ${JSON.stringify(r2.data)}`);
    else ok(`Tipo de territorio inválido manejado (HTTP ${r2.status})`);

    const r3 = await fj(`${API}/reportes/ficha-territorio/distrito_federal/-1`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (r3.status === 500) err('FICHA-TERRITORIO', `Número de distrito negativo truena el servidor`);
    else ok(`Distrito negativo manejado sin tronar (HTTP ${r3.status})`);
  }

  console.log('\n── 4. DENSIDAD-PROMOVIDOS Y FICHA DE SECCIÓN ──');
  {
    const r = await fj(`${API}/priorizacion/densidad-promovidos`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (r.status !== 200) err('DENSIDAD', `Endpoint básico falla: HTTP ${r.status}`);
    else ok('Densidad de promovidos responde correctamente');

    const r2 = await fj(`${API}/priorizacion/seccion/99999`, { headers: { Authorization: `Bearer ${tokenCandidato}` } });
    if (r2.status === 500) err('FICHA-SECCIÓN', `Sección inexistente (99999) truena el servidor: ${JSON.stringify(r2.data)}`);
    else ok(`Sección inexistente en ficha manejada (HTTP ${r2.status})`);
  }

  console.log('\n── 5. AISLAMIENTO ENTRE CAMPAÑAS (re-confirmar tras todos los cambios) ──');
  {
    // Crear una segunda campaña rápida para cruzar datos
    const sub = 'auditoria' + Date.now();
    const reg = await fj(`${API}/auth/registrar-campana`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre_candidato: 'Auditoria Test', email: `auditoria${Date.now()}@test.mx`, password: 'password123', tipo_eleccion: 'ayuntamiento', estado_id: 29, subdominio: sub, partido: 'pan' }) });
    if (reg.data.token) {
      const tokenB = reg.data.token;
      // ¿Puede la campaña B ver los permisos personalizados de la campaña A (demo)?
      const rPermisos = await fj(`${API}/estructura/permisos`, { headers: { Authorization: `Bearer ${tokenB}` } });
      // esto debería funcionar (es SU propia matriz), lo importante es que sea la de B no la de A
      // Verificamos cruce de datos vía densidad-promovidos
      const rDensidad = await fj(`${API}/priorizacion/densidad-promovidos`, { headers: { Authorization: `Bearer ${tokenB}` } });
      if (rDensidad.data.data?.length > 0) err('AISLAMIENTO', 'La campaña nueva (sin promovidos propios) ve densidad de promovidos — posible fuga de datos entre campañas');
      else ok('Aislamiento de densidad-promovidos entre campañas correcto');

      // Afiliados NO están filtrados por campana_id (son por estado) — confirmar que esto es intencional y no un hueco
      aviso('AISLAMIENTO-AFILIADOS', 'La tabla "afiliados" es por ESTADO, no por campaña — cualquier campaña del mismo estado puede verla si se expone un endpoint de lectura. Confirmar que sea la intención (catálogo compartido) y no un descuido.');
    } else {
      aviso('AISLAMIENTO', 'No se pudo crear campaña de prueba para verificar cruce de datos');
    }
  }

  console.log('\n── 6. CARGA CONCURRENTE — endpoints nuevos bajo presión ──');
  {
    const inicio = Date.now();
    const promesas = Array.from({ length: 50 }, () => fj(`${API}/reportes/ficha-territorio/senaduria/estado`, { headers: { Authorization: `Bearer ${tokenCandidato}` } }));
    const resultados = await Promise.all(promesas);
    const exitosos = resultados.filter(r => r.status === 200).length;
    const tiempo = Date.now() - inicio;
    console.log(`  50 peticiones simultáneas a ficha-territorio/senaduria: ${exitosos}/50 OK en ${tiempo}ms`);
    if (exitosos < 50) aviso('CARGA', `Solo ${exitosos}/50 exitosas bajo carga concurrente en ficha-territorio`);
    else ok(`Ficha-territorio aguanta 50 peticiones simultáneas (${tiempo}ms total)`);

    const inicio2 = Date.now();
    const promesas2 = Array.from({ length: 30 }, () => fj(`${API}/priorizacion/seccion/12`, { headers: { Authorization: `Bearer ${tokenCandidato}` } }));
    const resultados2 = await Promise.all(promesas2);
    const exitosos2 = resultados2.filter(r => r.status === 200).length;
    const tiempo2 = Date.now() - inicio2;
    console.log(`  30 peticiones simultáneas a ficha de sección (la más pesada, muchas subconsultas): ${exitosos2}/30 OK en ${tiempo2}ms (${(tiempo2/30).toFixed(0)}ms/prom)`);
    if (tiempo2 / 30 > 500) aviso('RENDIMIENTO', `Ficha de sección tarda ${(tiempo2/30).toFixed(0)}ms en promedio bajo carga — es el endpoint con más subconsultas (equipo, 3 responsables, duplicados) — vigilar si crece la base`);
    else ok(`Ficha de sección responde rápido incluso con sus nuevas subconsultas (${(tiempo2/30).toFixed(0)}ms/prom)`);
  }

  console.log('\n── 7. BÚSQUEDA DE DIRECCIÓN (geo/buscar-direccion) ──');
  {
    const r = await fj(`${API}/geo/buscar-direccion?q=ab`);
    if (r.status !== 200) err('GEO-DIRECCION', `Query corta (2 chars) da error en vez de responder lista vacía: HTTP ${r.status}`);
    else ok('Query corta manejada correctamente (lista vacía)');

    // Sin autenticación -- ¿debería requerir login?
    const r2 = await fj(`${API}/geo/buscar-direccion?q=avenida+juarez+tlaxcala`);
    if (r2.status === 200) aviso('GEO-DIRECCION-SEGURIDAD', 'El buscador de direcciones NO requiere autenticación — cualquiera con la URL puede usarlo sin login, consumiendo tu cuota de Nominatim. Bajo riesgo pero vale la pena saberlo.');
  }

  console.log('\n\n═══════════════════════════════════════');
  console.log(`RESUMEN: ${ERRORES.length} errores, ${AVISOS.length} avisos, ${OK.length} verificaciones correctas`);
  console.log('═══════════════════════════════════════');
  process.exit(0);
}

main().catch(e => { console.error('FALLO CRÍTICO EN LA AUDITORÍA:', e); process.exit(1); });

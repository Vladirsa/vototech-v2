const API = 'http://localhost:4000/api';

async function fetchJson(url, opciones = {}) {
  try {
    const r = await fetch(url, opciones);
    const texto = await r.text();
    let data;
    try { data = JSON.parse(texto); } catch { data = { _raw: texto.slice(0, 150) }; }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function pruebaEscrituraConcurrente(token, concurrencia) {
  const inicio = Date.now();
  const promises = Array.from({ length: concurrencia }, (_, i) =>
    fetchJson(`${API}/promovidos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nombre: `Carga Escritura ${Date.now()}_${i}`,
        telefono: `246${String(2000000 + i).slice(0, 7)}`,
        seccion_numero: Math.floor(Math.random() * 600) + 1,
        partido: 'morena', consentimiento: true,
      }),
    })
  );
  const resultados = await Promise.all(promises);
  const tiempoTotal = Date.now() - inicio;
  const exitosos = resultados.filter(r => r.status === 201).length;
  const fallidos = resultados.filter(r => r.status !== 201);
  console.log(`  ${concurrencia} escrituras simultáneas: ${exitosos}/${concurrencia} OK en ${tiempoTotal}ms (${(tiempoTotal / concurrencia).toFixed(0)}ms/escritura)`);
  if (fallidos.length > 0) {
    const ejemplo = fallidos[0];
    console.log(`    ⚠️  ${fallidos.length} fallaron. Ejemplo: HTTP ${ejemplo.status} - ${JSON.stringify(ejemplo.data).slice(0, 150)}`);
  }
  return { exitosos, fallidos: fallidos.length, tiempoTotal };
}

async function main() {
  const loginRes = await fetchJson(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subdominio: 'demo', email: 'demo@vototech.mx', password: 'VotoTechDemo2027' }),
  });
  const token = loginRes.data.token;
  if (!token) { console.log('No se pudo iniciar sesión:', loginRes); process.exit(1); }

  console.log('═══ PRUEBA DE ESCRITURA CONCURRENTE (creación real de promovidos) ═══');
  for (const n of [10, 25, 50, 100, 150]) {
    await pruebaEscrituraConcurrente(token, n);
    await new Promise(r => setTimeout(r, 500)); // pausa breve entre rondas
  }

  process.exit(0);
}
main().catch((e) => { console.error('FALLO:', e); process.exit(1); });

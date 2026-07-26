const API = 'http://localhost:4000/api';
async function fetchJson(url, opciones = {}) {
  try {
    const r = await fetch(url, opciones);
    const texto = await r.text();
    let data; try { data = JSON.parse(texto); } catch { data = { _raw: texto.slice(0,100) }; }
    return { status: r.status, data };
  } catch (e) { return { status: 0, error: e.message }; }
}
async function prueba(token, n) {
  const inicio = Date.now();
  const promises = Array.from({ length: n }, (_, i) =>
    fetchJson(`${API}/promovidos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nombre: `Limite ${Date.now()}_${i}`, telefono: `246${String(3000000+i).slice(0,7)}`, seccion_numero: (i%600)+1, partido: 'morena', consentimiento: true }),
    })
  );
  const resultados = await Promise.all(promises);
  const tiempoTotal = Date.now() - inicio;
  const exitosos = resultados.filter(r => r.status === 201).length;
  const fallidos = resultados.filter(r => r.status !== 201);
  console.log(`${n} simultáneas: ${exitosos}/${n} OK en ${tiempoTotal}ms`);
  if (fallidos.length > 0) console.log(`  Ejemplo de fallo: HTTP ${fallidos[0].status} - ${JSON.stringify(fallidos[0].data).slice(0,150)}`);
  return exitosos === n;
}
async function main() {
  const loginRes = await fetchJson(`${API}/auth/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ subdominio: 'demo', email: 'demo@vototech.mx', password: 'VotoTechDemo2027' }) });
  const token = loginRes.data.token;
  for (const n of [300, 500, 800]) {
    const ok = await prueba(token, n);
    await new Promise(r => setTimeout(r, 800));
    if (!ok) { console.log(`⚠️  Empezó a fallar en ${n} simultáneas`); }
  }
  process.exit(0);
}
main().catch(e => { console.error('FALLO CRÍTICO:', e.message); process.exit(1); });

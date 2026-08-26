/**
 * verificar-imports.js
 *
 * Revisa que TODO paquete que se importa en el backend (import X
 * from 'paquete') de verdad esté declarado en package.json. Esto es
 * justo lo que se nos escapó con Sentry: el código lo importaba,
 * "node --check" decía que la sintaxis estaba bien (porque SÍ lo
 * está — el error solo aparece al intentar RESOLVER el import en
 * tiempo de ejecución), y el servidor se caía hasta que Render lo
 * intentaba arrancar de verdad.
 *
 * Se corre como parte del CI, antes de desplegar — así este tipo de
 * error se ve en GitHub Actions en rojo, en vez de tumbar el
 * servidor en producción.
 */
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const declarados = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

// Módulos que ya vienen con Node.js — nunca deben estar en package.json
const nativosDeNode = new Set([
  'fs', 'path', 'url', 'crypto', 'http', 'https', 'os', 'util', 'stream',
  'events', 'buffer', 'querystring', 'child_process', 'net', 'dns', 'zlib',
  'assert', 'constants', 'module', 'process', 'timers', 'readline', 'tls',
  'dgram', 'cluster', 'worker_threads', 'perf_hooks', 'v8', 'vm',
  'string_decoder', 'punycode', 'domain', 'repl',
]);

function archivosJS(dir) {
  let resultados = [];
  for (const nombre of fs.readdirSync(dir)) {
    const rutaCompleta = path.join(dir, nombre);
    if (fs.statSync(rutaCompleta).isDirectory()) {
      resultados = resultados.concat(archivosJS(rutaCompleta));
    } else if (nombre.endsWith('.js')) {
      resultados.push(rutaCompleta);
    }
  }
  return resultados;
}

// Atrapa tanto "import X from 'paquete'" como "import 'paquete'"
const regexImport = /import\s+(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;

let faltantes = [];
for (const archivo of archivosJS('src')) {
  const contenido = fs.readFileSync(archivo, 'utf-8');
  let coincidencia;
  regexImport.lastIndex = 0;
  while ((coincidencia = regexImport.exec(contenido))) {
    const modulo = coincidencia[1];
    // Imports relativos (tus propios archivos) no cuentan — solo
    // paquetes externos de npm nos interesan aquí.
    if (modulo.startsWith('.') || modulo.startsWith('/') || modulo.startsWith('node:')) continue;

    const nombrePaquete = modulo.startsWith('@')
      ? modulo.split('/').slice(0, 2).join('/')  // ej: @sentry/node
      : modulo.split('/')[0];                     // ej: express (de 'express/lib/x')

    if (nativosDeNode.has(nombrePaquete)) continue;
    if (!declarados.has(nombrePaquete)) {
      faltantes.push(`${archivo} → importa "${modulo}" pero "${nombrePaquete}" no está en package.json`);
    }
  }
}

if (faltantes.length > 0) {
  console.error('❌ Hay imports usados en el código que NO están declarados en package.json:\n');
  faltantes.forEach((f) => console.error('  ' + f));
  console.error('\nAgrega el paquete faltante a "dependencies" en package.json antes de subir.');
  process.exit(1);
}
console.log('✅ Todos los imports del backend están correctamente declarados en package.json');

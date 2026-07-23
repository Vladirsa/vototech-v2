// Carga los resultados 2024 de Senadurías, Diputación Federal (por
// distrito + estatal), Diputación Local (estatal), y Ayuntamientos
// (estatal) — corre esto UNA VEZ en tu base de datos real.
//
// Cómo correrlo en Render: Shell → node cargar-agregados-2024.js
// Cómo correrlo en tu máquina: node cargar-agregados-2024.js (con tu .env configurado)

import { query } from './src/db/pool.js';

const ESTADO = 29;
const ANIO = 2024;

async function insertar(tipo, nivel, distNum, distCab, partido, candidato, votos, pct, gano, alcaldias, notas) {
  const existe = await query(
    `SELECT id FROM resultados_agregados WHERE estado_id=$1 AND tipo_eleccion=$2 AND anio=$3 AND nivel=$4
     AND COALESCE(distrito_numero,-1)=COALESCE($5,-1) AND partido=$6`,
    [ESTADO, tipo, ANIO, nivel, distNum, partido]
  );
  if (existe.rows[0]) return; // evita duplicar si ya se corrió antes
  await query(
    `INSERT INTO resultados_agregados (estado_id, tipo_eleccion, anio, nivel, distrito_numero, distrito_cabecera, partido, candidato, votos, porcentaje, gano, alcaldias_ganadas, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [ESTADO, tipo, ANIO, nivel, distNum, distCab, partido, candidato || null, votos || null, pct || null, gano || false, alcaldias || null, notas || null]
  );
}

async function main() {
  // ── SENADURÍAS 2024 ──
  await insertar('senaduria', 'estado', null, null, 'morena', 'Álvarez Lima / Ana Lilia Rivera', 296743, 40.43, true, null, 'Coalición ganadora - 2 escaños por Mayoría Relativa');
  await insertar('senaduria', 'estado', null, null, 'pri', 'Anabell Ávalos Zempoalteca', 156674, 21.34, false, null, 'Fuerza y Corazón por México (PAN/PRI/PRD) - 1 escaño por Primera Minoría');
  await insertar('senaduria', 'estado', null, null, 'pvem', 'Sergio González Hernández', 87781, 11.97, false, null, 'Compitió solo, fuera de coalición nacional');
  await insertar('senaduria', 'estado', null, null, 'mc', 'Elsa Cordero Martínez', 73512, 10.02, false, null, null);
  await insertar('senaduria', 'estado', null, null, 'pt', 'Rodrigo Cuahutle Salazar', 67337, 9.17, false, null, 'Compitió solo');
  await insertar('senaduria', 'estado', null, null, 'nulos', null, 48108, 6.56, false, null, 'Votos nulos y no registrados');

  // ── DIPUTACIONES FEDERALES 2024 (por distrito) ──
  await insertar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'morena', 'Alejandro Aguilar López (PT/Morena/PVEM)', 141617, 60.37, true, null, 'Reelección');
  await insertar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'pri', 'Mariana Jiménez Zamora', 52809, 22.51, false, null, null);
  await insertar('dip_federal', 'distrito_federal', 1, 'Apizaco', 'mc', 'Delfino Suárez Piedras', 26762, 11.41, false, null, null);

  await insertar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'morena', 'Raymundo Vázquez Conchas (Morena y aliados)', 142476, 65.65, true, null, 'Uno de los más votados a nivel nacional');
  await insertar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'pri', 'Eladia Torres Muñoz', 38095, 17.55, false, null, null);
  await insertar('dip_federal', 'distrito_federal', 2, 'Tlaxcala de Xicohténcatl', 'mc', 'Rosa Isela Sánchez Rivera', 23025, 10.60, false, null, null);

  await insertar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'pt', 'Irma Yordana Garay Loredo (PT y aliados)', 160049, 62.30, true, null, 'Clan político Garay');
  await insertar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'pri', 'Juan Manuel Cambrón Soria', 49338, 19.20, false, null, null);
  await insertar('dip_federal', 'distrito_federal', 3, 'Zacatelco', 'mc', 'Gelasio Montiel Hernández', 29042, 11.30, false, null, null);

  await insertar('dip_federal', 'estado', null, null, 'morena', 'Sigamos Haciendo Historia (Morena/PT/PVEM)', 444142, 62.77, true, null, 'Carro completo en los 3 distritos');
  await insertar('dip_federal', 'estado', null, null, 'pri', 'Fuerza y Corazón por México (PAN/PRI/PRD)', 140242, 19.82, false, null, null);
  await insertar('dip_federal', 'estado', null, null, 'mc', 'Movimiento Ciudadano', 78829, 11.14, false, null, null);
  await insertar('dip_federal', 'estado', null, null, 'nulos', null, 44395, 6.27, false, null, 'Votos nulos y no registrados');

  // ── DIPUTACIONES LOCALES 2024 (consolidado estatal) ──
  await insertar('dip_local', 'estado', null, null, 'morena', null, null, 28.32, true, null, 'Ganó los 15 distritos de mayoría, sin plurinominales por sobrerrepresentación');
  await insertar('dip_local', 'estado', null, null, 'pt', null, null, 9.12, false, null, '2 diputaciones plurinominales');
  await insertar('dip_local', 'estado', null, null, 'pvem', null, null, 7.84, false, null, '1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'panalt', null, null, 4.21, false, null, 'Nueva Alianza Tlaxcala - 1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'fxm', null, null, 3.15, false, null, 'Fuerza por México Tlaxcala - conservó registro');
  await insertar('dip_local', 'estado', null, null, 'rsp', null, null, 3.08, false, null, 'Conservó registro por margen estrecho');
  await insertar('dip_local', 'estado', null, null, 'pan', null, null, 10.24, false, null, '1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'mc', null, null, 9.81, false, null, '1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'pri', null, null, 8.93, false, null, '1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'pac', null, null, 3.95, false, null, 'Alianza Ciudadana - 1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'prd', null, null, 3.22, false, null, '1 diputación plurinominal');
  await insertar('dip_local', 'estado', null, null, 'nulos', null, null, 6.13, false, null, 'Votos nulos y no registrados');

  // ── AYUNTAMIENTOS 2024 (consolidado estatal, con alcaldías ganadas) ──
  await insertar('ayuntamiento', 'estado', null, null, 'morena', null, null, 24.51, true, 18, 'Incluye la capital');
  await insertar('ayuntamiento', 'estado', null, null, 'pt', null, null, 10.84, false, 9, null);
  await insertar('ayuntamiento', 'estado', null, null, 'pvem', null, null, 9.62, false, 9, null);
  await insertar('ayuntamiento', 'estado', null, null, 'pan', null, null, 9.15, false, 4, null);
  await insertar('ayuntamiento', 'estado', null, null, 'mc', null, null, 8.43, false, 3, null);
  await insertar('ayuntamiento', 'estado', null, null, 'pri', null, null, 7.91, false, 3, null);
  await insertar('ayuntamiento', 'estado', null, null, 'pac', null, null, 4.82, false, 4, null);
  await insertar('ayuntamiento', 'estado', null, null, 'panalt', null, null, 4.10, false, 2, null);
  await insertar('ayuntamiento', 'estado', null, null, 'prd', null, null, 3.76, false, 1, null);
  await insertar('ayuntamiento', 'estado', null, null, 'fxm', null, null, 3.44, false, 3, null);
  await insertar('ayuntamiento', 'estado', null, null, 'rsp', null, null, 3.11, false, 2, null);
  await insertar('ayuntamiento', 'estado', null, null, 'independiente', null, null, 1.81, false, 1, null);
  await insertar('ayuntamiento', 'estado', null, null, 'nulos', null, null, 8.50, false, null, 'El más alto de la jornada 2024');

  console.log('✅ Datos agregados 2024 cargados (o ya existían): Senadurías, Dip. Federal, Dip. Local, Ayuntamientos');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

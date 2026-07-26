// Genera la base de casillas oficiales estimadas — una fila por
// cada casilla que debería existir según la lista nominal real de
// cada sección, aplicando la regla del INE (máximo ~750 electores
// por casilla básica; el resto se reparte en "contiguas").
//
// Seguro de correr más de una vez: si una sección YA tiene casillas
// oficiales generadas, la salta — no duplica.
//
// Cómo correrlo: node generar-casillas-oficiales.js

import { query } from './src/db/pool.js';

const ELECTORES_POR_CASILLA = 750;

async function main() {
  const secciones = await query('SELECT id, numero, lista_nominal FROM secciones WHERE estado_id=29');
  let generadas = 0, saltadas = 0;

  for (const s of secciones.rows) {
    const yaExiste = await query('SELECT 1 FROM casillas_oficiales WHERE seccion_id=$1 LIMIT 1', [s.id]);
    if (yaExiste.rows.length > 0) { saltadas++; continue; }

    const listaNominal = s.lista_nominal || 0;
    const numCasillas = Math.max(1, Math.ceil(listaNominal / ELECTORES_POR_CASILLA));

    for (let i = 0; i < numCasillas; i++) {
      const tipo = i === 0 ? 'basica' : `contigua_${i}`;
      const electoresEstimados = i === numCasillas - 1
        ? listaNominal - (ELECTORES_POR_CASILLA * (numCasillas - 1))
        : ELECTORES_POR_CASILLA;
      await query(
        `INSERT INTO casillas_oficiales (seccion_id, tipo, electores_estimados) VALUES ($1,$2,$3)`,
        [s.id, tipo, electoresEstimados]
      );
      generadas++;
    }
  }

  console.log(`✅ ${generadas} casillas oficiales generadas · ${saltadas} secciones ya tenían datos y se saltaron`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

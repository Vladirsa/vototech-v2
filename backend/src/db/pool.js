import pg from 'pg';
const { Pool } = pg;

// El pool de conexiones es clave para escalar: en vez de abrir/cerrar
// una conexión nueva por cada petición (como hacía PHP), se reutiliza
// un grupo de conexiones ya abiertas — esto es una de las razones
// principales por las que este stack aguanta mucha más carga simultánea.
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vototech_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'votodev123',
  max: 20,                      // máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

/**
 * Ejecuta una consulta. SIEMPRE usar parámetros ($1, $2...) nunca
 * concatenar strings — esto es lo que previene inyección SQL.
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duracion = Date.now() - start;
  if (duracion > 200) {
    console.warn(`⚠️  Consulta lenta (${duracion}ms):`, text.slice(0, 100));
  }
  return res;
}

export default pool;

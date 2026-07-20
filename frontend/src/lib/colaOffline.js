import { openDB } from 'idb';
import api from './api';

// Cola de respaldo para cuando NO hay señal — el caso real que
// resuelve esto: un promotor en una comunidad sin cobertura reporta
// una incidencia, o un representante captura el resultado de su
// casilla, y el POST falla por falta de red (no por un error del
// servidor). En vez de perder esa captura, se guarda localmente en
// el celular y se reintenta sola en cuanto regresa la señal.
const NOMBRE_DB = 'vototech_offline';
const TIENDA = 'cola_pendiente';

async function abrirDB() {
  return openDB(NOMBRE_DB, 1, {
    upgrade(db) {
      const tienda = db.createObjectStore(TIENDA, { keyPath: 'id', autoIncrement: true });
      tienda.createIndex('tipo', 'tipo');
    },
  });
}

/** Guarda una petición que falló por falta de red, para reintentarla después. */
export async function guardarEnColaOffline(tipo, endpoint, payload) {
  const db = await abrirDB();
  await db.add(TIENDA, { tipo, endpoint, payload, creado_en: new Date().toISOString(), intentos: 0 });
}

export async function contarPendientesOffline() {
  const db = await abrirDB();
  return db.count(TIENDA);
}

export async function obtenerPendientesOffline() {
  const db = await abrirDB();
  return db.getAll(TIENDA);
}

/**
 * Intenta enviar todo lo que está en la cola — se llama sola cuando
 * el navegador detecta que regresó la conexión, y también cada vez
 * que se abre la app (por si se reconectó mientras estaba cerrada).
 * Cada intento exitoso se borra de la cola; los que fallan se quedan
 * para el siguiente intento, sin perder nada.
 */
export async function sincronizarColaOffline() {
  const db = await abrirDB();
  const pendientes = await db.getAll(TIENDA);
  let exitosos = 0;

  for (const item of pendientes) {
    try {
      await api.post(item.endpoint, item.payload);
      await db.delete(TIENDA, item.id);
      exitosos++;
    } catch (e) {
      // Si el error es de RED (sigue sin señal), se queda en la cola.
      // Si el error es del SERVIDOR (ej. datos inválidos), también se
      // queda — mejor que la persona lo vea y decida, que perderlo
      // silenciosamente.
      const item2 = await db.get(TIENDA, item.id);
      if (item2) await db.put(TIENDA, { ...item2, intentos: item2.intentos + 1 });
    }
  }
  return { total: pendientes.length, exitosos };
}

// Reintenta sola en cuanto el navegador detecta que hay conexión de nuevo.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sincronizarColaOffline(); });
}

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
export async function guardarEnColaOffline(tipo, endpoint, payload, metodo = 'post') {
  const db = await abrirDB();
  await db.add(TIENDA, { tipo, endpoint, payload, metodo, creado_en: new Date().toISOString(), intentos: 0 });
}

export async function contarPendientesOffline() {
  const db = await abrirDB();
  return (await db.getAll(TIENDA)).filter((x) => !x.rechazado).length;
}

/** Capturas que el servidor RECHAZÓ (ej. casilla que no es tuya) — se muestran para que no se pierdan en silencio. */
export async function obtenerRechazadosOffline() {
  const db = await abrirDB();
  return (await db.getAll(TIENDA)).filter((x) => x.rechazado);
}

export async function descartarOffline(id) {
  const db = await abrirDB();
  await db.delete(TIENDA, id);
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
    if (item.rechazado) continue; // ya lo rechazó el servidor: no se reintenta
    try {
      // 🆕 Ahora respeta el método real (POST o PATCH) — antes
      // siempre mandaba POST sin importar cuál necesitaba la
      // petición original, lo que hubiera hecho fallar cualquier
      // cosa guardada como PATCH (como marcar "ya votó").
      const metodo = item.metodo || 'post';
      await api[metodo](item.endpoint, metodo === 'patch' && Object.keys(item.payload || {}).length === 0 ? undefined : item.payload);
      await db.delete(TIENDA, item.id);
      exitosos++;
    } catch (e) {
      // Si el error es de RED (sigue sin señal), se queda en la cola.
      // Si el error es del SERVIDOR (ej. datos inválidos), también se
      // queda — mejor que la persona lo vea y decida, que perderlo
      // silenciosamente.
      const item2 = await db.get(TIENDA, item.id);
      const estado = e?.response?.status;
      // 🆕 Si el servidor lo RECHAZÓ por una razón que no se arregla
      // reintentando (datos inválidos, sin permiso, no existe), se marca
      // como rechazado y se le muestra a la persona con el motivo, en
      // vez de reintentarlo para siempre sin que nadie se entere.
      const definitivo = estado >= 400 && estado < 500 && ![401, 408, 429].includes(estado);
      if (item2) {
        await db.put(TIENDA, {
          ...item2,
          intentos: item2.intentos + 1,
          ...(definitivo ? { rechazado: true, error: e?.response?.data?.error || `Error ${estado}` } : {}),
        });
      }
    }
  }
  return { total: pendientes.length, exitosos };
}

// Reintenta sola en cuanto el navegador detecta que hay conexión de nuevo.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sincronizarColaOffline(); });
}

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { renovarSesion } from './api';


/**
 * Conecta al servidor de WebSockets y se mantiene viva la sesión —
 * corregido un bug real: antes tomaba el token UNA sola vez al
 * conectar y nunca lo renovaba. Desde que el token de acceso dura
 * solo 30 minutos (por 2FA/refresh tokens), cualquier reconexión
 * después de ese tiempo (común en campo, con señal intermitente)
 * fallaba en silencio y el chat se quedaba muerto hasta recargar la
 * página a mano.
 *
 * La corrección: `auth` ahora es una FUNCIÓN, no un valor fijo —
 * Socket.io la vuelve a llamar en CADA intento de conexión
 * (incluidas las reconexiones automáticas), así que siempre manda
 * el token más reciente que haya en localStorage, nunca uno viejo.
 */
export function useSocket(eventos = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!localStorage.getItem('vototech_token')) return;

    const urlBackend = import.meta.env.VITE_API_URL || '/';
    const socket = io(urlBackend, {
      // Función, no valor — se re-evalúa en cada intento de conexión.
      auth: (cb) => cb({ token: localStorage.getItem('vototech_token') }),
      path: '/socket.io',
    });
    socketRef.current = socket;

    // Si el servidor rechaza la conexión por token vencido, se
    // intenta renovar ANTES del siguiente intento automático de
    // reconexión — así no se queda esperando indefinidamente con un
    // token que ya sabemos que no sirve.
    // Si el servidor rechaza la conexión (token vencido) o la corta
    // (el token caducó, o la cuenta se desactivó), se renueva la sesión
    // y se vuelve a conectar a mano: socket.io NO reintenta solo en esos
    // casos. Si la renovación falla, se queda desconectado (la próxima
    // petición normal manda a la persona al login).
    let intentos = 0;
    const reconectar = async () => {
      if (intentos >= 3) return;
      intentos++;
      // Si otra pestaña ya renovó, se usa el token que dejó guardado.
      const token = (await renovarSesion()) || localStorage.getItem('vototech_token');
      if (token) setTimeout(() => socket.connect(), 500 * intentos);
    };
    socket.on('connect', () => { intentos = 0; });
    socket.on('connect_error', (err) => {
      if (err.message === 'Token inválido' || err.message?.includes('jwt expired')) reconectar();
    });
    socket.on('disconnect', (motivo) => {
      if (motivo === 'io server disconnect') reconectar();
    });

    Object.entries(eventos).forEach(([evento, manejador]) => {
      socket.on(evento, manejador);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socketRef;
}

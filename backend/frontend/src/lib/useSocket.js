import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

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
    socket.on('connect_error', async (err) => {
      if (err.message === 'Token inválido' || err.message?.includes('jwt expired')) {
        const refreshToken = localStorage.getItem('vototech_refresh_token');
        if (!refreshToken) return;
        try {
          const { data } = await axios.post(`${baseURL}/auth/refrescar`, { refresh_token: refreshToken });
          localStorage.setItem('vototech_token', data.token);
          localStorage.setItem('vototech_refresh_token', data.refresh_token);
          // El siguiente intento automático de reconexión de
          // socket.io ya recogerá este token nuevo solo, gracias a
          // que `auth` es función y no un valor congelado.
        } catch (e) {
          // El refresh token también expiró — nada más que hacer
          // aquí, el interceptor de axios ya se encarga de mandar a
          // la persona al login en su próxima petición HTTP normal.
        }
      }
    });

    Object.entries(eventos).forEach(([evento, manejador]) => {
      socket.on(evento, manejador);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socketRef;
}

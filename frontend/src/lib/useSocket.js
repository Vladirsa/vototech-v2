import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

/**
 * Conecta una sola vez al servidor de WebSockets con el token de sesión,
 * y permite suscribirse a eventos específicos. Se desconecta solo al
 * desmontar el componente — sin fugas de memoria ni conexiones huérfanas.
 */
export function useSocket(eventos = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('vototech_token');
    if (!token) return;

    const socket = io('/', { auth: { token }, path: '/socket.io' });
    socketRef.current = socket;

    Object.entries(eventos).forEach(([evento, manejador]) => {
      socket.on(evento, manejador);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socketRef;
}

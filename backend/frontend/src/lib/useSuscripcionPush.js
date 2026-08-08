import { useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from './authStore';

function base64UrlABinario(base64Url) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const cadena = atob(base64);
  const salida = new Uint8Array(cadena.length);
  for (let i = 0; i < cadena.length; i++) salida[i] = cadena.charCodeAt(i);
  return salida;
}

/**
 * Pide permiso de notificaciones y suscribe el dispositivo a push
 * REAL (funciona con la app cerrada) — se activa solo una vez que
 * hay sesión iniciada, y no molesta si el navegador no lo soporta o
 * si la persona ya dijo que no antes.
 */
export function useSuscripcionPush() {
  const usuario = useAuth((s) => s.usuario);

  useEffect(() => {
    if (!usuario) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const suscribir = async () => {
      try {
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
          const resultado = await Notification.requestPermission();
          if (resultado !== 'granted') return;
        }

        const registro = await navigator.serviceWorker.ready;
        let suscripcion = await registro.pushManager.getSubscription();

        if (!suscripcion) {
          const { data } = await api.get('/push/vapid-public-key');
          if (!data.publicKey) return;
          suscripcion = await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlABinario(data.publicKey),
          });
        }

        const json = suscripcion.toJSON();
        await api.post('/push/suscribir', { endpoint: json.endpoint, keys: json.keys });
      } catch (e) {
        console.error('No se pudo activar notificaciones push:', e);
      }
    };

    suscribir();
  }, [usuario]);
}

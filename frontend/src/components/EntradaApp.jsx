import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { renovarSesion } from '../lib/api';
import { useAuth } from '../lib/authStore';

/**
 * 🆕 PUERTA DE ENTRADA DE LA APP INSTALADA (/app)
 *
 * Cuando alguien instala VotoTech en su celular ("Agregar a pantalla de
 * inicio") y la abre, llega aquí. Si ya había entrado antes y su sesión
 * sigue viva, pasa DIRECTO a su pantalla (el promotor a "Mi avance",
 * los demás al mapa) sin volver a escribir correo ni contraseña.
 * Solo si nunca entró, cerró sesión, o su sesión ya no es válida
 * (ej. lo desactivaron), se le muestra el login.
 */
export function pantallaDeInicio(usuario) {
  return usuario?.rol === 'promotor' ? '/mi-avance' : '/mapa';
}

function usuarioGuardado() {
  try { return JSON.parse(localStorage.getItem('vototech_usuario') || 'null'); } catch { return null; }
}

/** ¿Hay una sesión guardada en este aparato? (con datos de la persona) */
export function haySesionGuardada() {
  return !!usuarioGuardado()
    && !!(localStorage.getItem('vototech_token') || localStorage.getItem('vototech_refresh_token'));
}

function borrarSesionLocal() {
  ['vototech_token', 'vototech_refresh_token', 'vototech_usuario'].forEach((k) => localStorage.removeItem(k));
}

export default function EntradaApp() {
  const [destino, setDestino] = useState(null);

  useEffect(() => {
    const usuario = usuarioGuardado();
    if (!usuario) { setDestino('/login'); return; }
    if (localStorage.getItem('vototech_token')) {
      // Asegura que el estado de la app tenga el token más reciente.
      useAuth.setState({ token: localStorage.getItem('vototech_token'), refreshToken: localStorage.getItem('vototech_refresh_token'), usuario });
      setDestino(pantallaDeInicio(usuario));
      return;
    }
    if (localStorage.getItem('vototech_refresh_token')) {
      renovarSesion().then((token) => {
        if (token) {
          useAuth.setState({ token, refreshToken: localStorage.getItem('vototech_refresh_token'), usuario });
          setDestino(pantallaDeInicio(usuario));
        } else {
          borrarSesionLocal(); // la sesión ya no sirve: se pide entrar de nuevo
          setDestino('/login');
        }
      });
      return;
    }
    borrarSesionLocal();
    setDestino('/login');
  }, []);

  if (!destino) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">🗳️ Entrando a VotoTech...</div>;
  }
  return <Navigate to={destino} replace />;
}

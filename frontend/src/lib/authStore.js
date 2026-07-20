import { create } from 'zustand';

// Estado global de sesión — reemplaza el localStorage manual que usábamos
// en la v1 (vt_session_data), pero con la ventaja de que React re-renderiza
// automáticamente cualquier componente que dependa de esto cuando cambia.
export const useAuth = create((set, get) => ({
  token: localStorage.getItem('vototech_token') || null,
  refreshToken: localStorage.getItem('vototech_refresh_token') || null,
  usuario: JSON.parse(localStorage.getItem('vototech_usuario') || 'null'),
  subdominio: localStorage.getItem('vototech_subdominio') || null,

  iniciarSesion: (token, usuario, subdominio, refreshToken) => {
    localStorage.setItem('vototech_token', token);
    localStorage.setItem('vototech_usuario', JSON.stringify(usuario));
    localStorage.setItem('vototech_subdominio', subdominio);
    if (refreshToken) localStorage.setItem('vototech_refresh_token', refreshToken);
    set({ token, usuario, subdominio, refreshToken });
  },

  // Se usa después de renovar la sesión automáticamente — solo
  // actualiza los tokens, sin tocar usuario/subdominio.
  actualizarTokens: (token, refreshToken) => {
    localStorage.setItem('vototech_token', token);
    localStorage.setItem('vototech_refresh_token', refreshToken);
    set({ token, refreshToken });
  },

  cerrarSesion: () => {
    // Avisa al servidor para revocar el refresh token — best effort,
    // no bloquea el cierre de sesión local si falla la red.
    const refreshToken = get().refreshToken;
    if (refreshToken) {
      const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
      fetch(`${baseURL}/auth/cerrar-sesion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem('vototech_token');
    localStorage.removeItem('vototech_refresh_token');
    localStorage.removeItem('vototech_usuario');
    localStorage.removeItem('vototech_subdominio');
    set({ token: null, refreshToken: null, usuario: null, subdominio: null });
  },

  estaAutenticado: () => !!localStorage.getItem('vototech_token'),
}));

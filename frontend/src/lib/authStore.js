import { create } from 'zustand';

// Estado global de sesión — reemplaza el localStorage manual que usábamos
// en la v1 (vt_session_data), pero con la ventaja de que React re-renderiza
// automáticamente cualquier componente que dependa de esto cuando cambia.
export const useAuth = create((set) => ({
  token: localStorage.getItem('vototech_token') || null,
  usuario: JSON.parse(localStorage.getItem('vototech_usuario') || 'null'),
  subdominio: localStorage.getItem('vototech_subdominio') || null,

  iniciarSesion: (token, usuario, subdominio) => {
    localStorage.setItem('vototech_token', token);
    localStorage.setItem('vototech_usuario', JSON.stringify(usuario));
    localStorage.setItem('vototech_subdominio', subdominio);
    set({ token, usuario, subdominio });
  },

  cerrarSesion: () => {
    localStorage.removeItem('vototech_token');
    localStorage.removeItem('vototech_usuario');
    localStorage.removeItem('vototech_subdominio');
    set({ token: null, usuario: null, subdominio: null });
  },

  estaAutenticado: () => !!localStorage.getItem('vototech_token'),
}));

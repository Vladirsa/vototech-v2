import axios from 'axios';

// En desarrollo local usa el proxy de Vite (/api -> localhost:4000).
// En producción (Vercel), usa la URL real del backend en Render,
// configurada como variable de entorno VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
const api = axios.create({ baseURL });

// Interceptor: agrega el token JWT automáticamente a CADA petición,
// sin tener que acordarnos de hacerlo manualmente en cada componente
// (esto es justo el tipo de bug de "se me olvidó mandar el token" que
// nos costó tantas horas de depuración en la v1).
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vototech_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el servidor responde 401 (token de acceso vencido — dura solo
// 30 min a propósito), intentamos renovarlo UNA vez con el refresh
// token antes de mandar a la persona al login. Así la sesión se
// siente continua aunque el token de acceso individual sea corto.
let renovando = null; // evita que 10 peticiones simultáneas disparen 10 renovaciones a la vez

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const peticionOriginal = err.config;
    const esErrorDeSesion = err.response?.status === 401 && !peticionOriginal?._reintentada;

    if (esErrorDeSesion) {
      const refreshToken = localStorage.getItem('vototech_refresh_token');
      if (refreshToken) {
        peticionOriginal._reintentada = true;
        try {
          if (!renovando) {
            renovando = axios.post(`${baseURL}/auth/refrescar`, { refresh_token: refreshToken });
          }
          const { data } = await renovando;
          renovando = null;
          localStorage.setItem('vototech_token', data.token);
          localStorage.setItem('vototech_refresh_token', data.refresh_token);
          peticionOriginal.headers.Authorization = `Bearer ${data.token}`;
          return api(peticionOriginal); // reintenta la petición original, ya con token nuevo
        } catch (e) {
          renovando = null;
          // El refresh token también falló (expiró a los 30 días, o
          // fue revocado) — ahí sí ya no hay forma de continuar sin
          // que la persona vuelva a poner su contraseña.
        }
      }
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

/**
 * Descarga un archivo (Excel) autenticado — no se puede usar un link
 * directo porque el navegador no mandaría el token de sesión.
 */
export async function descargarArchivo(ruta, nombreArchivo) {
  const respuesta = await api.get(ruta, { responseType: 'blob' });
  const url = window.URL.createObjectURL(respuesta.data);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.URL.revokeObjectURL(url);
}

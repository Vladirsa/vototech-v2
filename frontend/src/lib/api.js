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

// Si el servidor responde 401 (token vencido/inválido), mandamos al login
// automáticamente en vez de dejar la pantalla en un estado roto silencioso.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
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

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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

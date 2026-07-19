import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

// El subdominio se detecta automáticamente de la URL en producción
// (andrea.vototech.mx -> "andrea"). En desarrollo local, usamos uno
// de prueba fijo para poder trabajar sin tener subdominios reales.
function detectarSubdominio() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return null;
  // Solo detectar automático cuando es un dominio propio real
  // (candidato.vototech.mx) — en Vercel (vototech-v2.vercel.app) o
  // cualquier otro dominio temporal, se pide el subdominio a mano.
  if (host.endsWith('.vototech.mx')) {
    const partes = host.split('.');
    return partes.length > 2 ? partes[0] : null;
  }
  return null;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();
  const iniciarSesion = useAuth((s) => s.iniciarSesion);
  const [subdominio, setSubdominio] = useState(detectarSubdominio() || localStorage.getItem('vototech_ultimo_subdominio') || '');
  const subdominioAutomatico = !!detectarSubdominio();

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { subdominio, email, password });
      if (data.ok) {
        localStorage.setItem('vototech_ultimo_subdominio', subdominio);
        iniciarSesion(data.token, data.usuario, subdominio);
        navigate('/mapa');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    }
    setCargando(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🗳️</div>
          <h1 className="text-2xl font-black text-white">VotoTech</h1>
          <p className="text-sm text-indigo-400 mt-1">Sistema de Gestión Electoral</p>
          {subdominioAutomatico && (
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300">
              📍 {subdominio}.vototech.mx
            </div>
          )}
        </div>

        <form onSubmit={manejarSubmit} className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">
              ⚠️ {error}
            </div>
          )}

          {!subdominioAutomatico && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Subdominio de tu campaña</label>
              <input
                required autoFocus={!subdominio} disabled={cargando} value={subdominio} onChange={(e) => setSubdominio(e.target.value.toLowerCase().trim())}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                placeholder="ej: demo"
              />
              <p className="text-[10px] text-slate-500 mt-1">El identificador que elegiste al registrar tu campaña</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Correo electrónico</label>
            <input
              type="email" required autoFocus={!!subdominio} disabled={cargando} value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              placeholder="tucorreo@ejemplo.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={verPassword ? 'text' : 'password'} required disabled={cargando} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setVerPassword((v) => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm">
                {verPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={cargando}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {cargando ? '⏳ Entrando...' : '⚡ Iniciar sesión'}
          </button>

          <div className="text-center pt-2 space-y-1.5">
            <div>
              <Link to="/registro-invitacion" className="text-xs text-indigo-400 hover:text-indigo-300">
                ¿Tienes un código de invitación de promotor? →
              </Link>
            </div>
            <div>
              <Link to="/registro" className="text-xs text-slate-500 hover:text-slate-300">
                ¿Primera vez? Registra tu campaña →
              </Link>
            </div>
          </div>
        </form>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          🔒 Conexión segura · Datos protegidos bajo LFPDPPP
        </p>
      </div>
    </div>
  );
}

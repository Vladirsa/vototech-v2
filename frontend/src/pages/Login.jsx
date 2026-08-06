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

  // Segundo paso — solo aparece si la cuenta tiene 2FA activo
  const [tokenPreAuth, setTokenPreAuth] = useState(null);
  const [codigo2FA, setCodigo2FA] = useState('');

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { subdominio, email, password });
      if (data.requiere_2fa) {
        localStorage.setItem('vototech_ultimo_subdominio', subdominio);
        setTokenPreAuth(data.token_pre_auth);
        setCargando(false);
        return;
      }
      if (data.ok) {
        localStorage.setItem('vototech_ultimo_subdominio', subdominio);
        iniciarSesion(data.token, data.usuario, subdominio, data.refresh_token);
        navigate(data.usuario?.rol === 'promotor' ? '/mi-avance' : '/mapa');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    }
    setCargando(false);
  };

  const verificarCodigo2FA = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/2fa/verificar-login', { token_pre_auth: tokenPreAuth, codigo: codigo2FA });
      if (data.ok) {
        iniciarSesion(data.token, data.usuario, subdominio, data.refresh_token);
        navigate('/mapa');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Código incorrecto');
    }
    setCargando(false);
  };

  if (tokenPreAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔐</div>
            <h1 className="text-lg font-black text-white">Verificación en dos pasos</h1>
            <p className="text-xs text-slate-500 mt-1">Ingresa el código de tu app autenticadora</p>
          </div>
          <form onSubmit={verificarCodigo2FA} className="space-y-4">
            {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2 text-center">{error}</div>}
            <input value={codigo2FA} onChange={(e) => setCodigo2FA(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" maxLength={6} autoFocus
              className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={cargando || codigo2FA.length !== 6}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
              {cargando ? 'Verificando...' : 'Verificar'}
            </button>
            <button type="button" onClick={() => { setTokenPreAuth(null); setCodigo2FA(''); setError(''); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300">← Volver</button>
          </form>
        </div>
      </div>
    );
  }

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
              <Link to="/recuperar-password" className="text-xs text-slate-500 hover:text-slate-300">
                ¿Olvidaste tu contraseña? →
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
        <p className="text-center text-[10px] text-slate-600 mt-1">
          <a href="/terminos" className="text-slate-500 hover:text-slate-300 underline">Términos y Privacidad</a>
          {' · '}
          <a href="/postura-legal" className="text-slate-500 hover:text-slate-300 underline">Postura Legal</a>
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

export default function RegistroInvitacion() {
  const [form, setForm] = useState({ codigo: '', nombre: '', email: '', password: '', telefono: '' });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();
  const iniciarSesion = useAuth((s) => s.iniciarSesion);

  const actualizar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/registrar-con-codigo', form);
      if (data.ok) {
        iniciarSesion(data.token, data.usuario, '', data.refresh_token);
        navigate('/mapa');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrarte');
    }
    setCargando(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🤝</div>
          <h1 className="text-xl font-black text-white">Únete al equipo</h1>
          <p className="text-xs text-emerald-400 mt-1">Registro de promotor con código de invitación</p>
        </div>

        <form onSubmit={manejarSubmit} className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">⚠️ {error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código de invitación</label>
            <input required value={form.codigo} onChange={(e) => actualizar('codigo', e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-emerald-700/50 text-white text-sm text-center tracking-widest font-mono focus:outline-none focus:border-emerald-500"
              placeholder="XXXX-XXXX" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Tu nombre completo</label>
            <input required value={form.nombre} onChange={(e) => actualizar('nombre', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Teléfono</label>
            <input value={form.telefono} onChange={(e) => actualizar('telefono', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Correo electrónico</label>
            <input type="email" required value={form.email} onChange={(e) => actualizar('email', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Crea una contraseña</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => actualizar('password', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <button type="submit" disabled={cargando}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm disabled:opacity-50">
            {cargando ? '⏳ Registrando...' : '✅ Unirme al equipo'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          ¿Ya tienes cuenta? <Link to="/login" className="text-emerald-400">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}

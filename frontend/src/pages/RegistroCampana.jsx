import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

const TIPOS_ELECCION = [
  { id: 'ayuntamiento', label: '🏛️ Presidente Municipal', desc: 'Un municipio completo' },
  { id: 'pres_comunidad', label: '🏠 Presidente de Comunidad', desc: 'Una localidad/sección' },
  { id: 'dip_local', label: '⚖️ Diputado Local', desc: 'Un distrito local' },
  { id: 'dip_federal', label: '🏢 Diputado Federal', desc: 'Un distrito federal' },
  { id: 'gobernador', label: '🎖️ Gobernador', desc: 'Todo el estado' },
];

export default function RegistroCampana() {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({
    nombre_candidato: '', email: '', password: '', partido: 'morena',
    tipo_eleccion: '', estado_id: 29, subdominio: '', codigo_acceso: '',
  });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(null);
  const navigate = useNavigate();

  const actualizar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const generarSubdominioSugerido = (nombre) => {
    return nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .replace(/[^a-z0-9\s]/g, '')
      .trim().split(/\s+/).slice(0, 2).join('');
  };

  const enviar = async () => {
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/registrar-campana', form);
      if (data.ok) setExito(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear la campaña');
    }
    setCargando(false);
  };

  if (exito) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-amber-950 to-slate-950 p-4">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-black text-white mb-2">Registro recibido</h1>
          <p className="text-slate-400 text-sm mb-6">{exito.mensaje}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold text-sm"
          >
            Ir a Iniciar Sesión →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🗳️</div>
          <h1 className="text-xl font-black text-white">Registra tu Campaña</h1>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1.5 w-10 rounded-full transition ${n <= paso ? 'bg-indigo-500' : 'bg-slate-800'}`} />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2 mb-4">
              ⚠️ {error}
            </div>
          )}

          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nombre completo del candidato</label>
                <input
                  value={form.nombre_candidato}
                  onChange={(e) => {
                    actualizar('nombre_candidato', e.target.value);
                    if (!form.subdominio) actualizar('subdominio', generarSubdominioSugerido(e.target.value));
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ej: Andrea Arenas Pozos"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Correo (será tu usuario)</label>
                <input type="email" value={form.email} onChange={(e) => actualizar('email', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Contraseña (mínimo 8 caracteres)</label>
                <input type="password" value={form.password} onChange={(e) => actualizar('password', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Código de acceso</label>
                <input value={form.codigo_acceso} onChange={(e) => actualizar('codigo_acceso', e.target.value.toUpperCase())}
                  placeholder="ACC-XXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-amber-700/50 text-white text-sm font-mono focus:outline-none focus:border-amber-500" />
                <p className="text-[10px] text-slate-500 mt-1">¿No tienes uno? Contacta a VotoTech para obtenerlo.</p>
              </div>
              <button onClick={() => setPaso(2)} disabled={!form.nombre_candidato || !form.email || form.password.length < 8 || !form.codigo_acceso}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
                Siguiente →
              </button>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1">¿Para qué cargo compites?</label>
              <div className="space-y-2">
                {TIPOS_ELECCION.map((t) => (
                  <button key={t.id} onClick={() => actualizar('tipo_eleccion', t.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                      form.tipo_eleccion === t.id ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-800/50 border-slate-700'
                    }`}>
                    <div className="text-sm font-bold text-white">{t.label}</div>
                    <div className="text-[10px] text-slate-400">{t.desc}</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setPaso(1)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm">← Atrás</button>
                <button onClick={() => setPaso(3)} disabled={!form.tipo_eleccion}
                  className="flex-[2] py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">Siguiente →</button>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Tu subdominio (dirección web)</label>
                <div className="flex items-center rounded-xl bg-slate-800/80 border border-slate-700 overflow-hidden">
                  <input value={form.subdominio}
                    onChange={(e) => actualizar('subdominio', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1 px-4 py-2.5 bg-transparent text-white text-sm focus:outline-none" placeholder="andrea" />
                  <span className="px-3 text-xs text-slate-500 font-mono">.vototech.mx</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">Podrás conectar tu propio dominio después</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setPaso(2)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm">← Atrás</button>
                <button onClick={enviar} disabled={cargando || form.subdominio.length < 3}
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm disabled:opacity-40">
                  {cargando ? '⏳ Creando...' : '🚀 Crear mi campaña'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          ¿Ya tienes cuenta? <Link to="/login" className="text-indigo-400">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}

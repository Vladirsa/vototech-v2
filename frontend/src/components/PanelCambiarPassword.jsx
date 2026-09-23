import { useState } from 'react';
import api from '../lib/api';

/**
 * 🔒 Cambiar mi contraseña — pide la actual (así, si alguien toma tu
 * celular con la sesión abierta, no puede cambiarla). Al cambiarla se
 * cierran tus sesiones en los demás aparatos.
 * Importante para quien fue dado de alta por su coordinador con una
 * contraseña que el coordinador eligió.
 */
export default function PanelCambiarPassword() {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    setError(''); setMensaje('');
    if (nueva !== confirmacion) { setError('La contraseña nueva y su confirmación no coinciden'); return; }
    setCargando(true);
    try {
      const { data } = await api.post('/auth/cambiar-password', { password_actual: actual, nueva_password: nueva });
      if (data.token) localStorage.setItem('vototech_token', data.token);
      if (data.refresh_token) localStorage.setItem('vototech_refresh_token', data.refresh_token);
      setMensaje('✅ Contraseña cambiada. Se cerró tu sesión en los demás aparatos.');
      setActual(''); setNueva(''); setConfirmacion('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cambiar la contraseña');
    }
    setCargando(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between text-left">
        <span className="text-xs font-bold text-slate-400 uppercase">🔑 Cambiar mi contraseña</span>
        <span className="text-[10px] text-slate-500">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="space-y-2 mt-3">
          {error && <div className="bg-red-500/10 text-red-400 text-[11px] rounded-lg px-3 py-2">{error}</div>}
          {mensaje && <div className="bg-emerald-500/10 text-emerald-400 text-[11px] rounded-lg px-3 py-2">{mensaje}</div>}
          <input type="password" placeholder="Contraseña actual" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input type="password" placeholder="Contraseña nueva (mínimo 8)" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input type="password" placeholder="Repite la contraseña nueva" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <button onClick={guardar} disabled={cargando || !actual || nueva.length < 8 || !confirmacion}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            {cargando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>
      )}
    </div>
  );
}

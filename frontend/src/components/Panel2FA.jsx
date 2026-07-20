import { useState } from 'react';
import api from '../lib/api';

/**
 * Recomendado, no forzado — para candidato/jefe_campana/coord_general.
 * Forzarlo genera fricción de soporte ("se me perdió el código");
 * recomendarlo con una explicación clara es el punto medio correcto.
 */
export default function Panel2FA() {
  const [paso, setPaso] = useState('inicio'); // inicio | qr | confirmar
  const [qr, setQr] = useState(null);
  const [secretoManual, setSecretoManual] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const iniciarActivacion = async () => {
    setCargando(true); setError('');
    try {
      const { data } = await api.post('/auth/2fa/generar-secreto');
      setQr(data.data.qr);
      setSecretoManual(data.data.secreto_manual);
      setPaso('qr');
    } catch (e) { setError('No se pudo generar el código'); }
    setCargando(false);
  };

  const confirmarActivacion = async () => {
    setCargando(true); setError('');
    try {
      await api.post('/auth/2fa/activar', { codigo });
      setMensaje('✅ Verificación en dos pasos activada correctamente');
      setPaso('activado');
    } catch (e) { setError(e.response?.data?.error || 'Código incorrecto'); }
    setCargando(false);
  };

  const desactivar = async () => {
    if (!confirm('¿Desactivar la verificación en dos pasos?')) return;
    setCargando(true); setError('');
    try {
      await api.post('/auth/2fa/desactivar', { password });
      setMensaje('Verificación en dos pasos desactivada');
      setPaso('inicio');
      setPassword('');
    } catch (e) { setError(e.response?.data?.error || 'Contraseña incorrecta'); }
    setCargando(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">🔐 Verificación en dos pasos</h3>
      <p className="text-[10px] text-slate-500 mb-3">
        Recomendado para tu rol — protege tu cuenta aunque alguien más adivine tu contraseña, con un código extra desde tu celular.
      </p>

      {error && <div className="bg-red-500/10 text-red-400 text-[10px] rounded-lg px-3 py-2 mb-2">{error}</div>}
      {mensaje && <div className="bg-emerald-500/10 text-emerald-400 text-[10px] rounded-lg px-3 py-2 mb-2">{mensaje}</div>}

      {paso === 'inicio' && (
        <div className="space-y-2">
          <button onClick={iniciarActivacion} disabled={cargando}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
            {cargando ? 'Generando...' : '+ Activar verificación en dos pasos'}
          </button>
          <details className="text-[10px] text-slate-500">
            <summary className="cursor-pointer">¿Ya la tienes activada y quieres desactivarla?</summary>
            <div className="mt-2 flex gap-2">
              <input type="password" placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-xs" />
              <button onClick={desactivar} disabled={cargando || !password} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-bold disabled:opacity-50">Desactivar</button>
            </div>
          </details>
        </div>
      )}

      {paso === 'qr' && (
        <div className="space-y-3">
          <p className="text-[10px] text-slate-400">1. Abre Google Authenticator, Authy, o cualquier app similar en tu celular</p>
          <p className="text-[10px] text-slate-400">2. Escanea este código:</p>
          <img src={qr} alt="Código QR" className="mx-auto w-40 h-40 rounded-lg bg-white p-2" />
          <p className="text-[9px] text-slate-600 text-center">¿No puedes escanear? Ingresa manualmente: <code className="text-slate-400">{secretoManual}</code></p>
          <p className="text-[10px] text-slate-400">3. Escribe el código de 6 dígitos que te muestra la app:</p>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" maxLength={6}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-lg text-center tracking-widest" />
          <button onClick={confirmarActivacion} disabled={cargando || codigo.length !== 6}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            {cargando ? 'Verificando...' : 'Confirmar y activar'}
          </button>
        </div>
      )}

      {paso === 'activado' && (
        <p className="text-[10px] text-emerald-400">La próxima vez que inicies sesión, te pediremos el código de tu app además de tu contraseña.</p>
      )}
    </div>
  );
}

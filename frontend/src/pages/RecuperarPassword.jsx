import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function RecuperarPassword() {
  const [paso, setPaso] = useState(1); // 1=pedir código, 2=verificar código, 3=nueva contraseña
  const [subdominio, setSubdominio] = useState(localStorage.getItem('vototech_ultimo_subdominio') || '');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tokenReset, setTokenReset] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const navigate = useNavigate();

  const pedirCodigo = async (e) => {
    e.preventDefault();
    setCargando(true); setError('');
    try {
      const { data } = await api.post('/auth/olvide-password', { subdominio, email });
      setMensaje(data.mensaje);
      setPaso(2);
    } catch (e) { setError('No se pudo procesar la solicitud, intenta de nuevo'); }
    setCargando(false);
  };

  const verificarCodigo = async (e) => {
    e.preventDefault();
    setCargando(true); setError('');
    try {
      const { data } = await api.post('/auth/verificar-codigo-recuperacion', { subdominio, email, codigo });
      setTokenReset(data.token_reset);
      setPaso(3);
    } catch (e) { setError(e.response?.data?.error || 'Código incorrecto o expirado'); }
    setCargando(false);
  };

  const cambiarPassword = async (e) => {
    e.preventDefault();
    setCargando(true); setError('');
    try {
      await api.post('/auth/restablecer-password', { token_reset: tokenReset, nueva_password: nuevaPassword });
      setMensaje('✅ Contraseña actualizada correctamente.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo cambiar la contraseña'); }
    setCargando(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📱</div>
          <h1 className="text-lg font-black text-white">Recuperar contraseña</h1>
          <p className="text-xs text-slate-500 mt-1">
            {paso === 1 && 'Te vamos a mandar un código de 6 dígitos por WhatsApp, al teléfono que ya tienes registrado en el sistema. En la siguiente pantalla (aquí mismo) lo escribes.'}
            {paso === 2 && 'Revisa WhatsApp — te llegó un mensaje con un código de 6 dígitos. Escríbelo aquí abajo (tienes unos minutos antes de que expire).'}
            {paso === 3 && 'El código fue correcto — ahora sí, elige tu contraseña nueva.'}
          </p>
        </div>

        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2 mb-3 text-center">{error}</div>}
        {mensaje && paso !== 1 && <div className="bg-emerald-500/10 text-emerald-400 text-xs rounded-lg px-3 py-2 mb-3 text-center">{mensaje}</div>}

        {paso === 1 && (
          <form onSubmit={pedirCodigo} className="space-y-3">
            <input value={subdominio} onChange={(e) => setSubdominio(e.target.value)} placeholder="Tu subdominio (ej. andrea2027)"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu correo"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={cargando || !subdominio || !email}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
              {cargando ? 'Enviando...' : 'Mandar código por WhatsApp'}
            </button>
            <p className="text-[10px] text-slate-600 text-center">¿No tienes tu teléfono a la mano, o no te llegó nada? Pídele a quien te dio de alta en el sistema (tu coordinador directo) que te restablezca el acceso desde Estructura.</p>
          </form>
        )}

        {paso === 2 && (
          <form onSubmit={verificarCodigo} className="space-y-3">
            <p className="text-[10px] text-slate-500 text-center -mt-1">Revisa bien tus chats — a veces WhatsApp Business llega junto con la publicidad o en "solicitudes de mensaje".</p>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} autoFocus
              className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={cargando || codigo.length !== 6}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
              {cargando ? 'Verificando...' : 'Verificar código'}
            </button>
            <button type="button" onClick={() => setPaso(1)} className="w-full text-[10px] text-slate-500 hover:text-slate-300">¿No te llegó? Volver a intentar</button>
          </form>
        )}

        {paso === 3 && (
          <form onSubmit={cambiarPassword} className="space-y-3">
            <input type="password" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} placeholder="Contraseña nueva (mínimo 8 caracteres)"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={cargando || nuevaPassword.length < 8}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">
              {cargando ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300 mt-4">← Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}

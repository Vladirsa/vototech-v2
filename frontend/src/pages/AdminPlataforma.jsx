import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

/**
 * Panel exclusivo del dueño de VotoTech — protegido con una clave
 * secreta (no es parte del sistema normal de usuarios/campañas).
 * Desde aquí se generan los códigos de acceso y se aprueban o
 * rechazan las campañas nuevas que se registran.
 */
export default function AdminPlataforma() {
  const [clave, setClave] = useState(sessionStorage.getItem('vt_admin_key') || '');
  const [autenticado, setAutenticado] = useState(false);
  const [error, setError] = useState('');
  const [campanas, setCampanas] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [notaCodigo, setNotaCodigo] = useState('');

  const headers = { 'x-admin-key': clave };

  const cargar = async () => {
    try {
      const [c, co] = await Promise.all([
        axios.get(`${API_URL}/admin/campanas`, { headers }),
        axios.get(`${API_URL}/admin/codigos-acceso`, { headers }),
      ]);
      setCampanas(c.data.data);
      setCodigos(co.data.data);
      setAutenticado(true);
      sessionStorage.setItem('vt_admin_key', clave);
      setError('');
    } catch (e) {
      setError('Clave incorrecta o error de conexión');
      setAutenticado(false);
    }
  };

  useEffect(() => { if (clave) cargar(); }, []);

  const generarCodigo = async () => {
    await axios.post(`${API_URL}/admin/codigos-acceso`, { nota: notaCodigo }, { headers });
    setNotaCodigo('');
    cargar();
  };

  const aprobar = async (id) => { await axios.patch(`${API_URL}/admin/campanas/${id}/aprobar`, {}, { headers }); cargar(); };
  const rechazar = async (id) => { await axios.patch(`${API_URL}/admin/campanas/${id}/rechazar`, {}, { headers }); cargar(); };

  const [creandoDemo, setCreandoDemo] = useState(false);
  const [mensajeDemo, setMensajeDemo] = useState('');

  const crearDemo = async () => {
    setCreandoDemo(true);
    setMensajeDemo('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/crear-demo`, {}, { headers });
      setMensajeDemo(`✅ Demo creada — Correo: ${data.data.email} · Contraseña: ${data.data.password}`);
      cargar();
    } catch (e) {
      setMensajeDemo('⚠️ Error al crear la demo. Intenta de nuevo.');
    }
    setCreandoDemo(false);
  };

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h1 className="text-lg font-black text-white">🔐 Panel VotoTech</h1>
          {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
          <input type="password" placeholder="Clave de administrador" value={clave} onChange={(e) => setClave(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <button onClick={cargar} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Entrar</button>
        </div>
      </div>
    );
  }

  const ESTADO_COLOR = { pendiente: 'text-amber-400 bg-amber-500/10', aprobada: 'text-emerald-400 bg-emerald-500/10', rechazada: 'text-red-400 bg-red-500/10' };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-black text-white">🔐 Panel de Administración VotoTech</h1>

        {/* Cuenta demo para presentaciones de venta */}
        <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-700/30 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-white">🎬 Cuenta Demo (para presentaciones)</h2>
          <p className="text-[10px] text-slate-400">Crea o reconstruye desde cero una campaña de ejemplo llena de datos — sin usar terminal.</p>
          <button onClick={crearDemo} disabled={creandoDemo}
            className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-bold disabled:opacity-50">
            {creandoDemo ? '⏳ Creando demo...' : '🎬 Crear / Reconstruir Demo'}
          </button>
          {mensajeDemo && <div className="text-xs text-purple-200 bg-slate-900/50 rounded-lg p-2">{mensajeDemo}</div>}
        </div>

        {/* Generar códigos de acceso */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-white">🎟️ Generar código de acceso</h2>
          <p className="text-[10px] text-slate-500">Sin uno de estos, nadie puede registrar una campaña nueva.</p>
          <div className="flex gap-2">
            <input placeholder="Nota (ej: Andrea - Apizaco)" value={notaCodigo} onChange={(e) => setNotaCodigo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button onClick={generarCodigo} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold">Generar</button>
          </div>
          <div className="space-y-1 pt-2">
            {codigos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="font-mono text-indigo-400">{c.codigo}</span>
                <span className="text-slate-500">{c.nota || '—'}</span>
                <span className={c.usado ? 'text-slate-600' : 'text-emerald-400'}>{c.usado ? '✅ Usado' : '🟢 Disponible'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Campañas pendientes de aprobar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-white">📋 Campañas registradas</h2>
          <div className="space-y-2">
            {campanas.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-sm font-bold text-white">{c.nombre_candidato}</div>
                  <div className="text-[10px] text-slate-500">{c.subdominio}.vototech.mx · {c.tipo_eleccion} · {c.total_usuarios} usuarios</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ESTADO_COLOR[c.estado_aprobacion]}`}>{c.estado_aprobacion}</span>
                  {c.estado_aprobacion === 'pendiente' && (
                    <>
                      <button onClick={() => aprobar(c.id)} className="text-[10px] font-bold text-emerald-400 px-2 py-1">✅ Aprobar</button>
                      <button onClick={() => rechazar(c.id)} className="text-[10px] font-bold text-red-400 px-2 py-1">✕ Rechazar</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

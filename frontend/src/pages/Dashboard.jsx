import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

const FASE_COLOR = {
  identificacion: 'from-blue-600 to-cyan-600',
  persuasion: 'from-amber-600 to-orange-600',
  cierre: 'from-orange-600 to-red-600',
  movilizacion: 'from-red-600 to-rose-600',
  dia_d: 'from-purple-600 to-pink-600',
  sin_fecha: 'from-slate-600 to-slate-700',
};

export default function Dashboard() {
  const usuario = useAuth((s) => s.usuario);
  const [hoy, setHoy] = useState(null);
  const [resumenPromos, setResumenPromos] = useState(null);
  const [prioridad, setPrioridad] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/priorizacion/hoy'),
      api.get('/promovidos/resumen'),
      api.get('/priorizacion'),
    ]).then(([hoyRes, promosRes, prioRes]) => {
      setHoy(hoyRes.data.data);
      setResumenPromos(promosRes.data.data);
      setPrioridad(prioRes.data);
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  if (cargando) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;
  }

  const colorFase = FASE_COLOR[hoy?.fase] || FASE_COLOR.sin_fecha;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Hola, {usuario?.nombre?.split(' ')[0] || 'Equipo'} 👋</h1>
            <p className="text-sm text-slate-500">Este es el estado real de tu campaña hoy</p>
          </div>
          <Link to="/mapa" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">🗺️ Ver mapa</Link>
        </div>

        {/* 🎯 QUÉ HACER HOY — la pieza estratégica más importante del dashboard */}
        <div className={`rounded-2xl p-6 bg-gradient-to-br ${colorFase} shadow-xl`}>
          <div className="flex items-start gap-4">
            <div className="text-4xl">{hoy?.icono}</div>
            <div className="flex-1">
              <div className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1">
                {hoy?.dias_restantes != null ? `${hoy.dias_restantes} días para la elección` : 'Qué hacer hoy'}
              </div>
              <p className="text-white font-semibold leading-relaxed">{hoy?.mensaje}</p>
            </div>
          </div>
        </div>

        {/* Resumen de promovidos por clasificación estratégica */}
        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Tu gente, clasificada</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900/60 border border-emerald-800/50 rounded-2xl p-4">
              <div className="text-2xl font-black text-emerald-400">{resumenPromos?.por_clasificacion?.base || 0}</div>
              <div className="text-xs text-slate-400 mt-1">✅ Base — asegúralos para el día D</div>
            </div>
            <div className="bg-slate-900/60 border border-amber-800/50 rounded-2xl p-4">
              <div className="text-2xl font-black text-amber-400">{resumenPromos?.por_clasificacion?.persuadible || 0}</div>
              <div className="text-xs text-slate-400 mt-1">🎯 Persuadibles — aquí rinde tu esfuerzo</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <div className="text-2xl font-black text-slate-500">{resumenPromos?.por_clasificacion?.adversario || 0}</div>
              <div className="text-xs text-slate-400 mt-1">⛔ Adversarios — no gastes aquí</div>
            </div>
          </div>
          {resumenPromos?.persuadibles_sin_seguimiento > 0 && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-amber-300">
                ⚠️ <strong>{resumenPromos.persuadibles_sin_seguimiento}</strong> persuadibles llevan más de 15 días sin contacto
              </span>
              <Link to="/promovidos?filtro=seguimiento" className="text-xs font-bold text-amber-400 underline">Ver lista →</Link>
            </div>
          )}
        </div>

        {/* Resumen del Motor de Priorización */}
        {prioridad && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide">Territorio</h2>
              <Link to="/priorizacion" className="text-xs font-bold text-indigo-400">Ver análisis completo →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['criticas', '🔴', 'Críticas', 'text-red-400'],
                ['recuperables', '🟠', 'Recuperables', 'text-orange-400'],
                ['disputa', '🟡', 'En disputa', 'text-yellow-400'],
                ['consolidar', '🟢', 'A consolidar', 'text-emerald-400'],
                ['perdidas', '⚫', 'Sin esperanza', 'text-slate-500'],
              ].map(([key, ico, label, color]) => (
                <div key={key} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{ico}</div>
                  <div className={`text-xl font-black ${color}`}>{prioridad.resumen[key]}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Reportes from './Reportes';
import Priorizacion from './Priorizacion';
import api from '../lib/api';

/**
 * 🆕 "Inteligencia Electoral" — Reportes y Priorización combinados en pestañas.
 *
 * 🆕 NUEVO — el bloque de alertas inteligentes ("🧠 Inteligencia
 * Electoral") que antes vivía en el Dashboard se movió aquí, arriba
 * de las pestañas — tiene más sentido que las alertas de
 * inteligencia electoral vivan DENTRO del módulo de Inteligencia
 * Electoral, no mezcladas con el resumen operativo del día a día del
 * Dashboard.
 */
export default function InteligenciaElectoral() {
  const [tab, setTab] = useState('reportes');
  const [alertas, setAlertas] = useState([]);
  const TABS = [
    { id: 'reportes', ic: '📊', label: 'Reportes' },
    { id: 'priorizacion', ic: '🎯', label: 'Priorización' },
  ];

  useEffect(() => {
    api.get('/inteligencia/alertas').then((r) => setAlertas(r.data.data)).catch(() => {});
  }, []);

  const COLOR = { alta: 'border-red-500/40 bg-red-500/5', media: 'border-amber-500/40 bg-amber-500/5', info: 'border-emerald-500/40 bg-emerald-500/5' };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🧠 Inteligencia Electoral</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        {alertas.length > 0 && (
          <div className="bg-gradient-to-br from-slate-900 to-purple-950/40 border border-purple-800/30 rounded-2xl p-4">
            <h2 className="text-xs font-bold text-purple-300 uppercase mb-3 flex items-center gap-1.5">🔔 Alertas</h2>
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <Link key={i} to={a.enlace} className={`block rounded-xl border p-3 hover:brightness-125 transition ${COLOR[a.severidad]}`}>
                  <div className="flex gap-2 items-start">
                    <span className="text-lg flex-shrink-0">{a.icono}</span>
                    <p className="text-xs text-slate-200 leading-relaxed">{a.mensaje}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-slate-800 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}>
              {t.ic} {t.label}
            </button>
          ))}
        </div>

        <div>
          {tab === 'reportes' && <Reportes />}
          {tab === 'priorizacion' && <Priorizacion />}
        </div>
      </div>
    </div>
  );
}

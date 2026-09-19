import { useState } from 'react';
import { Link } from 'react-router-dom';
import Promovidos from './Promovidos';
import Agenda from './Agenda';
import Logistica from './Logistica';
import Incidencias from './Incidencias';
import BitacoraDiaria from './BitacoraDiaria';

/** 🆕 "Movilización y Operación" — 5 módulos combinados en pestañas.
 * (Bitácora Diaria se agregó como Etapa 1 del rediseño de campo.) */
export default function MovilizacionOperacion() {
  const [tab, setTab] = useState('promovidos');
  const TABS = [
    { id: 'promovidos', ic: '🤝', label: 'Promovidos' },
    { id: 'agenda', ic: '📅', label: 'Agenda' },
    { id: 'logistica', ic: '🚚', label: 'Logística' },
    { id: 'incidencias', ic: '🚨', label: 'Incidencias' },
    { id: 'bitacora', ic: '📔', label: 'Bitácora' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🚶 Movilización y Operación</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <div className="flex gap-2 border-b border-slate-800 pb-2 flex-wrap">
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
          {tab === 'promovidos' && <Promovidos />}
          {tab === 'agenda' && <Agenda />}
          {tab === 'logistica' && <Logistica />}
          {tab === 'incidencias' && <Incidencias />}
          {tab === 'bitacora' && <BitacoraDiaria />}
        </div>
      </div>
    </div>
  );
}

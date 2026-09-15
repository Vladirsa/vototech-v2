import { useState } from 'react';
import { Link } from 'react-router-dom';
import CentroMando from './CentroMando';
import DiaEleccion from './DiaEleccion';

/** 🆕 "Día E y Centro de Comando" — combinados en pestañas. */
export default function DiaEComando() {
  const [tab, setTab] = useState('centro-mando');
  const TABS = [
    { id: 'centro-mando', ic: '🎯', label: 'Centro de Mando' },
    { id: 'dia-eleccion', ic: '🗳️', label: 'Día de la Elección' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🗳️ Día E y Centro de Comando</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

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
          {tab === 'centro-mando' && <CentroMando />}
          {tab === 'dia-eleccion' && <DiaEleccion />}
        </div>
      </div>
    </div>
  );
}

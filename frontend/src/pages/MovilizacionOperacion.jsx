import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Promovidos from './Promovidos';
import Agenda from './Agenda';
import Logistica from './Logistica';
import Incidencias from './Incidencias';

/**
 * 🆕 "Movilización y Operación" — 4 módulos combinados en pestañas.
 * 🆕 La pestaña "Bitácora" se movió de aquí a Inteligencia Electoral
 * y a Centro de Decisiones — tiene más sentido que la bitácora de
 * campo viva junto con la inteligencia/decisiones que la usan, no
 * escondida dentro de la operación diaria.
 * 🆕 La pestaña "Duplicados" se movió aquí desde Estructura — es
 * sobre PROMOVIDOS (mismo nombre + misma sección capturado por 2+
 * personas), no sobre el equipo de campaña, así que no tenía razón
 * de estar en el módulo de Estructura.
 */
// ═══════════════════════════════════════════════════════════════
// 🔁 PANEL DE DUPLICADOS
// Mismo nombre + misma sección, capturado por 2 o más personas
// distintas — para detectar de un vistazo cuando varios promotores
// están trabajando la misma calle sin saberlo.
// ═══════════════════════════════════════════════════════════════
function PanelDuplicados() {
  const [duplicados, setDuplicados] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/estructura/duplicados')
      .then((r) => setDuplicados(r.data.data))
      .catch((err) => setError(err.response?.data?.error || 'No se pudieron cargar los duplicados'));
  }, []);

  if (error) return <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-4">{error}</div>;
  if (!duplicados) return <div className="text-center text-slate-500 text-sm py-10">⏳ Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Mismo nombre + misma sección, capturado por más de una persona — útil para saber si dos promotores están trabajando la misma calle sin darse cuenta.
      </p>
      {duplicados.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-10">✅ Sin duplicados detectados por ahora</div>
      ) : (
        <div className="space-y-1.5">
          {duplicados.map((d, i) => (
            <div key={i} className="bg-slate-900/60 border border-orange-800/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{d.nombre}</div>
                  <div className="text-[10px] text-slate-500">Sección {d.seccion_numero}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-orange-400">{d.personas_distintas} {d.personas_distintas == 1 ? 'persona' : 'personas'}</div>
                  <div className="text-[9px] text-slate-500">{d.veces_registrado} intentos en total</div>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(d.registrado_por_nombres || []).filter(Boolean).map((n, j) => (
                  <span key={j} className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MovilizacionOperacion() {
  const [tab, setTab] = useState('promovidos');
  const TABS = [
    { id: 'promovidos', ic: '🤝', label: 'Promovidos' },
    { id: 'agenda', ic: '📅', label: 'Agenda' },
    { id: 'logistica', ic: '🚚', label: 'Logística' },
    { id: 'incidencias', ic: '🚨', label: 'Incidencias' },
    { id: 'duplicados', ic: '🔁', label: 'Duplicados' },
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
          {tab === 'duplicados' && <PanelDuplicados />}
        </div>
      </div>
    </div>
  );
}

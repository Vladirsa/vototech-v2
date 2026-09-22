import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CentroMando from './CentroMando';
import Reportes from './Reportes';
import Priorizacion from './Priorizacion';
import EstadisticaProbabilidad from './EstadisticaProbabilidad';
import BitacoraDiaria from './BitacoraDiaria';
import CentroDecisiones from './CentroDecisiones';
import api from '../lib/api';

/**
 * 🆕 "Inteligencia Electoral" — Centro de Mando, Reportes,
 * Priorización y Estadística y Probabilidad combinados en pestañas.
 *
 * 🆕 NUEVO — el bloque de alertas inteligentes ("🧠 Inteligencia
 * Electoral") que antes vivía en el Dashboard se movió aquí, arriba
 * de las pestañas — tiene más sentido que las alertas de
 * inteligencia electoral vivan DENTRO del módulo de Inteligencia
 * Electoral, no mezcladas con el resumen operativo del día a día del
 * Dashboard.
 *
 * 🆕 NUEVO — "Centro de Mando" (antes vivía en "Día E y Centro de
 * Comando") se movió aquí, a la misma jerarquía que Reportes y
 * Priorización, y es la pestaña que se abre primero — tiene más
 * sentido que el mando de la campaña viva junto con la inteligencia
 * que lo alimenta.
 *
 * 🆕 NUEVO — "Estadística y Probabilidad" (antes era una sub-pestaña
 * escondida dentro de "Análisis", en Reportes) también se subió a
 * pestaña principal — es contenido de decisión, no un sub-reporte.
 * El resto de "Análisis" (Análisis histórico, Ficha del Estado,
 * Senado/Fed./Local) se retiró del sistema.
 *
 * 🆕 NUEVO — "Bitácora" (antes vivía en "Movilización y Operación")
 * también se movió aquí — la bitácora de campo alimenta directamente
 * la inteligencia electoral, tiene más sentido tenerla junto con
 * Reportes/Priorización que escondida en la operación diaria.
 *
 * 🆕 NUEVO — "Centro de Decisiones" (antes era un módulo aparte, con
 * su propio botón en el menú principal) se movió aquí como pestaña —
 * las decisiones de campaña se toman CON la inteligencia que las
 * respalda (reportes, priorización, estadística), no en un lugar
 * separado del menú. La ruta vieja /centro-decisiones redirige sola
 * a Inteligencia Electoral (ver App.jsx) para que ningún enlace
 * guardado se rompa.
 */
export default function InteligenciaElectoral() {
  const [tab, setTab] = useState('centro-mando');
  const [alertas, setAlertas] = useState([]);
  const TABS = [
    { id: 'centro-mando', ic: '🎯', label: 'Centro de Mando' },
    { id: 'reportes', ic: '📊', label: 'Reportes' },
    { id: 'priorizacion', ic: '🎯', label: 'Priorización' },
    { id: 'estadistica-probabilidad', ic: '🎲', label: 'Estadística y Probabilidad' },
    { id: 'bitacora', ic: '📔', label: 'Bitácora' },
    { id: 'centro-decisiones', ic: '🧭', label: 'Centro de Decisiones' },
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
          {tab === 'centro-mando' && <CentroMando />}
          {tab === 'reportes' && <Reportes />}
          {tab === 'priorizacion' && <Priorizacion />}
          {tab === 'estadistica-probabilidad' && <EstadisticaProbabilidad />}
          {tab === 'bitacora' && <BitacoraDiaria />}
          {tab === 'centro-decisiones' && <CentroDecisiones embed />}
        </div>
      </div>
    </div>
  );
}

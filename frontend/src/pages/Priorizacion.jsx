import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const ESTILO_PRIORIDAD = {
  critica:     { bg: 'bg-red-500/10', border: 'border-red-500/40', texto: 'text-red-400', label: '🔴 Crítica' },
  recuperable: { bg: 'bg-orange-500/10', border: 'border-orange-500/40', texto: 'text-orange-400', label: '🟠 Recuperable' },
  disputa:     { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', texto: 'text-yellow-400', label: '🟡 Disputa' },
  consolidar:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', texto: 'text-emerald-400', label: '🟢 Consolidar' },
  perdida:     { bg: 'bg-slate-500/10', border: 'border-slate-500/40', texto: 'text-slate-500', label: '⚫ Sin esperanza' },
};

export default function Priorizacion() {
  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get('/priorizacion').then((r) => { setDatos(r.data); setCargando(false); });
  }, []);

  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Calculando estrategia...</div>;
  if (!datos?.data?.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-3">📊</div>
          <p className="text-slate-400">{datos?.mensaje || 'Sin datos suficientes todavía'}</p>
        </div>
      </div>
    );
  }

  const filas = filtro === 'todas' ? datos.data : datos.data.filter((f) => f.prioridad === filtro);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🎯 Motor de Priorización</h1>
            <p className="text-xs text-slate-500">
              {datos.dias_restantes} días para la elección · {datos.resumen.promovidos_necesarios_total.toLocaleString()} promovidos necesarios en total
            </p>
          </div>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        {/* Filtros de prioridad */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltro('todas')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filtro === 'todas' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400'}`}>
            Todas ({datos.data.length})
          </button>
          {Object.entries(ESTILO_PRIORIDAD).map(([key, est]) => (
            <button key={key} onClick={() => setFiltro(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filtro === key ? `${est.bg} ${est.border} ${est.texto}` : 'border-slate-700 text-slate-500'}`}>
              {est.label} ({datos.resumen[key + (key === 'critica' ? 's' : key === 'recuperable' ? 's' : key === 'perdida' ? 's' : '')] ?? datos.data.filter(f=>f.prioridad===key).length})
            </button>
          ))}
        </div>

        {/* Lista de secciones */}
        <div className="space-y-2">
          {filas.map((f) => {
            const est = ESTILO_PRIORIDAD[f.prioridad];
            return (
              <div key={f.seccion} className={`rounded-xl border ${est.border} ${est.bg} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-white">{String(f.seccion).padStart(3, '0')}</span>
                    <span className={`text-xs font-bold ${est.texto}`}>{est.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Ganó: <strong className="text-slate-300">{f.ganador_historico?.toUpperCase()}</strong> ({f.margen_pct > 0 ? '+' : ''}{f.margen_pct}%)</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Lista nominal</div>
                    <div className="text-white font-bold">{f.lista_nominal?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Déficit de votos</div>
                    <div className="text-white font-bold">{f.deficit_votos > 0 ? f.deficit_votos.toLocaleString() : '✅ Cubierto'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Promovidos (base+persuad.)</div>
                    <div className="text-white font-bold">{f.promovidos_base + f.promovidos_persuadibles} de {f.promovidos_necesarios}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Ritmo diario necesario</div>
                    <div className={`font-bold ${f.ritmo_diario_necesario > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {f.ritmo_diario_necesario > 0 ? `${f.ritmo_diario_necesario}/día` : '✅ Meta lista'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

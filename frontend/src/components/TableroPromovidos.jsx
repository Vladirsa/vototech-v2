import { useState } from 'react';
import api from '../lib/api';

const COLUMNAS = [
  { id: 'base', ic: '✅', label: 'Base', color: 'border-emerald-600/50', bg: 'bg-emerald-500/5', header: 'bg-emerald-600' },
  { id: 'persuadible', ic: '🎯', label: 'Persuadible', color: 'border-amber-600/50', bg: 'bg-amber-500/5', header: 'bg-amber-600' },
  { id: 'adversario', ic: '⛔', label: 'Adversario', color: 'border-slate-600/50', bg: 'bg-slate-500/5', header: 'bg-slate-600' },
];

function TarjetaPromovido({ p, onArrastrar, onClick }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onArrastrar(p.id); }}
      onClick={() => onClick(p.id)}
      className="bg-slate-900 border border-slate-700 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-indigo-500/50 transition shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-white leading-tight">{p.nombre}</div>
        {p.clasificacion_manual && <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full flex-shrink-0">✋ manual</span>}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        {p.seccion_numero ? `Sección ${p.seccion_numero}` : 'Sin sección'} · {p.partido?.toUpperCase() || 'S/P'}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[9px]">{p.temperatura === 'caliente' ? '🔥' : p.temperatura === 'tibio' ? '🌡️' : '❄️'}</span>
        {p.comprometido && <span className="text-[9px] text-emerald-400">✔️ Comprometido</span>}
        {p.veces_intentado > 1 && <span className="text-[9px] text-amber-400 ml-auto">⚠️ {p.veces_intentado}x</span>}
      </div>
    </div>
  );
}

export default function TableroPromovidos({ lista, onActualizar, onVerDetalle }) {
  const [arrastrandoId, setArrastrandoId] = useState(null);
  const [columnaSobre, setColumnaSobre] = useState(null);

  const soltar = async (columnaId) => {
    setColumnaSobre(null);
    if (!arrastrandoId) return;
    const promovido = lista.find((p) => p.id === arrastrandoId);
    if (!promovido || promovido.clasificacion === columnaId) { setArrastrandoId(null); return; }

    await api.patch(`/promovidos/${arrastrandoId}/clasificacion`, { clasificacion: columnaId });
    setArrastrandoId(null);
    onActualizar();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {COLUMNAS.map((col) => {
        const tarjetas = lista.filter((p) => p.clasificacion === col.id);
        const esDestino = columnaSobre === col.id;
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setColumnaSobre(col.id); }}
            onDragLeave={() => setColumnaSobre((c) => (c === col.id ? null : c))}
            onDrop={(e) => { e.preventDefault(); soltar(col.id); }}
            className={`rounded-2xl border-2 ${esDestino ? 'border-indigo-500 bg-indigo-500/10' : `${col.color} ${col.bg}`} transition-colors min-h-[300px]`}
          >
            <div className={`${col.header} rounded-t-xl px-3 py-2.5 flex items-center justify-between`}>
              <span className="text-sm font-black text-white">{col.ic} {col.label}</span>
              <span className="text-xs font-bold text-white/80 bg-black/20 rounded-full px-2 py-0.5">{tarjetas.length}</span>
            </div>
            <div className="p-2.5 space-y-2 max-h-[65vh] overflow-y-auto">
              {tarjetas.length === 0 ? (
                <div className="text-center text-slate-600 text-xs py-8">Sin promovidos aquí</div>
              ) : (
                tarjetas.map((p) => (
                  <TarjetaPromovido key={p.id} p={p} onArrastrar={setArrastrandoId} onClick={onVerDetalle} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

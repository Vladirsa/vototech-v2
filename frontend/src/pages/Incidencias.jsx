import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';

const URGENCIA_COLOR = { urgente: 'border-red-500/50 bg-red-500/10', alta: 'border-orange-500/50 bg-orange-500/10', media: 'border-amber-500/50 bg-amber-500/10', baja: 'border-slate-700 bg-slate-800/30' };
const TIPO_LABEL = { compra_votos: '🚫 Compra de votos', violencia: '⚠️ Violencia', irregularidad: '📋 Irregularidad', logistica: '🔧 Logística', representante: '🗳️ Representante', propaganda: '📢 Propaganda', otro: '📌 Otro' };

export default function Incidencias() {
  const [lista, setLista] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'otro', urgencia: 'media', descripcion: '', seccion_numero: '' });
  const [alertaUrgente, setAlertaUrgente] = useState(null);

  const cargar = () => api.get('/incidencias').then((r) => setLista(r.data.data));
  useEffect(cargar, []);

  useSocket({
    incidencia_urgente: (inc) => {
      setLista((prev) => [inc, ...prev]);
      setAlertaUrgente(inc);
      setTimeout(() => setAlertaUrgente(null), 8000);
    },
  });

  const guardar = async () => {
    await api.post('/incidencias', { ...form, seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined });
    setForm({ tipo: 'otro', urgencia: 'media', descripcion: '', seccion_numero: '' });
    setMostrarForm(false);
    cargar();
  };

  const resolver = async (id) => { await api.patch(`/incidencias/${id}/resolver`); cargar(); };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        {alertaUrgente && (
          <div className="fixed top-4 right-4 z-50 bg-red-600 text-white rounded-xl p-4 shadow-2xl max-w-xs animate-pulse">
            <div className="font-black text-sm">🚨 INCIDENCIA URGENTE</div>
            <div className="text-xs mt-1">{alertaUrgente.descripcion}</div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🚨 Incidencias</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">
            {mostrarForm ? 'Cancelar' : '+ Reportar'}
          </button>
        </div>

        {mostrarForm && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="grid grid-cols-4 gap-1.5">
              {['urgente', 'alta', 'media', 'baja'].map((u) => (
                <button key={u} onClick={() => setForm({ ...form, urgencia: u })}
                  className={`py-2 rounded-lg text-[10px] font-bold border ${form.urgencia === u ? URGENCIA_COLOR[u] + ' text-white' : 'border-slate-700 text-slate-400'}`}>
                  {u}
                </button>
              ))}
            </div>
            <textarea placeholder="Describe qué pasó..." value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
            <input type="number" placeholder="Sección (opcional)" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button onClick={guardar} disabled={!form.descripcion} className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">Reportar</button>
          </div>
        )}

        <div className="space-y-2">
          {lista.map((i) => (
            <div key={i.id} className={`rounded-xl border p-4 ${URGENCIA_COLOR[i.urgencia]} ${i.estado === 'resuelta' ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{TIPO_LABEL[i.tipo]}</span>
                <span className="text-[9px] uppercase font-bold text-slate-400">{i.urgencia}</span>
              </div>
              <p className="text-xs text-slate-300">{i.descripcion}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-slate-500">{i.seccion_numero && `Sección ${i.seccion_numero} · `}{i.reportado_por_nombre}</span>
                {i.estado !== 'resuelta' && <button onClick={() => resolver(i.id)} className="text-[10px] font-bold text-emerald-400">✅ Resolver</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

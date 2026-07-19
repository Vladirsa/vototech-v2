import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import { useSocket } from '../lib/useSocket';
import SubidaFotos from '../components/SubidaFotos';

const URGENCIA_COLOR = { urgente: 'border-red-500/50 bg-red-500/10', alta: 'border-orange-500/50 bg-orange-500/10', media: 'border-amber-500/50 bg-amber-500/10', baja: 'border-slate-700 bg-slate-800/30' };
const TIPO_LABEL = { compra_votos: '🚫 Compra de votos', violencia: '⚠️ Violencia', irregularidad: '📋 Irregularidad', logistica: '🔧 Logística', representante: '🗳️ Representante', propaganda: '📢 Propaganda', otro: '📌 Otro' };

function TarjetaIncidencia({ i, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ descripcion: i.descripcion, testigos: i.testigos || '', urgencia: i.urgencia, notificado_ople: i.notificado_ople });

  const guardarEdicion = async () => {
    await api.patch(`/incidencias/${i.id}`, form);
    setEditando(false);
    onCambio();
  };
  const resolver = async () => { await api.patch(`/incidencias/${i.id}/resolver`); onCambio(); };
  const toggleOple = async () => { await api.patch(`/incidencias/${i.id}`, { notificado_ople: !i.notificado_ople }); onCambio(); };

  return (
    <div className={`rounded-xl border p-4 ${URGENCIA_COLOR[i.urgencia]} ${i.estado === 'resuelta' ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-white">{TIPO_LABEL[i.tipo]}</span>
        <div className="flex items-center gap-2">
          {i.notificado_ople && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">📋 Notificada OPLE</span>}
          <span className="text-[9px] uppercase font-bold text-slate-400">{i.urgencia}</span>
        </div>
      </div>

      {!editando ? (
        <>
          <p className="text-xs text-slate-300">{i.descripcion}</p>
          {i.testigos && <p className="text-[10px] text-slate-500 mt-1">👥 Testigos: {i.testigos}</p>}
          <div className="mt-2">
            <SubidaFotos contexto="incidencia" referenciaId={i.id} maximo={5} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-slate-500">{i.seccion_numero && `Sección ${i.seccion_numero} · `}{i.reportado_por_nombre}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditando(true)} className="text-[10px] font-bold text-indigo-400">✏️</button>
              <button onClick={toggleOple} className="text-[10px] font-bold text-slate-400">{i.notificado_ople ? '📋 Quitar OPLE' : '📋 Marcar notificada'}</button>
              {i.estado !== 'resuelta' && <button onClick={resolver} className="text-[10px] font-bold text-emerald-400">✅ Resolver</button>}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2 mt-2">
          <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs min-h-16" />
          <input placeholder="Testigos" value={form.testigos} onChange={(e) => setForm({ ...form, testigos: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
          <div className="grid grid-cols-4 gap-1">
            {['urgente', 'alta', 'media', 'baja'].map((u) => (
              <button key={u} onClick={() => setForm({ ...form, urgencia: u })}
                className={`py-1.5 rounded text-[9px] font-bold border ${form.urgencia === u ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400'}`}>{u}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditando(false)} className="flex-1 py-1.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">Cancelar</button>
            <button onClick={guardarEdicion} className="flex-[2] py-1.5 rounded bg-emerald-600 text-white text-[10px] font-bold">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Incidencias() {
  const [params] = useSearchParams();
  const seccionUrl = params.get('seccion');
  const [lista, setLista] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(!!seccionUrl);
  const [form, setForm] = useState({ tipo: 'otro', urgencia: 'media', descripcion: '', seccion_numero: seccionUrl || '', testigos: '' });
  const [alertaUrgente, setAlertaUrgente] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('activa');

  const cargar = () => {
    const query = new URLSearchParams();
    if (filtroTipo !== 'todos') query.set('tipo', filtroTipo);
    if (filtroEstado !== 'todos') query.set('estado', filtroEstado);
    api.get(`/incidencias?${query}`).then((r) => setLista(r.data.data));
  };
  useEffect(cargar, [filtroTipo, filtroEstado]);

  useSocket({
    incidencia_urgente: (inc) => {
      setLista((prev) => [inc, ...prev]);
      setAlertaUrgente(inc);
      setTimeout(() => setAlertaUrgente(null), 8000);
    },
  });

  const guardar = async () => {
    await api.post('/incidencias', { ...form, seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined });
    setForm({ tipo: 'otro', urgencia: 'media', descripcion: '', seccion_numero: '', testigos: '' });
    setMostrarForm(false);
    cargar();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
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
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/exportar/incidencias', 'incidencias.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold" title="Excel para reportar al OPLE">
              📥 Excel
            </button>
            <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">
              {mostrarForm ? 'Cancelar' : '+ Reportar'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border-0">
            <option value="activa">🔴 Activas</option>
            <option value="resuelta">✅ Resueltas</option>
            <option value="todos">Todas</option>
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border-0">
            <option value="todos">Todos los tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
            <input placeholder="Testigos (opcional)" value={form.testigos} onChange={(e) => setForm({ ...form, testigos: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input type="number" placeholder="Sección (opcional)" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button onClick={guardar} disabled={!form.descripcion} className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">Reportar</button>
          </div>
        )}

        <div className="space-y-2">
          {lista.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Sin incidencias en este filtro</div>
          ) : lista.map((i) => <TarjetaIncidencia key={i.id} i={i} onCambio={cargar} />)}
        </div>
      </div>
    </div>
  );
}

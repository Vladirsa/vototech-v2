import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function Agenda() {
  const [eventos, setEventos] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', tipo: 'evento', fecha_inicio: '', lugar: '' });

  const cargar = () => api.get('/agenda').then((r) => setEventos(r.data.data));
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    await api.post('/agenda', form);
    setForm({ titulo: '', tipo: 'evento', fecha_inicio: '', lugar: '' });
    setMostrarForm(false);
    cargar();
  };

  const eliminar = async (id) => { await api.delete(`/agenda/${id}`); cargar(); };

  const TIPO_ICONO = { evento: '🎪', reunion: '👥', recorrido: '🚶', entrevista: '🎤' };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📅 Agenda</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
            {mostrarForm ? 'Cancelar' : '+ Evento'}
          </button>
        </div>

        {mostrarForm && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <input placeholder="Título del evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(TIPO_ICONO).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
            </select>
            <input type="datetime-local" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Lugar" value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button onClick={guardar} disabled={!form.titulo || !form.fecha_inicio}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Guardar evento</button>
          </div>
        )}

        <div className="space-y-2">
          {eventos.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Sin eventos programados</div>
          ) : eventos.map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{TIPO_ICONO[e.tipo]}</span>
                <div>
                  <div className="text-sm font-bold text-white">{e.titulo}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(e.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                    {e.lugar && ` · ${e.lugar}`}
                  </div>
                </div>
              </div>
              <button onClick={() => eliminar(e.id)} className="text-slate-600 hover:text-red-400 text-xs">🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

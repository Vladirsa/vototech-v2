import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';

const CATEGORIAS = ['propaganda_impresa', 'espectaculares', 'eventos', 'transporte', 'personal', 'tecnologia', 'publicidad_digital', 'otro'];

export default function Finanzas() {
  const [gastos, setGastos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10) });
  const [tope, setTope] = useState('');

  const cargar = () => api.get('/finanzas').then((r) => { setGastos(r.data.data); setResumen(r.data.resumen); });
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/finanzas', { ...form, monto: parseFloat(form.monto) });
    setForm({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10) });
    setMostrarForm(false);
    cargar();
  };

  const guardarTope = async () => {
    await api.put('/finanzas/tope', { tope: parseFloat(tope) });
    setTope('');
    cargar();
  };

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">💰 Control Financiero</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/exportar/gastos', 'gastos_ople.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold" title="Excel formato OPLE">
              📥 Excel OPLE
            </button>
            <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              {mostrarForm ? 'Cancelar' : '+ Gasto'}
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border border-emerald-700/30 rounded-2xl p-4">
          {resumen?.tope_ople ? (
            <>
              <div className="flex justify-between text-xs text-emerald-300 mb-2">
                <span>Gastado: {fmt(resumen.total_gastado)}</span>
                <span>Tope OPLE: {fmt(resumen.tope_ople)}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${resumen.porcentaje_usado > 90 ? 'bg-red-500' : resumen.porcentaje_usado > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, resumen.porcentaje_usado)}%` }} />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">{resumen.porcentaje_usado}% usado · Disponible: {fmt(resumen.disponible)}</div>
            </>
          ) : (
            <div className="flex gap-2">
              <input placeholder="Define tu tope de gasto OPLE" type="number" value={tope} onChange={(e) => setTope(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <button onClick={guardarTope} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar</button>
            </div>
          )}
        </div>

        {mostrarForm && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <input type="number" placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
            <button onClick={guardar} disabled={!form.descripcion || !form.monto} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Guardar gasto</button>
          </div>
        )}

        <div className="space-y-2">
          {gastos.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{g.descripcion}</div>
                <div className="text-[10px] text-slate-500">{g.categoria.replace('_', ' ')} · {new Date(g.fecha).toLocaleDateString('es-MX')}</div>
              </div>
              <div className="text-sm font-black text-emerald-400">{fmt(g.monto)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';

const TIPO_LABEL = {
  espectacular: { ic: '📺', label: 'Espectacular' },
  barda: { ic: '🧱', label: 'Barda' },
  manta: { ic: '🎏', label: 'Manta/Lona' },
  ine_representante: { ic: '🗳️', label: 'Representante INE' },
};
const ESTADO_COLOR = { activo: 'text-emerald-400 bg-emerald-500/10', vencido: 'text-red-400 bg-red-500/10', retirado: 'text-slate-500 bg-slate-500/10' };

function ModalAgregarActivo({ onCerrar, onGuardado }) {
  const [form, setForm] = useState({ tipo: 'espectacular', seccion_numero: '', direccion: '', empresa: '', costo: '', fecha_vence: '', nombre_rep: '', telefono_rep: '', lat: null, lng: null });
  const [error, setError] = useState('');

  const guardar = async () => {
    try {
      await api.post('/activos', {
        ...form,
        seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined,
        costo: form.costo ? parseFloat(form.costo) : undefined,
      });
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">+ Nuevo Activo</h2>
        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}

        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v.ic} {v.label}</option>)}
        </select>

        <input placeholder="Sección electoral" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        <BuscadorCalle valor={form.direccion} onSeleccion={(d) => setForm({ ...form, direccion: d.direccion_completa, lat: d.lat, lng: d.lng })} />

        {form.tipo === 'ine_representante' ? (
          <>
            <input placeholder="Nombre del representante" value={form.nombre_rep} onChange={(e) => setForm({ ...form, nombre_rep: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Teléfono" value={form.telefono_rep} onChange={(e) => setForm({ ...form, telefono_rep: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </>
        ) : (
          <>
            <input placeholder="Empresa/proveedor" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <input placeholder="Costo" type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <input placeholder="Vence" type="date" value={form.fecha_vence} onChange={(e) => setForm({ ...form, fecha_vence: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Guardar</button>
        </div>
      </div>
    </div>
  );
}

export default function Activos() {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [mostrarModal, setMostrarModal] = useState(false);

  const cargar = () => api.get('/activos').then((r) => setLista(r.data.data));
  useEffect(cargar, []);

  const cambiarEstado = async (id, estado) => { await api.patch(`/activos/${id}/estado`, { estado }); cargar(); };
  const eliminar = async (id) => { if (confirm('¿Eliminar este activo?')) { await api.delete(`/activos/${id}`); cargar(); } };

  const filtrados = filtro === 'todos' ? lista : lista.filter((a) => a.tipo === filtro);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📺 Activos de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro('todos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Todos ({lista.length})</button>
          {Object.entries(TIPO_LABEL).map(([k, v]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {v.ic} {v.label} ({lista.filter((a) => a.tipo === k).length})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtrados.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Sin activos registrados en esta categoría</div>
          ) : filtrados.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{TIPO_LABEL[a.tipo].ic} {a.tipo === 'ine_representante' ? a.nombre_rep : (a.direccion || 'Sin dirección')}</div>
                  <div className="text-[10px] text-slate-500">
                    {a.seccion_numero && `Sección ${a.seccion_numero} · `}
                    {a.tipo === 'ine_representante' ? a.telefono_rep : a.empresa}
                    {a.fecha_vence && ` · vence ${new Date(a.fecha_vence).toLocaleDateString('es-MX')}`}
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${ESTADO_COLOR[a.estado]}`}>{a.estado}</span>
              </div>
              <div className="flex gap-1.5 mt-2">
                {a.estado !== 'activo' && <button onClick={() => cambiarEstado(a.id, 'activo')} className="text-[10px] text-emerald-400 font-bold">✅ Marcar activo</button>}
                {a.estado !== 'vencido' && <button onClick={() => cambiarEstado(a.id, 'vencido')} className="text-[10px] text-amber-400 font-bold">⏰ Marcar vencido</button>}
                {a.estado !== 'retirado' && <button onClick={() => cambiarEstado(a.id, 'retirado')} className="text-[10px] text-slate-400 font-bold">📦 Marcar retirado</button>}
                <button onClick={() => eliminar(a.id)} className="text-[10px] text-red-400 font-bold ml-auto">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mostrarModal && <ModalAgregarActivo onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
    </div>
  );
}

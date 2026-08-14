import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const CATEGORIA_LABEL = {
  sonido: '🔊 Sonido', templete: '🎪 Templete/tarima', sillas: '🪑 Sillas', pantalla: '📺 Pantalla/proyector',
  planta_electrica: '🔌 Planta eléctrica', permisos: '📋 Permisos', transporte: '🚗 Transporte',
  hospedaje: '🏨 Hospedaje', alimentacion: '🍽️ Alimentación', otro: '📦 Otro',
};

function PanelResumen() {
  const [resumen, setResumen] = useState(null);
  useEffect(() => { api.get('/logistica/resumen').then((r) => setResumen(r.data.data)); }, []);
  if (!resumen) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-white">{resumen.total_vehiculos}</div>
          <div className="text-[9px] text-slate-500">Vehículos activos</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-emerald-400">{resumen.choferes_disponibles} <span className="text-slate-500 text-sm">/ {resumen.total_choferes}</span></div>
          <div className="text-[9px] text-slate-500">Choferes disponibles</div>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">📅 Eventos de los próximos 7 días</h3>
        {resumen.proximos_eventos.length === 0 ? (
          <div className="text-center text-slate-500 py-6 text-xs">Sin eventos programados esta semana</div>
        ) : (
          <div className="space-y-1.5">
            {resumen.proximos_eventos.map((e) => {
              const sinChecklist = e.total_items == 0;
              const incompleto = e.total_items > 0 && e.completados < e.total_items;
              return (
                <Link key={e.id} to={`/agenda`} className={`block rounded-lg border p-3 ${sinChecklist ? 'border-red-500/40 bg-red-500/5' : incompleto ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">{e.titulo}</span>
                    <span className="text-[9px] text-slate-500">{new Date(e.fecha_inicio).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="text-[10px] mt-1">
                    {sinChecklist ? <span className="text-red-400">⚠️ Sin checklist todavía</span> :
                     incompleto ? <span className="text-amber-400">⏳ {e.completados}/{e.total_items} puntos listos</span> :
                     <span className="text-emerald-400">✅ Checklist completo</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelVehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ subtipo: '', notas: '', costo: '', responsable_id: '' });

  const cargar = () => api.get('/logistica/vehiculos').then((r) => setVehiculos(r.data.data));
  useEffect(() => { cargar(); api.get('/estructura').then((r) => setEquipo(r.data.data)).catch(() => setEquipo([])); }, []);

  const guardar = async () => {
    await api.post('/logistica/vehiculos', { ...form, costo: form.costo ? parseFloat(form.costo) : undefined, responsable_id: form.responsable_id || undefined });
    setForm({ subtipo: '', notas: '', costo: '', responsable_id: '' });
    setMostrarForm(false);
    cargar();
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Nuevo vehículo'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Descripción (ej: Nissan Versa 2020, gris)" value={form.subtipo} onChange={(e) => setForm({ ...form, subtipo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Placas / notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Costo (opcional)" type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <select value={form.responsable_id} onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="">Sin responsable asignado todavía</option>
            {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <button onClick={guardar} disabled={!form.subtipo} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
        </div>
      )}
      {vehiculos.length === 0 ? (
        <div className="text-center text-slate-500 py-8">Sin vehículos registrados todavía</div>
      ) : vehiculos.map((v) => (
        <div key={v.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-bold text-white">🚗 {v.subtipo || 'Vehículo sin descripción'}</div>
              <div className="text-[10px] text-slate-500">{v.codigo_inventario}{v.notas && ` · ${v.notas}`}</div>
            </div>
            <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">{v.estado || 'activo'}</span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            {v.responsable_nombre && <span className="text-indigo-400">👤 {v.responsable_nombre}</span>}
            {v.chofer_nombre ? <span className="text-purple-400">🧑‍✈️ {v.chofer_nombre}</span> : <span className="text-slate-600">Sin chofer asignado</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelChoferes() {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', telefono: '', licencia_vigencia: '', vehiculo_id: '' });

  const cargar = () => api.get('/logistica/choferes').then((r) => setChoferes(r.data.data));
  useEffect(() => { cargar(); api.get('/logistica/vehiculos').then((r) => setVehiculos(r.data.data)); }, []);

  const guardar = async () => {
    await api.post('/logistica/choferes', { ...form, vehiculo_id: form.vehiculo_id || undefined });
    setForm({ nombre: '', telefono: '', licencia_vigencia: '', vehiculo_id: '' });
    setMostrarForm(false);
    cargar();
  };
  const toggleDisponible = async (id, disponible) => { await api.patch(`/logistica/choferes/${id}`, { disponible: !disponible }); cargar(); };
  const eliminar = async (id) => { if (confirm('¿Eliminar este chofer?')) { await api.delete(`/logistica/choferes/${id}`); cargar(); } };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Nuevo chofer'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <div>
            <label className="text-[9px] text-slate-500">Vigencia de licencia</label>
            <input type="date" value={form.licencia_vigencia} onChange={(e) => setForm({ ...form, licencia_vigencia: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <select value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="">Sin vehículo asignado todavía</option>
            {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.subtipo || v.codigo_inventario}</option>)}
          </select>
          <button onClick={guardar} disabled={!form.nombre} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
        </div>
      )}
      {choferes.length === 0 ? (
        <div className="text-center text-slate-500 py-8">Sin choferes registrados todavía</div>
      ) : choferes.map((c) => {
        const licenciaVencida = c.licencia_vigencia && new Date(c.licencia_vigencia) < new Date();
        return (
          <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-white">🧑‍✈️ {c.nombre}</div>
                <div className="text-[10px] text-slate-500">{c.telefono}{c.vehiculo_subtipo && ` · 🚗 ${c.vehiculo_subtipo}`}</div>
                {licenciaVencida && <div className="text-[10px] text-red-400 mt-1">⚠️ Licencia vencida</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleDisponible(c.id, c.disponible)} className={`text-[9px] font-bold px-2 py-1 rounded-full ${c.disponible ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {c.disponible ? '✅ Disponible' : '⏸️ No disponible'}
                </button>
                <button onClick={() => eliminar(c.id)} className="text-red-500 text-xs">🗑️</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PanelChecklist() {
  const [eventos, setEventos] = useState([]);
  const [eventoId, setEventoId] = useState('');
  const [checklist, setChecklist] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [nuevoItem, setNuevoItem] = useState({ categoria: 'otro', item: '' });

  useEffect(() => {
    api.get('/agenda').then((r) => setEventos(r.data.data.filter((e) => e.estado !== 'cancelado')));
    api.get('/estructura').then((r) => setEquipo(r.data.data)).catch(() => setEquipo([]));
  }, []);

  const cargarChecklist = (id) => { if (id) api.get(`/logistica/checklist/${id}`).then((r) => setChecklist(r.data.data)); };
  useEffect(() => { if (eventoId) cargarChecklist(eventoId); else setChecklist(null); }, [eventoId]);

  const generarEstandar = async () => {
    try { await api.post(`/logistica/checklist/${eventoId}/generar-estandar`); cargarChecklist(eventoId); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo generar'); }
  };
  const agregarItem = async () => {
    if (!nuevoItem.item) return;
    await api.post(`/logistica/checklist/${eventoId}`, nuevoItem);
    setNuevoItem({ categoria: 'otro', item: '' });
    cargarChecklist(eventoId);
  };
  const toggleCompletado = async (itemId) => { await api.patch(`/logistica/checklist/item/${itemId}/completar`); cargarChecklist(eventoId); };
  const eliminarItem = async (itemId) => { await api.delete(`/logistica/checklist/item/${itemId}`); cargarChecklist(eventoId); };

  return (
    <div className="space-y-3">
      <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
        <option value="">Elige un evento...</option>
        {eventos.map((e) => <option key={e.id} value={e.id}>{e.titulo} — {new Date(e.fecha_inicio).toLocaleDateString('es-MX')}</option>)}
      </select>

      {eventoId && checklist && (
        <>
          {checklist.length === 0 && (
            <button onClick={generarEstandar} className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold">✨ Generar checklist estándar (7 puntos)</button>
          )}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <select value={nuevoItem.categoria} onChange={(e) => setNuevoItem({ ...nuevoItem, categoria: e.target.value })}
                className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                {Object.entries(CATEGORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input placeholder="Punto a verificar" value={nuevoItem.item} onChange={(e) => setNuevoItem({ ...nuevoItem, item: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
              <button onClick={agregarItem} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">+</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div key={item.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${item.completado ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/60 border-slate-800'}`}>
                <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                  <input type="checkbox" checked={item.completado} onChange={() => toggleCompletado(item.id)} />
                  <div>
                    <div className={`text-xs font-bold ${item.completado ? 'text-emerald-400 line-through' : 'text-white'}`}>{CATEGORIA_LABEL[item.categoria]?.split(' ')[0]} {item.item}</div>
                    {item.responsable_nombre && <div className="text-[9px] text-slate-500">👤 {item.responsable_nombre}</div>}
                  </div>
                </label>
                <button onClick={() => eliminarItem(item.id)} className="text-red-500 text-xs">🗑️</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Logistica() {
  const [tab, setTab] = useState('resumen');
  const TABS = [
    { id: 'resumen', ic: '📊', label: 'Resumen' },
    { id: 'vehiculos', ic: '🚗', label: 'Vehículos' },
    { id: 'choferes', ic: '🧑‍✈️', label: 'Choferes' },
    { id: 'checklist', ic: '✅', label: 'Checklist de evento' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🚚 Logística</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t.ic} {t.label}
            </button>
          ))}
        </div>
        {tab === 'resumen' && <PanelResumen />}
        {tab === 'vehiculos' && <PanelVehiculos />}
        {tab === 'choferes' && <PanelChoferes />}
        {tab === 'checklist' && <PanelChecklist />}
      </div>
    </div>
  );
}

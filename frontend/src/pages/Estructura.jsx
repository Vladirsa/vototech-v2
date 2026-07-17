import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const SALUD_ESTILO = {
  sano:         { color: 'text-emerald-400', bg: 'bg-emerald-500/10', ic: '✅', label: 'Sano' },
  sobrecargado: { color: 'text-red-400', bg: 'bg-red-500/10', ic: '🔴', label: 'Sobrecargado' },
  bajo:         { color: 'text-amber-400', bg: 'bg-amber-500/10', ic: '🟡', label: 'Subutilizado' },
  vacio:        { color: 'text-slate-500', bg: 'bg-slate-500/10', ic: '⚪', label: 'Sin equipo aún' },
  na:           { color: 'text-slate-500', bg: '', ic: '', label: '' },
};

const ROL_LABEL = {
  jefe_campana: '👑 Jefe de Campaña', coord_general: '⭐ Coord. General',
  coord_distrital: '🗺️ Coord. Distrital', coord_municipal: '🏘️ Coord. Municipal',
  coord_seccional: '📍 Coord. Seccional', promotor: '🤝 Promotor',
};

function ModalAgregarMiembro({ miembros, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'promotor', parent_id: '', territorio_id: '' });
  const [error, setError] = useState('');
  const guardar = async () => {
    try {
      await api.post('/estructura', {
        ...form,
        parent_id: form.parent_id || undefined,
        territorio_tipo: form.territorio_id ? 'seccion' : undefined,
        territorio_id: form.territorio_id ? parseInt(form.territorio_id) : undefined,
      });
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-black text-white">+ Agregar Miembro</h2>
        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Contraseña temporal" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          {Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {form.rol === 'coord_seccional' && (
          <input placeholder="Sección que le asignas (ej: 12)" type="number" value={form.territorio_id}
            onChange={(e) => setForm({ ...form, territorio_id: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        )}
        <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          <option value="">Sin coordinador directo</option>
          {miembros.filter(m => m.rol !== 'promotor').map(m => <option key={m.id} value={m.id}>{m.nombre} ({ROL_LABEL[m.rol]})</option>)}
        </select>
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={!form.nombre || !form.email || form.password.length < 8}
            className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

export default function Estructura() {
  const [miembros, setMiembros] = useState([]);
  const [salud, setSalud] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = () => {
    Promise.all([api.get('/estructura'), api.get('/estructura/salud')]).then(([m, s]) => {
      setMiembros(m.data.data); setSalud(s.data.data); setCargando(false);
    });
  };
  useEffect(cargar, []);

  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🗂️ Estructura de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
        </div>

        {/* Resumen del semáforo de salud */}
        {salud && (
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(salud.resumen).map(([key, n]) => {
              const est = SALUD_ESTILO[key];
              return (
                <div key={key} className={`rounded-xl ${est.bg} border border-slate-800 p-3 text-center`}>
                  <div className="text-xl">{est.ic}</div>
                  <div className={`text-lg font-black ${est.color}`}>{n}</div>
                  <div className="text-[9px] text-slate-500">{est.label}</div>
                </div>
              );
            })}
          </div>
        )}
        {salud?.alertas?.length > 0 && (
          <div className="space-y-1.5">
            {salud.alertas.map((a, i) => (
              <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                🔴 <strong>{miembros.find(m => m.id === a.usuario_id)?.nombre}</strong>: {a.mensaje}
              </div>
            ))}
          </div>
        )}

        {/* Lista de miembros con su salud individual */}
        <div className="space-y-2">
          {miembros.map((m) => {
            const est = SALUD_ESTILO[m.salud] || SALUD_ESTILO.na;
            return (
              <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{m.nombre}</div>
                  <div className="text-[10px] text-slate-500">{ROL_LABEL[m.rol]}{m.rol !== 'promotor' && ` · ${m.reportes_directos} a cargo`}</div>
                </div>
                {m.salud !== 'na' && <span className={`text-[10px] font-bold ${est.color}`}>{est.ic} {est.label}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {mostrarModal && <ModalAgregarMiembro miembros={miembros} onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
    </div>
  );
}

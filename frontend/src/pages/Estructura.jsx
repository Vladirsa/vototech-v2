import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const SALUD_ESTILO = {
  sano:         { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-700/40', ic: '✅', label: 'Sano' },
  sobrecargado: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-700/40', ic: '🔴', label: 'Sobrecargado' },
  bajo:         { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-700/40', ic: '🟡', label: 'Subutilizado' },
  vacio:        { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-700', ic: '⚪', label: 'Sin equipo aún' },
  na:           { color: 'text-slate-500', bg: '', border: 'border-slate-800', ic: '', label: '' },
};

const ROL_LABEL = {
  jefe_campana: '👑 Jefe de Campaña', coord_general: '⭐ Coord. General',
  coord_distrital: '🗺️ Coord. Distrital', coord_municipal: '🏘️ Coord. Municipal',
  coord_seccional: '📍 Coord. Seccional', promotor: '🤝 Promotor',
};

function estaActivoReciente(ultimoAcceso) {
  if (!ultimoAcceso) return null;
  const dias = (Date.now() - new Date(ultimoAcceso).getTime()) / 86400000;
  if (dias < 3) return 'reciente';
  if (dias < 14) return 'medio';
  return 'inactivo';
}
const PUNTO_ACTIVIDAD = { reciente: 'bg-emerald-400', medio: 'bg-amber-400', inactivo: 'bg-red-400' };

function ModalAgregarMiembro({ miembros, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'promotor', parent_id: '', territorio_id: '', meta_diaria: '' });
  const [error, setError] = useState('');
  const guardar = async () => {
    try {
      await api.post('/estructura', {
        ...form,
        parent_id: form.parent_id || undefined,
        territorio_tipo: form.territorio_id ? 'seccion' : undefined,
        territorio_id: form.territorio_id ? parseInt(form.territorio_id) : undefined,
        meta_diaria: form.meta_diaria ? parseInt(form.meta_diaria) : undefined,
      });
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
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
        <input placeholder="Meta diaria de promovidos (opcional)" type="number" value={form.meta_diaria}
          onChange={(e) => setForm({ ...form, meta_diaria: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={!form.nombre || !form.email || form.password.length < 8}
            className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDetalleMiembro({ miembro, miembros, onCerrar, onActualizado }) {
  const [cadena, setCadena] = useState(null);
  const [zonas, setZonas] = useState(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nombre: miembro.nombre, rol: miembro.rol, parent_id: miembro.parent_id || '', meta_diaria: miembro.meta_diaria || '' });

  useEffect(() => {
    api.get(`/estructura/cadena/${miembro.id}`).then((r) => setCadena(r.data.data));
    api.get(`/estructura/${miembro.id}/zonas`).then((r) => setZonas(r.data.data));
  }, [miembro.id]);

  const guardarCambios = async () => {
    await api.patch(`/estructura/${miembro.id}`, {
      nombre: form.nombre, rol: form.rol,
      parent_id: form.parent_id || null,
      meta_diaria: form.meta_diaria ? parseInt(form.meta_diaria) : undefined,
    });
    setEditando(false);
    onActualizado();
  };

  const desactivar = async () => {
    if (!confirm(`¿Dar de baja a ${miembro.nombre}? Su historial se conserva, pero ya no podrá entrar al sistema.`)) return;
    await api.patch(`/estructura/${miembro.id}`, { activo: false });
    onActualizado();
    onCerrar();
  };

  const actividad = estaActivoReciente(miembro.ultimo_acceso);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">{miembro.nombre}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        {!editando ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{ROL_LABEL[miembro.rol]}</span>
              {actividad && <span className={`w-2 h-2 rounded-full ${PUNTO_ACTIVIDAD[actividad]}`} title="Actividad reciente" />}
              <span className="text-slate-500">
                {miembro.ultimo_acceso ? `Último acceso: ${new Date(miembro.ultimo_acceso).toLocaleDateString('es-MX')}` : 'Nunca ha entrado'}
              </span>
            </div>

            {/* Cadena de invitación — quién lo invitó, hasta el candidato */}
            {cadena && cadena.length > 1 && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🔗 Cadena de invitación</div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
                  {cadena.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-600">→</span>}
                      <span className={i === cadena.length - 1 ? 'text-indigo-400 font-bold' : ''}>{c.nombre}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Zonas asignadas (de Sectorización en el mapa) */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🗺️ Zonas asignadas</div>
              {!zonas || zonas.length === 0 ? (
                <div className="text-xs text-slate-500">Sin secciones asignadas — asígnalas desde el modo Sectorización en el mapa</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {zonas.map((s) => <span key={s} className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Sección {s}</span>)}
                </div>
              )}
            </div>

            {miembro.meta_diaria > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🎯 Meta diaria</div>
                <div className="text-sm text-white">{miembro.meta_diaria} promovidos/día</div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button onClick={() => setEditando(true)} className="flex-1 py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-bold">✏️ Editar</button>
              {miembro.activo !== false && (
                <button onClick={desactivar} className="flex-1 py-2 rounded-lg bg-red-600/80 text-white text-xs font-bold">🚫 Dar de baja</button>
              )}
            </div>
          </>
        ) : (
          <>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="">Sin coordinador directo</option>
              {miembros.filter(m => m.id !== miembro.id && m.rol !== 'promotor').map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <input placeholder="Meta diaria" type="number" value={form.meta_diaria} onChange={(e) => setForm({ ...form, meta_diaria: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
              <button onClick={guardarCambios} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar cambios</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Nodo del organigrama visual — se dibuja a sí mismo y a sus hijos recursivamente */
function NodoOrganigrama({ miembro, hijos, onClick }) {
  const est = SALUD_ESTILO[miembro.salud] || SALUD_ESTILO.na;
  const actividad = estaActivoReciente(miembro.ultimo_acceso);
  const propios = hijos.filter((h) => h.parent_id === miembro.id);

  return (
    <div className="flex flex-col items-center">
      <button onClick={() => onClick(miembro)}
        className={`px-3 py-2 rounded-xl border ${est.border} ${est.bg} min-w-[120px] text-center hover:scale-105 transition-transform relative`}>
        {actividad && <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${PUNTO_ACTIVIDAD[actividad]} border-2 border-slate-950`} />}
        <div className="text-[10px] text-slate-500">{ROL_LABEL[miembro.rol].split(' ')[0]}</div>
        <div className="text-xs font-bold text-white truncate max-w-[110px]">{miembro.nombre}</div>
        {miembro.salud !== 'na' && <div className={`text-[9px] font-bold ${est.color}`}>{est.ic} {miembro.reportes_directos}</div>}
      </button>
      {propios.length > 0 && (
        <>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex gap-3 pt-1 border-t border-slate-700 relative">
            {propios.map((h) => (
              <div key={h.id} className="flex flex-col items-center pt-2">
                <NodoOrganigrama miembro={h} hijos={hijos} onClick={onClick} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Estructura() {
  const [miembros, setMiembros] = useState([]);
  const [salud, setSalud] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [miembroDetalle, setMiembroDetalle] = useState(null);
  const [vista, setVista] = useState('organigrama'); // 'organigrama' | 'lista'
  const [cargando, setCargando] = useState(true);

  const cargar = () => {
    Promise.all([api.get('/estructura'), api.get('/estructura/salud')]).then(([m, s]) => {
      setMiembros(m.data.data); setSalud(s.data.data); setCargando(false);
    });
  };
  useEffect(cargar, []);

  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;

  const raiz = miembros.filter((m) => !m.parent_id);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🗂️ Estructura de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
        </div>

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

        <div className="flex gap-2">
          <button onClick={() => setVista('organigrama')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'organigrama' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🌳 Organigrama</button>
          <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
        </div>

        {vista === 'organigrama' ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 overflow-x-auto">
            <div className="flex gap-8 justify-center min-w-max pb-2">
              {raiz.map((m) => <NodoOrganigrama key={m.id} miembro={m} hijos={miembros} onClick={setMiembroDetalle} />)}
            </div>
            <p className="text-center text-[10px] text-slate-600 mt-4">Toca cualquier persona para ver su detalle, cadena de invitación y editar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {miembros.map((m) => {
              const est = SALUD_ESTILO[m.salud] || SALUD_ESTILO.na;
              const actividad = estaActivoReciente(m.ultimo_acceso);
              return (
                <button key={m.id} onClick={() => setMiembroDetalle(m)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between hover:bg-slate-800/60 text-left">
                  <div className="flex items-center gap-2">
                    {actividad && <span className={`w-2 h-2 rounded-full ${PUNTO_ACTIVIDAD[actividad]}`} />}
                    <div>
                      <div className="text-sm font-bold text-white">{m.nombre}</div>
                      <div className="text-[10px] text-slate-500">{ROL_LABEL[m.rol]}{m.rol !== 'promotor' && ` · ${m.reportes_directos} a cargo`}</div>
                    </div>
                  </div>
                  {m.salud !== 'na' && <span className={`text-[10px] font-bold ${est.color}`}>{est.ic} {est.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {mostrarModal && <ModalAgregarMiembro miembros={miembros} onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
      {miembroDetalle && <ModalDetalleMiembro miembro={miembroDetalle} miembros={miembros} onCerrar={() => setMiembroDetalle(null)} onActualizado={cargar} />}
    </div>
  );
}

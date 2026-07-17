import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';

const TIPO_ICONO = { evento: '🎪', reunion: '👥', recorrido: '🚶', entrevista: '🎤' };
const TIPO_LABEL = { evento: 'Evento', reunion: 'Reunión', recorrido: 'Recorrido', entrevista: 'Entrevista' };

function FormularioEvento({ inicial, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
      <input placeholder="Título del evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
        {Object.entries(TIPO_ICONO).map(([k, v]) => <option key={k} value={k}>{v} {TIPO_LABEL[k]}</option>)}
      </select>
      <input type="datetime-local" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <BuscadorCalle valor={form.lugar} onSeleccion={(d) => setForm({ ...form, lugar: d.direccion_completa, lat: d.lat, lng: d.lng })} />
      <input placeholder="Sección (opcional)" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <textarea placeholder="Notas (opcional)" value={form.descripcion || ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
        <button onClick={() => onGuardar(form)} disabled={!form.titulo || !form.fecha_inicio}
          className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Guardar</button>
      </div>
    </div>
  );
}

function agruparPorFecha(eventos) {
  const ahora = new Date();
  const hoy = ahora.toDateString();
  const finSemana = new Date(ahora.getTime() + 7 * 86400000);

  const grupos = { hoy: [], semana: [], proximos: [], pasados: [] };
  eventos.forEach((e) => {
    const fecha = new Date(e.fecha_inicio);
    if (fecha.toDateString() === hoy) grupos.hoy.push(e);
    else if (fecha > ahora && fecha <= finSemana) grupos.semana.push(e);
    else if (fecha > finSemana) grupos.proximos.push(e);
    else grupos.pasados.push(e);
  });
  return grupos;
}

export default function Agenda() {
  const [params] = useSearchParams();
  const seccionUrl = params.get('seccion') ? parseInt(params.get('seccion')) : null;
  const [eventos, setEventos] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(!!seccionUrl);
  const [editandoId, setEditandoId] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [cargando, setCargando] = useState(true);

  const formVacio = { titulo: '', tipo: 'evento', fecha_inicio: '', lugar: '', seccion_numero: seccionUrl || '', descripcion: '', lat: null, lng: null };

  const cargar = () => { setCargando(true); api.get('/agenda').then((r) => { setEventos(r.data.data); setCargando(false); }); };
  useEffect(() => { cargar(); }, []);

  const crear = async (form) => {
    await api.post('/agenda', { ...form, seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined });
    setMostrarForm(false);
    cargar();
  };

  const editar = async (form) => {
    await api.patch(`/agenda/${editandoId}`, { ...form, seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined });
    setEditandoId(null);
    cargar();
  };

  const eliminar = async (id) => { if (confirm('¿Eliminar este evento?')) { await api.delete(`/agenda/${id}`); cargar(); } };
  const marcarRealizado = async (id) => { await api.patch(`/agenda/${id}/completar`); cargar(); };

  const eventosFiltrados = filtroTipo === 'todos' ? eventos : eventos.filter((e) => e.tipo === filtroTipo);
  const grupos = agruparPorFecha(eventosFiltrados);
  const eventoEditando = editandoId ? eventos.find((e) => e.id === editandoId) : null;
  const totalRealizados = eventos.filter((e) => e.realizado).length;

  const TarjetaEvento = ({ e }) => (
    <div className={`rounded-xl border p-4 ${e.realizado ? 'border-slate-800 bg-slate-900/30 opacity-60' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{TIPO_ICONO[e.tipo]}</span>
          <div>
            <div className="text-sm font-bold text-white">{e.titulo} {e.realizado && <span className="text-emerald-400 text-[10px]">✅ Realizado</span>}</div>
            <div className="text-[10px] text-slate-500">
              {new Date(e.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              {e.lugar && ` · ${e.lugar}`}
              {e.seccion_numero && ` · Secc. ${e.seccion_numero}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!e.realizado && <button onClick={() => marcarRealizado(e.id)} className="text-[10px] text-emerald-400 font-bold">✅</button>}
          <button onClick={() => setEditandoId(e.id)} className="text-[10px] text-indigo-400 font-bold">✏️</button>
          <button onClick={() => eliminar(e.id)} className="text-slate-600 hover:text-red-400 text-xs">🗑️</button>
        </div>
      </div>
      {e.descripcion && <p className="text-[10px] text-slate-400 mt-2 pl-11">{e.descripcion}</p>}
    </div>
  );

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

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFiltroTipo('todos')} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Todos</button>
            {Object.entries(TIPO_ICONO).map(([k, v]) => (
              <button key={k} onClick={() => setFiltroTipo(k)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${filtroTipo === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{v} {TIPO_LABEL[k]}</button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">{totalRealizados} realizados de {eventos.length}</span>
        </div>

        {mostrarForm && <FormularioEvento inicial={formVacio} onGuardar={crear} onCancelar={() => setMostrarForm(false)} />}
        {eventoEditando && (
          <FormularioEvento
            inicial={{ ...eventoEditando, fecha_inicio: eventoEditando.fecha_inicio?.slice(0, 16), seccion_numero: eventoEditando.seccion_numero || '' }}
            onGuardar={editar} onCancelar={() => setEditandoId(null)}
          />
        )}

        {cargando ? (
          <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="text-center text-slate-500 py-10">Sin eventos {filtroTipo !== 'todos' ? `de tipo ${TIPO_LABEL[filtroTipo]}` : 'programados'}</div>
        ) : (
          <div className="space-y-5">
            {grupos.hoy.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-indigo-400 uppercase mb-2">🔴 Hoy</h3>
                <div className="space-y-2">{grupos.hoy.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div>
              </div>
            )}
            {grupos.semana.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Esta semana</h3>
                <div className="space-y-2">{grupos.semana.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div>
              </div>
            )}
            {grupos.proximos.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Próximos</h3>
                <div className="space-y-2">{grupos.proximos.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div>
              </div>
            )}
            {grupos.pasados.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Pasados</h3>
                <div className="space-y-2">{grupos.pasados.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

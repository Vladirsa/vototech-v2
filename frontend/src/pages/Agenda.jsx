import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';
import AsistenteIA from '../components/AsistenteIA';

const TIPO_ICONO = { evento: '🎪', reunion: '👥', recorrido: '🚶', entrevista: '🎤' };
const TIPO_LABEL = { evento: 'Evento', reunion: 'Reunión', recorrido: 'Recorrido', entrevista: 'Entrevista' };
const ALERTA_COLOR = { azul: 'border-l-blue-500', amarillo: 'border-l-amber-500', rojo: 'border-l-red-500' };
const ALERTA_LABEL = { azul: '🔵 Normal', amarillo: '🟡 Importante', rojo: '🔴 Urgente' };

function FormularioEvento({ inicial, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial);
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
      <input placeholder="Título del evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <div className="flex gap-2">
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          {Object.entries(TIPO_ICONO).map(([k, v]) => <option key={k} value={k}>{v} {TIPO_LABEL[k]}</option>)}
        </select>
        <select value={form.color_alerta} onChange={(e) => setForm({ ...form, color_alerta: e.target.value })}
          className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          {Object.entries(ALERTA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <input type="datetime-local" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <BuscadorCalle valor={form.lugar} onSeleccion={(d) => setForm({ ...form, lugar: d.direccion_completa, lat: d.lat, lng: d.lng })} />
      <input placeholder="Sección (opcional)" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Notas / invitación</span>
        <AsistenteIA contexto="invitacion_evento" onTextoGenerado={(t) => setForm({ ...form, descripcion: t })} />
      </div>
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

/** Vista de calendario mensual — cuadrícula con puntos de color por
 * evento en cada día, tipo cualquier calendario normal. */
function VistaCalendarioMes({ eventos, mesActual, onCambiarMes, onDiaClick }) {
  const inicio = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
  const finalMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0);
  const primerDiaSemana = inicio.getDay();
  const dias = [];
  for (let i = 0; i < primerDiaSemana; i++) dias.push(null);
  for (let d = 1; d <= finalMes.getDate(); d++) dias.push(new Date(mesActual.getFullYear(), mesActual.getMonth(), d));

  const eventosPorDia = {};
  eventos.forEach((e) => {
    const clave = new Date(e.fecha_inicio).toDateString();
    if (!eventosPorDia[clave]) eventosPorDia[clave] = [];
    eventosPorDia[clave].push(e);
  });

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onCambiarMes(-1)} className="text-slate-400 px-2">←</button>
        <span className="text-sm font-bold text-white capitalize">{mesActual.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => onCambiarMes(1)} className="text-slate-400 px-2">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-slate-500 mb-1">
        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const eventosDia = eventosPorDia[dia.toDateString()] || [];
          const esHoy = dia.toDateString() === new Date().toDateString();
          return (
            <button key={i} onClick={() => eventosDia.length > 0 && onDiaClick(eventosDia)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] relative ${esHoy ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'}`}>
              {dia.getDate()}
              {eventosDia.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {eventosDia.slice(0, 3).map((e, j) => (
                    <span key={j} className={`w-1 h-1 rounded-full ${e.color_alerta === 'rojo' ? 'bg-red-400' : e.color_alerta === 'amarillo' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Vista de un solo día con franjas de hora — como Google Calendar,
 * de las 6am a las 10pm, con cada evento posicionado según su hora
 * real (no solo listado en orden). */
function VistaDia({ eventos, diaActual, onCambiarDia, onEditar }) {
  const HORAS = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00 a 22:00
  const ALTO_HORA = 56; // px por cada hora

  const eventosDelDia = eventos.filter((e) => new Date(e.fecha_inicio).toDateString() === diaActual.toDateString());
  const esHoy = diaActual.toDateString() === new Date().toDateString();

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-800">
        <button onClick={() => onCambiarDia(-1)} className="text-xs font-bold text-slate-400 px-2 py-1">‹ Anterior</button>
        <div className="text-center">
          <div className="text-sm font-bold text-white capitalize">{diaActual.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {!esHoy && <button onClick={() => onCambiarDia('hoy')} className="text-[10px] text-indigo-400 font-bold">Ir a hoy</button>}
        </div>
        <button onClick={() => onCambiarDia(1)} className="text-xs font-bold text-slate-400 px-2 py-1">Siguiente ›</button>
      </div>

      <div className="relative overflow-y-auto max-h-[70vh]" style={{ height: HORAS.length * ALTO_HORA }}>
        {HORAS.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 border-t border-slate-800/60 flex" style={{ top: i * ALTO_HORA, height: ALTO_HORA }}>
            <span className="text-[9px] text-slate-600 w-12 flex-shrink-0 -mt-1.5 pl-1">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}

        {eventosDelDia.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pl-12">
            <span className="text-xs text-slate-600">Sin eventos para este día</span>
          </div>
        )}

        {eventosDelDia.map((e) => {
          const fecha = new Date(e.fecha_inicio);
          const horaDecimal = fecha.getHours() + fecha.getMinutes() / 60;
          const top = Math.max(0, (horaDecimal - 6)) * ALTO_HORA;
          const colorBorde = e.color_alerta === 'rojo' ? 'border-l-red-500 bg-red-500/10' : e.color_alerta === 'amarillo' ? 'border-l-amber-500 bg-amber-500/10' : 'border-l-blue-500 bg-blue-500/10';
          return (
            <button key={e.id} onClick={() => onEditar(e.id)}
              className={`absolute left-14 right-2 rounded-lg border-l-4 ${colorBorde} px-2 py-1 text-left overflow-hidden hover:brightness-125`}
              style={{ top, minHeight: 44 }}>
              <div className="text-[11px] font-bold text-white truncate">{TIPO_ICONO[e.tipo]} {e.titulo}</div>
              <div className="text-[9px] text-slate-400">{fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}{e.lugar && ` · ${e.lugar}`}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelAnuncios() {
  const [anuncios, setAnuncios] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', mensaje: '', importante: false });

  const cargar = () => api.get('/agenda/anuncios/lista').then((r) => setAnuncios(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/agenda/anuncios/lista', form);
    setForm({ titulo: '', mensaje: '', importante: false });
    setMostrarForm(false);
    cargar();
  };
  const eliminar = async (id) => { await api.delete(`/agenda/anuncios/lista/${id}`); cargar(); };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Nuevo anuncio'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <textarea placeholder="Mensaje del anuncio" value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={form.importante} onChange={(e) => setForm({ ...form, importante: e.target.checked })} /> Marcar como importante (aparece arriba)
          </label>
          <button onClick={guardar} disabled={!form.titulo || !form.mensaje} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Publicar</button>
        </div>
      )}
      {anuncios.length === 0 ? (
        <div className="text-center text-slate-500 py-10">Sin anuncios todavía</div>
      ) : anuncios.map((a) => (
        <div key={a.id} className={`rounded-xl border p-3 ${a.importante ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
          <div className="flex justify-between items-start">
            <span className="text-sm font-bold text-white">{a.importante && '📌 '}{a.titulo}</span>
            <button onClick={() => eliminar(a.id)} className="text-red-500 text-xs">🗑️</button>
          </div>
          <p className="text-xs text-slate-300 mt-1">{a.mensaje}</p>
          <div className="text-[9px] text-slate-500 mt-2">{a.creado_por_nombre} · {new Date(a.creado_en).toLocaleDateString('es-MX')}</div>
        </div>
      ))}
    </div>
  );
}

export default function Agenda() {
  const [params] = useSearchParams();
  const seccionUrl = params.get('seccion') ? parseInt(params.get('seccion')) : null;
  const [eventos, setEventos] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(!!seccionUrl);
  const [editandoId, setEditandoId] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [vista, setVista] = useState('lista'); // 'lista' | 'dia' | 'calendario' | 'anuncios'
  const [diaActual, setDiaActual] = useState(new Date());
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);

  const formVacio = { titulo: '', tipo: 'evento', color_alerta: 'azul', fecha_inicio: '', lugar: '', seccion_numero: seccionUrl || '', descripcion: '', lat: null, lng: null };

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
    <div className={`rounded-xl border-l-4 ${ALERTA_COLOR[e.color_alerta || 'azul']} border-y border-r border-slate-800 p-4 ${e.realizado ? 'bg-slate-900/30 opacity-60' : 'bg-slate-900/60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{TIPO_ICONO[e.tipo]}</span>
          <div>
            <div className="text-sm font-bold text-white">{e.titulo} {e.realizado && <span className="text-emerald-400 text-[10px]">✅ Realizado</span>}</div>
            <div className="text-[10px] text-slate-500">
              {new Date(e.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              {e.lugar && ` · ${e.lugar}`}{e.seccion_numero && ` · Secc. ${e.seccion_numero}`}
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
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📅 Agenda</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          {vista !== 'anuncios' && (
            <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
              {mostrarForm ? 'Cancelar' : '+ Evento'}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
          <button onClick={() => setVista('dia')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'dia' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🕐 Día</button>
          <button onClick={() => setVista('calendario')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'calendario' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗓️ Mes</button>
          <button onClick={() => setVista('anuncios')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'anuncios' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📌 Anuncios</button>
        </div>

        {vista === 'lista' && (
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setFiltroTipo('todos')} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Todos</button>
              {Object.entries(TIPO_ICONO).map(([k, v]) => (
                <button key={k} onClick={() => setFiltroTipo(k)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${filtroTipo === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{v} {TIPO_LABEL[k]}</button>
              ))}
            </div>
            <span className="text-[10px] text-slate-500">{totalRealizados} realizados de {eventos.length}</span>
          </div>
        )}

        {mostrarForm && <FormularioEvento inicial={formVacio} onGuardar={crear} onCancelar={() => setMostrarForm(false)} />}
        {eventoEditando && (
          <FormularioEvento
            inicial={{ ...eventoEditando, fecha_inicio: eventoEditando.fecha_inicio?.slice(0, 16), seccion_numero: eventoEditando.seccion_numero || '', color_alerta: eventoEditando.color_alerta || 'azul' }}
            onGuardar={editar} onCancelar={() => setEditandoId(null)}
          />
        )}

        {vista === 'anuncios' ? (
          <PanelAnuncios />
        ) : vista === 'dia' ? (
          <VistaDia eventos={eventos} diaActual={diaActual}
            onCambiarDia={(d) => setDiaActual(d === 'hoy' ? new Date() : new Date(diaActual.getTime() + d * 86400000))}
            onEditar={setEditandoId} />
        ) : vista === 'calendario' ? (
          <>
            <VistaCalendarioMes eventos={eventos} mesActual={mesActual}
              onCambiarMes={(delta) => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + delta, 1))}
              onDiaClick={setDiaSeleccionado} />
            {diaSeleccionado && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Eventos de ese día</span>
                  <button onClick={() => setDiaSeleccionado(null)} className="text-[10px] text-slate-500">✕ Cerrar</button>
                </div>
                {diaSeleccionado.map((e) => <TarjetaEvento key={e.id} e={e} />)}
              </div>
            )}
          </>
        ) : cargando ? (
          <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="text-center text-slate-500 py-10">Sin eventos {filtroTipo !== 'todos' ? `de tipo ${TIPO_LABEL[filtroTipo]}` : 'programados'}</div>
        ) : (
          <div className="space-y-5">
            {grupos.hoy.length > 0 && (<div><h3 className="text-xs font-bold text-indigo-400 uppercase mb-2">🔴 Hoy</h3><div className="space-y-2">{grupos.hoy.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div></div>)}
            {grupos.semana.length > 0 && (<div><h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Esta semana</h3><div className="space-y-2">{grupos.semana.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div></div>)}
            {grupos.proximos.length > 0 && (<div><h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Próximos</h3><div className="space-y-2">{grupos.proximos.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div></div>)}
            {grupos.pasados.length > 0 && (<div><h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Pasados</h3><div className="space-y-2">{grupos.pasados.map((e) => <TarjetaEvento key={e.id} e={e} />)}</div></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

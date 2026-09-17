import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const ESTADO_ESTILO = {
  pendiente: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', color: 'text-slate-400', label: 'Pendiente' },
  en_proceso: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', color: 'text-amber-400', label: 'En Proceso' },
  completada: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', color: 'text-emerald-400', label: 'Completada' },
  cancelada: { bg: 'bg-red-500/10', border: 'border-red-500/30', color: 'text-red-400', label: 'Cancelada' },
};

/**
 * 🆕 Centro de Decisiones — primera pieza real: la Bitácora de
 * Decisiones. Registra qué se decidió, con base en qué, y da
 * seguimiento — nunca la IA escribe una decisión sola, siempre es
 * una acción explícita de la persona con sesión real.
 */
const ESTADO_TAREA_ESTILO = {
  pendiente: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', color: 'text-slate-400', label: 'Pendiente' },
  asignada: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', color: 'text-blue-400', label: 'Asignada' },
  en_proceso: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', color: 'text-amber-400', label: 'En Proceso' },
  bloqueada: { bg: 'bg-red-500/10', border: 'border-red-500/30', color: 'text-red-400', label: 'Bloqueada' },
  completada: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', color: 'text-emerald-400', label: 'Completada' },
  cancelada: { bg: 'bg-slate-700/10', border: 'border-slate-700/30', color: 'text-slate-500', label: 'Cancelada' },
};
const PRIORIDAD_COLOR = { baja: 'text-slate-500', media: 'text-blue-400', alta: 'text-amber-400', critica: 'text-red-400' };

/** 🆕 Centro de Tareas — acciones pendientes con responsable y fecha
 * límite. Cerrar (completar/cancelar) siempre es explícito. */
function PanelCentroTareas() {
  const [tareas, setTareas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ descripcion: '', origen: '', prioridad: 'media', fecha_limite: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    const q = filtroEstado !== 'todas' ? `?estado=${filtroEstado}` : '';
    api.get(`/centro-decisiones/tareas${q}`).then((r) => setTareas(r.data.data)).catch(() => setTareas([]));
  };
  useEffect(cargar, [filtroEstado]);

  const crear = async () => {
    if (!form.descripcion.trim()) return;
    setGuardando(true);
    try {
      await api.post('/centro-decisiones/tareas', form);
      setForm({ descripcion: '', origen: '', prioridad: 'media', fecha_limite: '' });
      setMostrarForm(false);
      cargar();
    } catch (e) { alert(e.response?.data?.error || 'No se pudo crear'); }
    setGuardando(false);
  };

  const cambiarEstado = async (id, estado) => {
    await api.patch(`/centro-decisiones/tareas/${id}`, { estado });
    cargar();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {[['todas', 'Todas'], ['pendiente', 'Pendientes'], ['en_proceso', 'En Proceso'], ['completada', 'Completadas']].map(([id, label]) => (
            <button key={id} onClick={() => setFiltroEstado(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtroEstado === id ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setMostrarForm(true)} className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold">➕ Nueva Tarea</button>
      </div>

      {mostrarForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-2">
          <textarea placeholder="¿Qué hay que hacer?" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
          <div className="flex gap-2">
            <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option>
            </select>
            <input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMostrarForm(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
            <button onClick={crear} disabled={guardando} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">{guardando ? '⏳...' : 'Crear tarea'}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tareas.length === 0 ? (
          <div className="text-center text-slate-500 py-10 text-sm">Sin tareas registradas</div>
        ) : tareas.map((t) => {
          const est = ESTADO_TAREA_ESTILO[t.estado] || ESTADO_TAREA_ESTILO.pendiente;
          return (
            <div key={t.id} className={`${est.bg} border ${est.border} rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-bold uppercase ${est.color}`}>{est.label}</span>
                <span className={`text-[9px] font-bold uppercase ${PRIORIDAD_COLOR[t.prioridad]}`}>{t.prioridad}</span>
              </div>
              <p className="text-sm text-white font-bold">{t.descripcion}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {t.responsable_nombre ? `Responsable: ${t.responsable_nombre}` : 'Sin responsable asignado'}
                {t.fecha_limite && ` · Fecha límite: ${new Date(t.fecha_limite).toLocaleDateString('es-MX')}`}
                {t.vencida && <span className="text-red-400 font-bold"> · VENCIDA</span>}
              </p>
              {!['completada', 'cancelada'].includes(t.estado) && (
                <div className="flex gap-1.5 mt-2">
                  {t.estado !== 'en_proceso' && <button onClick={() => cambiarEstado(t.id, 'en_proceso')} className="px-2.5 py-1 rounded-lg bg-amber-700/50 text-amber-300 text-[10px] font-bold">▶ En proceso</button>}
                  <button onClick={() => cambiarEstado(t.id, 'completada')} className="px-2.5 py-1 rounded-lg bg-emerald-700/50 text-emerald-300 text-[10px] font-bold">✓ Completar</button>
                  <button onClick={() => cambiarEstado(t.id, 'cancelada')} className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-400 text-[10px] font-bold">✕ Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CentroDecisiones() {
  const [tab, setTab] = useState('bitacora');
  const [decisiones, setDecisiones] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  // 🆕 Sugerencias del motor de análisis — nunca se registran solas,
  // solo llenan el formulario para que la persona revise y decida.
  const [sugerencias, setSugerencias] = useState([]);
  const [cargandoSugerencias, setCargandoSugerencias] = useState(true);
  const [sugerenciaParaUsar, setSugerenciaParaUsar] = useState(null);

  useEffect(() => {
    api.get('/centro-decisiones/sugerencias').then((r) => setSugerencias(r.data.data)).catch(() => setSugerencias([])).finally(() => setCargandoSugerencias(false));
  }, []);

  const usarSugerencia = (s) => { setSugerenciaParaUsar(s); setMostrarForm(true); };

  const cargar = () => {
    const query = filtroEstado !== 'todas' ? `?estado=${filtroEstado}` : '';
    api.get(`/centro-decisiones${query}`).then((r) => setDecisiones(r.data.data)).catch(() => setDecisiones([]));
  };
  useEffect(cargar, [filtroEstado]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🧭 Centro de Decisiones</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('bitacora')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'bitacora' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Bitácora de Decisiones</button>
          <button onClick={() => setTab('tareas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'tareas' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Centro de Tareas</button>
        </div>

        {tab === 'bitacora' && (
        <>
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 text-[11px] text-indigo-300">
          Bitácora de Decisiones — el sistema nunca registra una decisión por su cuenta. Cada entrada aquí es porque tú (o tu equipo de coordinación) tocó explícitamente "Registrar Decisión".
        </div>

        {/* 🆕 Sugerencias del motor de análisis */}
        {!cargandoSugerencias && sugerencias.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-amber-400 uppercase">💡 El sistema encontró esto — tú decides qué hacer</h2>
            {sugerencias.map((s, i) => (
              <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                <p className="text-sm text-white font-bold">{s.situacion_detectada}</p>
                <p className="text-[10px] text-slate-400 mt-1">📎 {s.datos_utilizados} · Fuente: {s.fuente}</p>
                <div className="mt-2 space-y-1">
                  {s.opciones_consideradas.map((op, j) => <p key={j} className="text-[11px] text-slate-300">• {op}</p>)}
                </div>
                <button onClick={() => usarSugerencia(s)} className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold">
                  Revisar y decidir →
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {[['todas', 'Todas'], ['pendiente', 'Pendientes'], ['en_proceso', 'En Proceso'], ['completada', 'Completadas'], ['cancelada', 'Canceladas']].map(([id, label]) => (
              <button key={id} onClick={() => setFiltroEstado(id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtroEstado === id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => { setSugerenciaParaUsar(null); setMostrarForm(true); }} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold">
            ➕ Registrar Decisión
          </button>
        </div>

        <div className="space-y-2">
          {decisiones.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">Sin decisiones registradas todavía</div>
          ) : decisiones.map((d) => {
            const est = ESTADO_ESTILO[d.estado] || ESTADO_ESTILO.pendiente;
            return (
              <button key={d.id} onClick={() => setDetalleId(d.id)}
                className={`w-full text-left ${est.bg} border ${est.border} rounded-xl p-3 hover:opacity-90`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-bold uppercase ${est.color}`}>{est.label}</span>
                  <span className="text-[9px] text-slate-500">{new Date(d.creado_en).toLocaleDateString('es-MX')}</span>
                </div>
                <p className="text-sm text-white font-bold">{d.situacion_detectada}</p>
                <p className="text-xs text-slate-400 mt-1">→ {d.decision_tomada}</p>
                {d.responsable_nombre && <p className="text-[10px] text-slate-500 mt-1">Responsable: {d.responsable_nombre}{d.fecha_limite ? ` · Fecha límite: ${new Date(d.fecha_limite).toLocaleDateString('es-MX')}` : ''}</p>}
              </button>
            );
          })}
        </div>
        </>
        )}

        {tab === 'tareas' && <PanelCentroTareas />}

      </div>

      {mostrarForm && <ModalRegistrarDecision sugerenciaInicial={sugerenciaParaUsar} onCerrar={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); cargar(); }} />}
      {detalleId && <ModalDetalleDecision id={detalleId} onCerrar={() => setDetalleId(null)} onActualizado={cargar} />}
    </div>
  );
}

function ModalRegistrarDecision({ sugerenciaInicial, onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    situacion_detectada: sugerenciaInicial?.situacion_detectada || '',
    datos_utilizados: sugerenciaInicial?.datos_utilizados || '',
    fuente: sugerenciaInicial?.fuente || '',
    analisis: '',
    opciones_consideradas: sugerenciaInicial?.opciones_consideradas?.map((o) => `• ${o}`).join('\n') || '',
    decision_tomada: '', accion: '', fecha_limite: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (!form.situacion_detectada.trim() || !form.decision_tomada.trim()) {
      setError('La situación detectada y la decisión tomada son obligatorias');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/centro-decisiones', form);
      onGuardado();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo guardar'); }
    setGuardando(false);
  };

  const campo = (clave, label, placeholder, requerido) => (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-1">{label}{requerido && ' *'}</label>
      <textarea value={form[clave]} onChange={(e) => setForm({ ...form, [clave]: e.target.value })} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Registrar Decisión</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        {sugerenciaInicial && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[10px] text-amber-300">
            💡 Esto viene de una sugerencia del sistema — la situación y los datos ya están llenos. Falta que tú escribas qué decidiste hacer.
          </div>
        )}

        {campo('situacion_detectada', 'Situación detectada', '¿Qué se observó? (ej: la sección 178 lleva 12 días sin actividad)', true)}
        {campo('datos_utilizados', 'Datos utilizados', '¿Qué números respaldan esto?')}
        <input value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} placeholder="Fuente (ej: Ficha de Sección, módulo Reportes)"
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        {campo('analisis', 'Análisis', '¿Qué se interpretó de esos datos?')}
        {campo('opciones_consideradas', 'Opciones consideradas', '¿Qué alternativas se evaluaron?')}
        {campo('decision_tomada', 'Decisión tomada', '¿Qué se decidió hacer, en concreto?', true)}
        {campo('accion', 'Acción', '¿Qué acción concreta se va a ejecutar?')}
        <input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
        <button onClick={guardar} disabled={guardando} className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold disabled:opacity-40">
          {guardando ? '⏳ Guardando...' : '✅ Registrar Decisión'}
        </button>
      </div>
    </div>
  );
}

function ModalDetalleDecision({ id, onCerrar, onActualizado }) {
  const [decision, setDecision] = useState(null);
  const [resultado, setResultado] = useState('');
  const [seguimiento, setSeguimiento] = useState('');
  const [estado, setEstado] = useState('');

  useEffect(() => {
    api.get(`/centro-decisiones/${id}`).then((r) => {
      setDecision(r.data.data);
      setResultado(r.data.data.resultado || '');
      setSeguimiento(r.data.data.seguimiento || '');
      setEstado(r.data.data.estado);
    });
  }, [id]);

  const guardar = async () => {
    await api.patch(`/centro-decisiones/${id}`, { resultado, seguimiento, estado });
    onActualizado();
    onCerrar();
  };

  if (!decision) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Detalle de Decisión</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        <div className="space-y-2 text-xs">
          <div><span className="text-slate-500">Situación detectada:</span> <p className="text-slate-200">{decision.situacion_detectada}</p></div>
          {decision.datos_utilizados && <div><span className="text-slate-500">Datos utilizados:</span> <p className="text-slate-200">{decision.datos_utilizados}</p></div>}
          {decision.fuente && <div><span className="text-slate-500">Fuente:</span> <p className="text-slate-200">{decision.fuente}</p></div>}
          {decision.analisis && <div><span className="text-slate-500">Análisis:</span> <p className="text-slate-200">{decision.analisis}</p></div>}
          {decision.opciones_consideradas && <div><span className="text-slate-500">Opciones consideradas:</span> <p className="text-slate-200">{decision.opciones_consideradas}</p></div>}
          <div><span className="text-slate-500">Decisión tomada:</span> <p className="text-slate-200 font-bold">{decision.decision_tomada}</p></div>
          {decision.accion && <div><span className="text-slate-500">Acción:</span> <p className="text-slate-200">{decision.accion}</p></div>}
          <div className="text-[10px] text-slate-500">Registrado por {decision.creado_por_nombre || 'alguien de tu equipo'} el {new Date(decision.creado_en).toLocaleString('es-MX')}</div>
        </div>

        <div className="border-t border-slate-800 pt-3 space-y-2">
          <label className="block text-xs font-bold text-slate-400">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En Proceso</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <label className="block text-xs font-bold text-slate-400">Resultado</label>
          <textarea value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="¿Qué pasó después de esta decisión?"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
          <label className="block text-xs font-bold text-slate-400">Seguimiento</label>
          <textarea value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} placeholder="Notas de seguimiento"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
          <button onClick={guardar} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

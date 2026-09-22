import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';
import BitacoraDiaria from './BitacoraDiaria';

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

const NIVEL_ALERTA_ESTILO = {
  critica: { bg: 'bg-red-500/10', border: 'border-red-500/30', color: 'text-red-400' },
  alta: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', color: 'text-orange-400' },
  media: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', color: 'text-amber-400' },
  baja: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', color: 'text-blue-400' },
  informativa: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', color: 'text-slate-400' },
};
const ESTADO_ALERTA_LABEL = { nueva: 'Nueva', en_revision: 'En Revisión', asignada: 'Asignada', en_proceso: 'En Proceso', resuelta: 'Resuelta', descartada: 'Descartada' };

// 🆕 Mensaje de WhatsApp sugerido según el tipo de alerta — SIEMPRE
// editable antes de mandarlo (se abre en WhatsApp del propio celular,
// nunca se manda solo). Nadie de la campaña recibe un mensaje sin que
// una persona real lo haya revisado primero.
function mensajeWhatsAppAlerta(a) {
  const nombre = (a.responsable_nombre || '').split(' ')[0] || 'equipo';
  if (a.tipo === 'responsable_sin_actividad') {
    return `Hola ${nombre} 👋 Soy del equipo de campaña. Vi que no has registrado actividad en los últimos días — ¿todo bien? Cuenta con nosotros para lo que necesites, sé que puedes lograr la meta. ¡Vamos con todo! 💪🗳️`;
  }
  if (a.tipo === 'incidencia_sin_resolver') {
    return `Hola ${nombre}, tenemos una incidencia pendiente desde hace varios días: "${a.descripcion}". ¿Me ayudas a darle seguimiento hoy mismo? Gracias 🙏`;
  }
  if (a.tipo === 'gasto_cerca_del_tope') {
    return `Hola ${nombre}, el gasto de la campaña ya va en ${a.valor_actual} del tope permitido. Necesitamos revisar juntos los próximos gastos antes de autorizar más. ¿Podemos hablar hoy?`;
  }
  return `Hola ${nombre}, te escribo por esto: ${a.descripcion}`;
}

/** 🆕 Motor de Alertas — ahora es la pestaña principal. Ya no es solo
 * una lista para revisar a mano: cada alerta trae 3 acciones directas
 * — mandar WhatsApp de motivación/seguimiento, registrar la decisión,
 * o crear una tarea con dueño — para que un coordinador con poco
 * tiempo actúe con un toque en vez de tener que "ir a llenar algo". */
function PanelMotorAlertas({ onRegistrar }) {
  const [alertas, setAlertas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('activas');
  const [generando, setGenerando] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const [creandoTareaId, setCreandoTareaId] = useState(null);

  const cargar = () => {
    const q = filtroEstado === 'activas' ? '' : `?estado=${filtroEstado}`;
    api.get(`/centro-decisiones/alertas${q}`).then((r) => setAlertas(r.data.data)).catch(() => setAlertas([]));
  };
  useEffect(cargar, [filtroEstado]);

  const generar = async () => {
    setGenerando(true);
    try {
      const { data } = await api.post('/centro-decisiones/alertas/generar');
      setUltimoResultado(data.data);
      cargar();
    } catch (e) { /* silencioso */ }
    setGenerando(false);
  };

  const cambiarEstado = async (id, estado) => {
    await api.patch(`/centro-decisiones/alertas/${id}`, { estado });
    cargar();
  };

  // 🆕 Un toque crea la tarea con la descripción de la alerta lista
  // — nadie tiene que volver a escribir lo que el sistema ya detectó.
  const crearTarea = async (a) => {
    setCreandoTareaId(a.id);
    try {
      await api.post('/centro-decisiones/tareas', {
        descripcion: a.descripcion,
        origen: a.modulo_origen,
        prioridad: a.nivel === 'critica' ? 'critica' : a.nivel === 'alta' ? 'alta' : 'media',
        fecha_limite: '',
      });
      await cambiarEstado(a.id, 'asignada');
    } catch (e) { alert('No se pudo crear la tarea'); }
    setCreandoTareaId(null);
  };

  return (
    <div className="space-y-3">
      <button onClick={generar} disabled={generando} className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 text-white text-sm font-bold disabled:opacity-40">
        {generando ? '⏳ Revisando...' : '🔍 Ejecutar revisión de alertas'}
      </button>
      {ultimoResultado && (
        <p className="text-[10px] text-slate-500 text-center">
          {ultimoResultado.creadas} nueva(s) · {ultimoResultado.actualizadas} siguen activas · {ultimoResultado.resueltas_automaticamente} resuelta(s) sola(s) porque la condición ya no existe
        </p>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {[['activas', 'Activas'], ['todas', 'Todas'], ['resuelta', 'Resueltas'], ['descartada', 'Descartadas']].map(([id, label]) => (
          <button key={id} onClick={() => setFiltroEstado(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtroEstado === id ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {alertas.length === 0 ? (
          <div className="text-center text-slate-500 py-10 text-sm">Sin alertas — ejecuta la revisión para ver si hay algo</div>
        ) : alertas.map((a) => {
          const est = NIVEL_ALERTA_ESTILO[a.nivel] || NIVEL_ALERTA_ESTILO.informativa;
          return (
            <div key={a.id} className={`${est.bg} border ${est.border} rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-bold uppercase ${est.color}`}>{a.nivel}</span>
                <span className="text-[9px] text-slate-500">{a.modulo_origen} · {ESTADO_ALERTA_LABEL[a.estado]}</span>
              </div>
              <p className="text-sm text-white font-bold">{a.descripcion}</p>
              <p className="text-[10px] text-slate-500 mt-1">Actual: {a.valor_actual} · Referencia: {a.valor_referencia}{a.responsable_nombre && ` · Responsable: ${a.responsable_nombre}`}</p>
              {!['resuelta', 'descartada'].includes(a.estado) && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {/* 🆕 Acción principal — 1 toque, sin formularios */}
                  {a.responsable_telefono && (
                    <a href={`https://wa.me/52${String(a.responsable_telefono).replace(/\D/g, '')}?text=${encodeURIComponent(mensajeWhatsAppAlerta(a))}`}
                      target="_blank" rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-green-700/60 text-green-200 text-[10px] font-bold">
                      📲 WhatsApp
                    </a>
                  )}
                  <button onClick={() => onRegistrar && onRegistrar(a)} className="px-2.5 py-1 rounded-lg bg-indigo-700/50 text-indigo-300 text-[10px] font-bold">✅ Registrar decisión</button>
                  <button onClick={() => crearTarea(a)} disabled={creandoTareaId === a.id} className="px-2.5 py-1 rounded-lg bg-teal-700/50 text-teal-300 text-[10px] font-bold disabled:opacity-40">
                    {creandoTareaId === a.id ? '⏳...' : '📋 Crear tarea'}
                  </button>
                  {a.estado === 'nueva' && <button onClick={() => cambiarEstado(a.id, 'en_revision')} className="px-2.5 py-1 rounded-lg bg-blue-700/50 text-blue-300 text-[10px] font-bold">👁 Revisar</button>}
                  <button onClick={() => cambiarEstado(a.id, 'resuelta')} className="px-2.5 py-1 rounded-lg bg-emerald-700/50 text-emerald-300 text-[10px] font-bold">✓ Resolver</button>
                  <button onClick={() => cambiarEstado(a.id, 'descartada')} className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-400 text-[10px] font-bold">✕ Descartar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 🆕 Simulador — modificar variables sin tocar la base. La
 * simulación se distingue visualmente del dato real en TODO
 * momento, y nunca se guarda como si fuera real. */
function PanelSimulador() {
  const [base, setBase] = useState(null);
  const [promovidosAdicionalesDia, setPromovidosAdicionalesDia] = useState(0);
  const [diasSimulados, setDiasSimulados] = useState(0);

  useEffect(() => {
    api.get('/centro-decisiones/escenarios/base').then((r) => {
      setBase(r.data.data);
      setDiasSimulados(r.data.data.dias_restantes || 0);
    }).catch(() => setBase(null));
  }, []);

  if (!base) return <div className="text-center text-slate-500 py-10 text-sm">⏳ Cargando datos reales de partida...</div>;

  const ritmoSimulado = base.ritmo_actual_diario + promovidosAdicionalesDia;
  const proyeccion = Math.round(base.comprometidos_actuales + ritmoSimulado * diasSimulados);
  const diferenciaVsMeta = base.meta_votos ? proyeccion - base.meta_votos : null;

  return (
    <div className="space-y-3">
      {/* DATOS REALES — siempre visualmente distinto de la simulación */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">📊 Datos Reales de Partida</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-slate-500">Comprometidos hoy:</span> <span className="text-white font-bold">{base.comprometidos_actuales}</span></div>
          <div><span className="text-slate-500">Meta:</span> <span className="text-white font-bold">{base.meta_votos || 'Sin configurar'}</span></div>
          <div><span className="text-slate-500">Ritmo actual:</span> <span className="text-white font-bold">{base.ritmo_actual_diario}/día</span></div>
          <div><span className="text-slate-500">Días restantes:</span> <span className="text-white font-bold">{base.dias_restantes ?? 'Sin fecha'}</span></div>
        </div>
      </div>

      {/* Controles de simulación */}
      <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-bold text-pink-300 uppercase">🔮 Ajusta la Simulación</div>
        <div>
          <label className="text-xs text-slate-300">¿Qué pasa si el ritmo diario cambia en: <strong className="text-white">{promovidosAdicionalesDia > 0 ? '+' : ''}{promovidosAdicionalesDia}</strong>?</label>
          <input type="range" min="-20" max="50" value={promovidosAdicionalesDia} onChange={(e) => setPromovidosAdicionalesDia(parseInt(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-xs text-slate-300">¿Durante cuántos días? <strong className="text-white">{diasSimulados}</strong></label>
          <input type="range" min="0" max={Math.max(60, base.dias_restantes || 60)} value={diasSimulados} onChange={(e) => setDiasSimulados(parseInt(e.target.value))} className="w-full" />
        </div>
      </div>

      {/* RESULTADO SIMULADO — nunca se confunde con dato real */}
      <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 border-2 border-pink-500/50 rounded-xl p-4">
        <div className="text-[10px] font-bold text-pink-300 uppercase mb-2">⚠️ RESULTADO SIMULADO — no es un dato real, es una proyección</div>
        <div className="text-2xl font-black text-white">{proyeccion.toLocaleString('es-MX')} comprometidos</div>
        {diferenciaVsMeta !== null && (
          <p className={`text-sm font-bold mt-1 ${diferenciaVsMeta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {diferenciaVsMeta >= 0 ? `META SUPERADA por ${diferenciaVsMeta.toLocaleString('es-MX')}` : `FALTARÍAN ${Math.abs(diferenciaVsMeta).toLocaleString('es-MX')} para la meta`}
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-2">Ritmo simulado: {ritmoSimulado.toFixed(1)}/día × {diasSimulados} días + {base.comprometidos_actuales} actuales. Esta simulación no se guarda ni afecta ningún dato real.</p>
      </div>
    </div>
  );
}

/** 🆕 Auditoría del propio Centro de Decisiones — quién consultó
 * qué, cuándo, y qué acción tomó. Registrado automáticamente por
 * middleware, nunca a mano (así nunca falta un endpoint). */
function PanelAuditoriaCD() {
  const [registros, setRegistros] = useState([]);

  useEffect(() => {
    api.get('/centro-decisiones/auditoria').then((r) => setRegistros(r.data.data)).catch(() => setRegistros([]));
  }, []);

  return (
    <div className="space-y-2">
      <div className="bg-slate-500/10 border border-slate-500/30 rounded-xl p-3 text-[11px] text-slate-400">
        🔍 Cada consulta y acción dentro de Centro de Decisiones queda aquí — automático, nunca a mano. Sirve para reconstruir qué vio cada persona y qué decidió.
      </div>
      {registros.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">Sin registros todavía</div>
      ) : registros.map((r) => (
        <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white font-bold">{r.accion}</span>
            <span className="text-[9px] text-slate-500">{new Date(r.creado_en).toLocaleString('es-MX')}</span>
          </div>
          <p className="text-[10px] text-slate-500">{r.usuario_nombre || 'Sistema'}</p>
        </div>
      ))}
    </div>
  );
}

/** 🆕 Histórico Avanzado — serie de tiempo real con detección de
 * anomalías por desviación estándar (no una opinión visual). */
function PanelHistoricoAvanzado() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    api.get(`/centro-decisiones/historico?dias=${dias}`).then((r) => setDatos(r.data.data)).catch(() => setDatos(null));
  }, [dias]);

  if (!datos) return <div className="text-center text-slate-500 py-10 text-sm">⏳ Cargando...</div>;

  const max = Math.max(1, ...datos.puntos.map((p) => p.promovidos));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[[14, '14 días'], [30, '30 días'], [90, '90 días']].map(([n, label]) => (
          <button key={n} onClick={() => setDias(n)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${dias === n ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{label}</button>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-end gap-0.5 h-32 overflow-x-auto">
          {datos.puntos.map((p) => (
            <div key={p.fecha} className="flex-1 min-w-[6px] flex flex-col items-center justify-end h-full group relative">
              <div className={`w-full rounded-t ${p.es_anomalia ? 'bg-red-500' : 'bg-blue-500'}`} style={{ height: `${Math.max(2, (p.promovidos / max) * 100)}%` }} />
              {p.es_anomalia && <span className="absolute -top-4 text-[10px]">⚠️</span>}
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-500 mt-2">Promedio diario: {datos.promedio_diario} · {datos.total_anomalias} día(s) marcado(s) como anomalía (rojo)</p>
      </div>

      <div className="bg-slate-500/10 border border-slate-500/30 rounded-xl p-3 text-[10px] text-slate-400">
        📐 {datos.metodo}
      </div>

      {datos.puntos.filter((p) => p.es_anomalia).length > 0 && (
        <div className="space-y-1.5">
          {datos.puntos.filter((p) => p.es_anomalia).map((p) => (
            <div key={p.fecha} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
              {new Date(p.fecha).toLocaleDateString('es-MX')}: {p.promovidos} promovidos (se aleja mucho del promedio de {datos.promedio_diario})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PERMISOS_INFO = {
  VIEW: 'Ver el contenido de Centro de Decisiones',
  AI: 'Usar el asistente de IA (cuando esté disponible)',
  SCENARIOS: 'Usar el Simulador de escenarios',
  REPORTS: 'Generar reportes desde este módulo',
  DECISION_LOG: 'Registrar y actualizar decisiones en la Bitácora',
  EXPORT: 'Exportar información de Centro de Decisiones',
  ADMIN: 'Otorgar/quitar permisos a otras personas (como este panel)',
};

/** 🆕 Panel de Permisos — solo candidato/jefe_campana. Otorgar o
 * quitar cualquiera de los 7 permisos granulares a una persona. */
function PanelPermisosCD() {
  const [equipo, setEquipo] = useState([]);
  const [personaId, setPersonaId] = useState('');
  const [permisos, setPermisos] = useState([]);

  useEffect(() => { api.get('/estructura').then((r) => setEquipo(r.data.data)).catch(() => setEquipo([])); }, []);

  const cargarPermisos = (id) => {
    setPersonaId(id);
    if (!id) { setPermisos([]); return; }
    api.get(`/centro-decisiones/permisos/${id}`).then((r) => setPermisos(r.data.data)).catch(() => setPermisos([]));
  };

  const toggle = async (permiso) => {
    if (permisos.includes(permiso)) {
      await api.delete('/centro-decisiones/permisos', { data: { usuario_id: personaId, permiso } });
      setPermisos(permisos.filter((p) => p !== permiso));
    } else {
      await api.post('/centro-decisiones/permisos', { usuario_id: personaId, permiso });
      setPermisos([...permisos, permiso]);
    }
  };

  const persona = equipo.find((u) => u.id === personaId);
  const tieneTodoAutomatico = persona && ['candidato', 'jefe_campana'].includes(persona.rol);

  return (
    <div className="space-y-3">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-[11px] text-red-300">
        🔐 Ser administrador general del sistema NO da acceso automático aquí — cada persona necesita que se le otorgue cada permiso explícitamente (excepto candidato/jefe de campaña, que siempre tienen todo).
      </div>

      <select value={personaId} onChange={(e) => cargarPermisos(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm">
        <option value="">Elige una persona...</option>
        {equipo.filter((u) => !['candidato', 'jefe_campana'].includes(u.rol)).map((u) => <option key={u.id} value={u.id}>{u.nombre} — {u.rol}</option>)}
      </select>

      {personaId && (
        <div className="space-y-2">
          {Object.entries(PERMISOS_INFO).map(([permiso, descripcion]) => (
            <label key={permiso} className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3 cursor-pointer">
              <input type="checkbox" checked={permisos.includes(permiso)} onChange={() => toggle(permiso)} className="w-4 h-4" />
              <div>
                <p className="text-sm text-white font-bold">{permiso}</p>
                <p className="text-[10px] text-slate-500">{descripcion}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** 🆕 Asistente IA con trazabilidad total — nunca inventa, y cada
 * respuesta se puede abrir en "Ver Fuentes" para ver exactamente
 * qué datos se usaron. */
function PanelAsistenteIA() {
  const [pregunta, setPregunta] = useState('');
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [fuentesAbiertas, setFuentesAbiertas] = useState(null);

  const PREGUNTAS_SUGERIDAS = ['¿Qué está pasando hoy?', '¿Qué alertas requieren revisión?', '¿Qué metas están cubiertas?', 'Muéstrame el histórico'];

  const preguntar = async (texto) => {
    const p = texto || pregunta;
    if (!p.trim()) return;
    setCargando(true);
    setPregunta('');
    try {
      const { data } = await api.post('/centro-decisiones/asistente', { pregunta: p });
      setHistorial([...historial, { pregunta: p, ...data.data }]);
    } catch (e) {
      setHistorial([...historial, { pregunta: p, respuesta: e.response?.data?.error || 'No se pudo responder', fuentes: null }]);
    }
    setCargando(false);
  };

  return (
    <div className="space-y-3">
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-3 text-[11px] text-violet-300">
        🤖 Analiza SOLO datos reales de tu campaña. Si no hay suficiente información para responder, te lo dice claramente — nunca inventa un número.
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {PREGUNTAS_SUGERIDAS.map((p) => (
          <button key={p} onClick={() => preguntar(p)} className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">{p}</button>
        ))}
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {historial.map((h, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-xs text-slate-400 text-right">{h.pregunta}</p>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{h.respuesta}</p>
              {h.fuentes && (
                <button onClick={() => setFuentesAbiertas(fuentesAbiertas === i ? null : i)} className="mt-2 text-[10px] text-violet-400 font-bold">
                  {fuentesAbiertas === i ? '▲ Ocultar fuentes' : '▼ Ver fuentes'}
                </button>
              )}
              {fuentesAbiertas === i && (
                <pre className="mt-2 text-[9px] text-slate-500 bg-slate-950 rounded-lg p-2 overflow-x-auto">{JSON.stringify(h.fuentes, null, 2)}</pre>
              )}
            </div>
          </div>
        ))}
        {cargando && <div className="text-center text-slate-500 text-xs">⏳ Analizando...</div>}
      </div>

      <div className="flex gap-2">
        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && preguntar()}
          placeholder="¿Qué quieres analizar?" className="flex-1 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm" />
        <button onClick={() => preguntar()} disabled={cargando} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40">Enviar</button>
      </div>
    </div>
  );
}

// 🆕 Constructor de Reportes se quitó de aquí — hacía EXACTAMENTE lo
// mismo que "Reportes Personalizados" (Inteligencia Electoral →
// Reportes), así que ya no tenía razón de estar duplicado en Centro
// de Decisiones.

export default function CentroDecisiones({ embed = false }) {
  // 🆕 candidato/jefe_campana siempre tienen acceso total (regla de
  // la skill) — solo ellos ven la pestaña de administrar permisos.
  const usuario = useAuth((s) => s.usuario);
  const puedeAdministrarPermisos = ['candidato', 'jefe_campana'].includes(usuario?.rol);
  const [tab, setTab] = useState('alertas');
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
  // 🆕 Igual que una sugerencia, pero armada a partir de una alerta
  // ya detectada — así el botón "Registrar decisión" de cada alerta
  // abre el mismo formulario, ya prellenado.
  const usarAlerta = (a) => usarSugerencia({
    situacion_detectada: a.descripcion,
    datos_utilizados: `Actual: ${a.valor_actual} · Referencia: ${a.valor_referencia}`,
    fuente: a.modulo_origen,
    opciones_consideradas: [],
  });

  const cargar = () => {
    const query = filtroEstado !== 'todas' ? `?estado=${filtroEstado}` : '';
    api.get(`/centro-decisiones${query}`).then((r) => setDecisiones(r.data.data)).catch(() => setDecisiones([]));
  };
  useEffect(cargar, [filtroEstado]);

  // 🆕 embed=true: se usa cuando este componente se pinta como UNA
  // pestaña más dentro de Inteligencia Electoral (ya no es una ruta
  // separada) — en ese caso no repetimos el fondo de pantalla completo
  // ni el título "Centro de Decisiones" con su propio link a Dashboard,
  // porque Inteligencia Electoral ya puso todo eso arriba.
  return (
    <div className={embed ? '' : 'min-h-screen bg-slate-950'}>
      <div className={embed ? 'space-y-4' : 'max-w-5xl mx-auto p-4 md:p-8 space-y-4'}>
        {!embed && (
          <div>
            <h1 className="text-2xl font-black text-white">🧭 Centro de Decisiones</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* 🆕 "Alertas" ahora abre primero — es donde el sistema te
              dice qué necesita tu atención HOY, con acción de 1 toque
              (WhatsApp / registrar / crear tarea). Ya no hay que "ir
              a llenar" nada para que esto sirva. */}
          <button onClick={() => setTab('alertas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'alertas' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🚨 Alertas y Sugerencias</button>
          <button onClick={() => setTab('bitacora')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'bitacora' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Bitácora de Decisiones</button>
          {/* 🆕 Bitácora de Campo (antes vivía en "Movilización y Operación") — distinta de la Bitácora de Decisiones de arriba: esta es el registro diario de campo (recorridos, incidencias, pendientes, etc.), no las decisiones tomadas. */}
          <button onClick={() => setTab('bitacora-campo')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'bitacora-campo' ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📔 Bitácora de Campo</button>
          <button onClick={() => setTab('tareas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'tareas' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Centro de Tareas</button>
          <button onClick={() => setTab('simulador')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'simulador' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔮 Simulador</button>
          <button onClick={() => setTab('asistente')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'asistente' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🤖 Asistente IA</button>
          <button onClick={() => setTab('auditoria-cd')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'auditoria-cd' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔍 Auditoría</button>
          <button onClick={() => setTab('historico-cd')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'historico-cd' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📉 Histórico</button>
          {puedeAdministrarPermisos && (
            <button onClick={() => setTab('permisos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'permisos' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔐 Permisos</button>
          )}
        </div>

        {tab === 'alertas' && (
        <>
        {/* 🆕 Sugerencias del motor de análisis — se quedan arriba de
            las alertas guardadas, mismo espíritu: el sistema detecta,
            la persona decide. */}
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
        <PanelMotorAlertas onRegistrar={usarAlerta} />
        </>
        )}

        {tab === 'bitacora' && (
        <>
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 text-[11px] text-indigo-300">
          Bitácora de Decisiones — el sistema nunca registra una decisión por su cuenta. Cada entrada aquí es porque tú (o tu equipo de coordinación) tocó explícitamente "Registrar Decisión".
        </div>

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

        {tab === 'bitacora-campo' && <BitacoraDiaria />}
        {tab === 'tareas' && <PanelCentroTareas />}
        {tab === 'simulador' && <PanelSimulador />}
        {tab === 'asistente' && <PanelAsistenteIA />}
        {tab === 'auditoria-cd' && <PanelAuditoriaCD />}
        {tab === 'historico-cd' && <PanelHistoricoAvanzado />}
        {tab === 'permisos' && puedeAdministrarPermisos && <PanelPermisosCD />}

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

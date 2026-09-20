import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';

/**
 * 🆕 BITÁCORA DIARIA (Etapa 1 del rediseño)
 * ─────────────────────────────────────────
 * Registro cronológico de la jornada: recorridos, reuniones,
 * incidencias, pendientes y notas libres, con línea de tiempo y
 * cierre de día. Mobile-first — pensado para capturarse parado en
 * la calle, con el celular en una mano.
 *
 * Vive como PESTAÑA dentro de "Movilización y Operación" (mismo
 * patrón que Promovidos/Agenda/Logística/Incidencias) — por eso NO
 * trae su propio encabezado de página ni el link "← Dashboard": eso
 * ya lo pone MovilizacionOperacion.jsx, que es quien la monta.
 *
 * Dónde se conecta:
 * - Al registrar una "Incidencia" con sección, se espeja automático
 *   en el módulo Incidencias (lo hace el backend, no este archivo).
 * - Los "Pendientes" quedan disponibles aquí mismo hasta que alguien
 *   los marca como resueltos — no se pierden al cambiar de día.
 */

const TIPOS = [
  { id: 'recorrido', ic: '🚶', label: 'Recorrido' },
  { id: 'reunion', ic: '🤝', label: 'Reunión' },
  { id: 'incidencia', ic: '⚠️', label: 'Incidencia' },
  { id: 'pendiente', ic: '📌', label: 'Pendiente' },
  { id: 'nota', ic: '📝', label: 'Nota' },
];

const COLOR_TIPO = {
  recorrido: 'border-blue-500/40 bg-blue-500/5',
  reunion: 'border-emerald-500/40 bg-emerald-500/5',
  incidencia: 'border-red-500/40 bg-red-500/5',
  pendiente: 'border-amber-500/40 bg-amber-500/5',
  nota: 'border-slate-600/40 bg-slate-800/30',
  cierre_jornada: 'border-purple-500/40 bg-purple-500/5',
};

const COLOR_PRIORIDAD = { alta: 'bg-red-500/20 text-red-300', media: 'bg-amber-500/20 text-amber-300', baja: 'bg-slate-600/30 text-slate-300' };

function horaCorta(fechaISO) {
  return new Date(fechaISO).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function BitacoraDiaria() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [vista, setVista] = useState('hoy'); // 'hoy' | 'pendientes'
  const [eventos, setEventos] = useState([]);
  const [pendientesTodos, setPendientesTodos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarTodo = useCallback(() => {
    setCargando(true);
    const params = { fecha };
    if (filtroTipo) params.tipo = filtroTipo;
    Promise.all([
      api.get('/bitacora', { params }),
      api.get('/bitacora/resumen-dia', { params: { fecha } }),
      api.get('/bitacora/pendientes'),
    ])
      .then(([r1, r2, r3]) => {
        setEventos(r1.data.data);
        setResumen(r2.data.data);
        setPendientesTodos(r3.data.data);
      })
      .catch(() => setError('No se pudo cargar la bitácora. Revisa tu conexión.'))
      .finally(() => setCargando(false));
  }, [fecha, filtroTipo]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  return (
    <div className="space-y-4 pb-24">
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-xs text-red-300">{error}</div>
        )}

        {/* ── Resumen del día ─────────────────────────────────── */}
        {resumen && (
          <div className="grid grid-cols-3 gap-2">
            <TarjetaResumen valor={resumen.total_eventos_hoy} label="Eventos hoy" color="text-white" />
            <TarjetaResumen valor={resumen.pendientes_abiertos_total} label="Pendientes" color="text-amber-400" />
            <TarjetaResumen
              valor={resumen.ya_cerre_hoy ? '✓' : '—'}
              label={resumen.ya_cerre_hoy ? 'Jornada cerrada' : 'Sin cerrar'}
              color={resumen.ya_cerre_hoy ? 'text-emerald-400' : 'text-slate-400'}
            />
          </div>
        )}

        {/* ── Pestañas: Hoy / Pendientes ──────────────────────── */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button onClick={() => setVista('hoy')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${vista === 'hoy' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            🕐 Línea de tiempo
          </button>
          <button onClick={() => setVista('pendientes')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${vista === 'pendientes' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📌 Pendientes {pendientesTodos.length > 0 && `(${pendientesTodos.length})`}
          </button>
        </div>

        {vista === 'hoy' ? (
          <>
            {/* Selector de fecha + filtro por tipo */}
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200" />
              <div className="flex gap-1.5 flex-wrap">
                <ChipTipo activo={filtroTipo === null} onClick={() => setFiltroTipo(null)} label="Todos" />
                {TIPOS.map((t) => (
                  <ChipTipo key={t.id} activo={filtroTipo === t.id} onClick={() => setFiltroTipo(t.id)} label={`${t.ic} ${t.label}`} />
                ))}
              </div>
            </div>

            {/* Línea de tiempo */}
            {cargando ? (
              <p className="text-sm text-slate-500 text-center py-8">Cargando…</p>
            ) : eventos.length === 0 ? (
              <EstadoVacio texto="Todavía no hay nada registrado este día. Usa el botón + de abajo para el primer registro." />
            ) : (
              <div className="space-y-2">
                {eventos.map((ev) => <TarjetaEvento key={ev.id} evento={ev} onResuelto={cargarTodo} />)}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            {pendientesTodos.length === 0 ? (
              <EstadoVacio texto="No hay pendientes abiertos. 🎉" />
            ) : (
              pendientesTodos.map((p) => <TarjetaPendiente key={p.id} pendiente={p} onResuelto={cargarTodo} />)
            )}
          </div>
        )}

      {/* ── Botones flotantes ──────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-3 items-end">
        {!resumen?.ya_cerre_hoy && (
          <button onClick={() => setMostrarCierre(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg shadow-purple-900/40">
            🌙 Cerrar jornada
          </button>
        )}
        <button onClick={() => setMostrarFormulario(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white w-14 h-14 rounded-full shadow-lg shadow-indigo-900/40 text-2xl font-bold flex items-center justify-center">
          +
        </button>
      </div>

      {mostrarFormulario && (
        <FormularioRegistro
          onCerrar={() => setMostrarFormulario(false)}
          onGuardado={() => { setMostrarFormulario(false); cargarTodo(); }}
          guardando={guardando}
          setGuardando={setGuardando}
        />
      )}
      {mostrarCierre && (
        <ModalCierre
          onCerrar={() => setMostrarCierre(false)}
          onGuardado={() => { setMostrarCierre(false); cargarTodo(); }}
        />
      )}
    </div>
  );
}

function TarjetaResumen({ valor, label, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
      <p className={`text-xl font-black ${color}`}>{valor}</p>
      <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">{label}</p>
    </div>
  );
}

function ChipTipo({ activo, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
        activo ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
      }`}>
      {label}
    </button>
  );
}

function EstadoVacio({ texto }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-4xl mb-2">📔</p>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
  );
}

function TarjetaEvento({ evento, onResuelto }) {
  const [resolviendo, setResolviendo] = useState(false);

  async function marcarResuelto() {
    setResolviendo(true);
    try {
      await api.patch(`/bitacora/${evento.id}/resolver`, { estado: 'resuelto' });
      onResuelto();
    } catch {
      alert('No se pudo marcar como resuelto. Intenta de nuevo.');
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <div className={`rounded-xl border p-3 ${COLOR_TIPO[evento.tipo] || COLOR_TIPO.nota}`}>
      <div className="flex gap-2.5 items-start">
        <span className="text-lg flex-shrink-0">{evento.icono}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-100 truncate">{evento.titulo}</p>
            <span className="text-[10px] text-slate-500 flex-shrink-0">{horaCorta(evento.creado_en)}</span>
          </div>
          {evento.descripcion && <p className="text-xs text-slate-400 mt-0.5 whitespace-pre-line">{evento.descripcion}</p>}
          <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
            <span className="text-[10px] text-slate-500">{evento.usuario_nombre}</span>
            {evento.seccion_numero && <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Sección {evento.seccion_numero}</span>}
            {evento.tipo === 'pendiente' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${COLOR_PRIORIDAD[evento.prioridad] || COLOR_PRIORIDAD.baja}`}>
                {evento.estado === 'resuelto' ? '✓ Resuelto' : evento.prioridad}
              </span>
            )}
          </div>
          {evento.tipo === 'pendiente' && evento.estado !== 'resuelto' && (
            <button onClick={marcarResuelto} disabled={resolviendo}
              className="mt-2 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
              {resolviendo ? 'Guardando…' : '✓ Marcar como resuelto'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaPendiente({ pendiente, onResuelto }) {
  const [resolviendo, setResolviendo] = useState(false);
  async function marcarResuelto() {
    setResolviendo(true);
    try {
      await api.patch(`/bitacora/${pendiente.id}/resolver`, { estado: 'resuelto' });
      onResuelto();
    } catch {
      alert('No se pudo marcar como resuelto.');
    } finally {
      setResolviendo(false);
    }
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-100">{pendiente.titulo}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${COLOR_PRIORIDAD[pendiente.prioridad]}`}>{pendiente.prioridad}</span>
      </div>
      {pendiente.descripcion && <p className="text-xs text-slate-400 mt-1">{pendiente.descripcion}</p>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-slate-500">
          {pendiente.usuario_nombre} · {new Date(pendiente.creado_en).toLocaleDateString('es-MX')}
          {pendiente.seccion_numero && ` · Sección ${pendiente.seccion_numero}`}
        </span>
        <button onClick={marcarResuelto} disabled={resolviendo}
          className="text-[11px] font-bold text-emerald-400 disabled:opacity-50">
          {resolviendo ? '…' : '✓ Resolver'}
        </button>
      </div>
    </div>
  );
}

function FormularioRegistro({ onCerrar, onGuardado, guardando, setGuardando }) {
  const [tipo, setTipo] = useState('recorrido');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [seccionNumero, setSeccionNumero] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [error, setError] = useState('');

  async function guardar() {
    if (titulo.trim().length < 3) { setError('Escribe al menos 3 letras en el título'); return; }
    setGuardando(true);
    setError('');
    try {
      await api.post('/bitacora', {
        tipo, titulo: titulo.trim(), descripcion: descripcion.trim() || undefined,
        seccion_numero: seccionNumero ? parseInt(seccionNumero) : undefined,
        prioridad: tipo === 'pendiente' ? prioridad : undefined,
      });
      onGuardado();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Nuevo registro</h2>
          <button onClick={onCerrar} className="text-slate-400 text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-colors ${
                tipo === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
              <span className="text-lg">{t.ic}</span>
              {t.label}
            </button>
          ))}
        </div>

        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="¿Qué pasó? (título corto)"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />

        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle (opcional)" rows={3}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 resize-none" />

        <input value={seccionNumero} onChange={(e) => setSeccionNumero(e.target.value.replace(/\D/g, ''))} placeholder="Número de sección (opcional)" inputMode="numeric"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />

        {tipo === 'pendiente' && (
          <div className="flex gap-2">
            {['baja', 'media', 'alta'].map((p) => (
              <button key={p} onClick={() => setPrioridad(p)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize ${prioridad === p ? COLOR_PRIORIDAD[p] : 'bg-slate-800 text-slate-500'}`}>
                {p}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button onClick={guardar} disabled={guardando}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
          {guardando ? 'Guardando…' : 'Guardar registro'}
        </button>
      </div>
    </div>
  );
}

function ModalCierre({ onCerrar, onGuardado }) {
  const [resumen, setResumen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function cerrar() {
    setGuardando(true);
    setError('');
    try {
      await api.post('/bitacora/cierre-jornada', { resumen: resumen.trim() || undefined });
      onGuardado();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo cerrar la jornada.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-4 space-y-3">
        <h2 className="text-base font-bold text-white">🌙 Cerrar jornada</h2>
        <p className="text-xs text-slate-400">Se guarda un resumen automático de todo lo registrado hoy. Puedes agregar una nota final si quieres.</p>
        <textarea value={resumen} onChange={(e) => setResumen(e.target.value)} placeholder="Nota final del día (opcional)" rows={3}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 resize-none" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCerrar} className="flex-1 bg-slate-800 text-slate-300 font-bold py-3 rounded-xl text-sm">Cancelar</button>
          <button onClick={cerrar} disabled={guardando} className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm">
            {guardando ? 'Cerrando…' : 'Cerrar jornada'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import api, { descargarArchivo } from '../lib/api';

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
 *
 * 🆕 NUEVO EN ESTA VERSIÓN (sub-fase 1a del Banco de Ideas):
 * - Se ampliaron los tipos de registro de 5 a 13 (los que pide el
 *   documento: Visita, Evento, Asignación, Cambio de responsable,
 *   Tarea, Seguimiento, Evidencia, Otro).
 * - Filtros territoriales/organizativos completos (Municipio,
 *   Distrito Federal, Distrito Local, Cargo/rol) — antes solo se
 *   podía filtrar por número de sección escrito a mano.
 * - Buscador de texto libre sobre título y descripción.
 * - Vista Día / Semana / Mes — antes solo existía un selector de un
 *   solo día.
 *
 * 🆕 NUEVO EN ESTA VERSIÓN (sub-fase 1c del Banco de Ideas):
 * - Repositorio de Evidencias: cada registro de la línea de tiempo
 *   puede llevar fotos (hasta 8), reutilizando el mismo sistema de
 *   subida/compresión que ya usan Incidencias/Actas/Casas — no se
 *   duplica infraestructura.
 * - Botón "Descargar reporte de cierre" (PDF) dentro del modal de
 *   Cerrar jornada: resumen del día + incidencias abiertas + línea
 *   de tiempo completa, listo para imprimir o compartir.
 */

const TIPOS = [
  { id: 'recorrido', ic: '🚶', label: 'Recorrido' },
  { id: 'reunion', ic: '🤝', label: 'Reunión' },
  { id: 'incidencia', ic: '⚠️', label: 'Incidencia' },
  { id: 'pendiente', ic: '📌', label: 'Pendiente' },
  { id: 'visita', ic: '🚪', label: 'Visita' },
  { id: 'evento', ic: '🎪', label: 'Evento' },
  { id: 'asignacion', ic: '🧩', label: 'Asignación' },
  { id: 'cambio_responsable', ic: '🔄', label: 'Cambio de responsable' },
  { id: 'tarea', ic: '✅', label: 'Tarea' },
  { id: 'seguimiento', ic: '🔎', label: 'Seguimiento' },
  { id: 'evidencia', ic: '📷', label: 'Evidencia' },
  { id: 'nota', ic: '📝', label: 'Observación' },
  { id: 'otro', ic: '📄', label: 'Otro' },
];

const COLOR_TIPO = {
  recorrido: 'border-blue-500/40 bg-blue-500/5',
  reunion: 'border-emerald-500/40 bg-emerald-500/5',
  incidencia: 'border-red-500/40 bg-red-500/5',
  pendiente: 'border-amber-500/40 bg-amber-500/5',
  visita: 'border-cyan-500/40 bg-cyan-500/5',
  evento: 'border-pink-500/40 bg-pink-500/5',
  asignacion: 'border-indigo-500/40 bg-indigo-500/5',
  cambio_responsable: 'border-orange-500/40 bg-orange-500/5',
  tarea: 'border-teal-500/40 bg-teal-500/5',
  seguimiento: 'border-violet-500/40 bg-violet-500/5',
  evidencia: 'border-fuchsia-500/40 bg-fuchsia-500/5',
  nota: 'border-slate-600/40 bg-slate-800/30',
  otro: 'border-slate-600/40 bg-slate-800/30',
  cierre_jornada: 'border-purple-500/40 bg-purple-500/5',
};

const COLOR_PRIORIDAD = { alta: 'bg-red-500/20 text-red-300', media: 'bg-amber-500/20 text-amber-300', baja: 'bg-slate-600/30 text-slate-300' };

function horaCorta(fechaISO) {
  return new Date(fechaISO).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// 🆕 Calcula el rango de fechas (inicio/fin, formato YYYY-MM-DD) que
// corresponde a la vista Semana o Mes, a partir de una fecha ancla.
// 'dia' regresa null porque ese caso usa ?fecha= sencillo, no rango.
function calcularRango(vistaFecha, fechaAncla) {
  if (vistaFecha === 'dia') return null;
  const ancla = new Date(`${fechaAncla}T00:00:00`);
  if (vistaFecha === 'semana') {
    // Semana de lunes a domingo.
    const diaSemana = (ancla.getDay() + 6) % 7; // 0 = lunes
    const inicio = new Date(ancla); inicio.setDate(ancla.getDate() - diaSemana);
    const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6);
    return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
  }
  // 'mes'
  const inicio = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const fin = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0);
  return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

export default function BitacoraDiaria() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [vistaFecha, setVistaFecha] = useState('dia'); // 🆕 'dia' | 'semana' | 'mes'
  const [vista, setVista] = useState('hoy'); // 'hoy' | 'pendientes'
  const [eventos, setEventos] = useState([]);
  const [pendientesTodos, setPendientesTodos] = useState([]);
  const [resumen, setResumen] = useState(null);
  // 🆕 sub-fase 1b — "¿Qué pasó hoy?" / "¿Qué cambió?" / Incidencias abiertas
  const [resumenTexto, setResumenTexto] = useState(null);
  const [mostrarQueCambio, setMostrarQueCambio] = useState(false);
  const [incidenciasAbiertas, setIncidenciasAbiertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // 🆕 Filtros territoriales/organizativos + buscador
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [catalogosFiltro, setCatalogosFiltro] = useState({ municipios: [], distritos_federales: [], distritos_locales: [], roles: [] });
  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [filtroDistritoFederal, setFiltroDistritoFederal] = useState('');
  const [filtroDistritoLocal, setFiltroDistritoLocal] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [textoBuscar, setTextoBuscar] = useState('');

  useEffect(() => {
    api.get('/bitacora/filtros').then((r) => setCatalogosFiltro(r.data.data)).catch(() => {});
  }, []);

  const filtrosActivos = [filtroMunicipio, filtroDistritoFederal, filtroDistritoLocal, filtroRol, textoBuscar].filter(Boolean).length;

  const cargarTodo = useCallback(() => {
    setCargando(true);
    const params = {};
    const rango = calcularRango(vistaFecha, fecha);
    if (rango) { params.fecha_inicio = rango.inicio; params.fecha_fin = rango.fin; }
    else params.fecha = fecha;
    if (filtroTipo) params.tipo = filtroTipo;
    if (filtroMunicipio) params.municipio_id = filtroMunicipio;
    if (filtroDistritoFederal) params.distrito_federal = filtroDistritoFederal;
    if (filtroDistritoLocal) params.distrito_local = filtroDistritoLocal;
    if (filtroRol) params.rol = filtroRol;
    if (textoBuscar.trim()) params.texto = textoBuscar.trim();

    Promise.all([
      api.get('/bitacora', { params }),
      api.get('/bitacora/resumen-dia', { params: { fecha } }),
      api.get('/bitacora/pendientes'),
      api.get('/bitacora/resumen-texto', { params: { fecha } }),
      api.get('/bitacora/incidencias-abiertas'),
    ])
      .then(([r1, r2, r3, r4, r5]) => {
        setEventos(r1.data.data);
        setResumen(r2.data.data);
        setPendientesTodos(r3.data.data);
        setResumenTexto(r4.data.data);
        setIncidenciasAbiertas(r5.data.data);
      })
      .catch(() => setError('No se pudo cargar la bitácora. Revisa tu conexión.'))
      .finally(() => setCargando(false));
  }, [fecha, vistaFecha, filtroTipo, filtroMunicipio, filtroDistritoFederal, filtroDistritoLocal, filtroRol, textoBuscar]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const limpiarFiltros = () => {
    setFiltroMunicipio(''); setFiltroDistritoFederal(''); setFiltroDistritoLocal(''); setFiltroRol(''); setTextoBuscar('');
  };

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

        {/* 🆕 "¿Qué pasó hoy?" — frase automática, solo con datos reales */}
        {resumenTexto && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">📋 ¿Qué pasó hoy?</p>
            <p className="text-sm text-slate-200">{resumenTexto.resumen_texto}</p>
            <button onClick={() => setMostrarQueCambio((v) => !v)} className="text-[11px] font-bold text-indigo-400 mt-2">
              {mostrarQueCambio ? '▾ Ocultar "¿Qué cambió?"' : '▸ Ver "¿Qué cambió?"'}
            </button>
            {mostrarQueCambio && (
              <div className="mt-2 space-y-3">
                <ComparativoCambio titulo="Hoy vs. ayer" datos={resumenTexto.que_cambio.hoy_vs_ayer} />
                <ComparativoCambio titulo="Esta semana vs. semana anterior" datos={resumenTexto.que_cambio.semana_vs_semana_anterior} />
              </div>
            )}
          </div>
        )}

        {/* ── Pestañas: Hoy / Pendientes / Incidencias ────────── */}
        <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button onClick={() => setVista('hoy')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${vista === 'hoy' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            🕐 Línea de tiempo
          </button>
          <button onClick={() => setVista('pendientes')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${vista === 'pendientes' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📌 Pendientes {pendientesTodos.length > 0 && `(${pendientesTodos.length})`}
          </button>
          {/* 🆕 sub-fase 1b — Incidencias abiertas visibles aquí mismo, sin salir a otra pestaña */}
          <button onClick={() => setVista('incidencias')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${vista === 'incidencias' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            ⚠️ Incidencias {incidenciasAbiertas.length > 0 && `(${incidenciasAbiertas.length})`}
          </button>
        </div>

        {vista === 'incidencias' && (
          <div className="space-y-2">
            {incidenciasAbiertas.length === 0 ? (
              <EstadoVacio texto="No hay incidencias abiertas. 🎉" />
            ) : (
              incidenciasAbiertas.map((inc) => <TarjetaIncidencia key={inc.id} incidencia={inc} />)
            )}
          </div>
        )}

        {vista === 'hoy' ? (
          <>
            {/* 🆕 Selector Día / Semana / Mes */}
            <div className="flex gap-1.5">
              {[{ id: 'dia', label: 'Día' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }].map((v) => (
                <button key={v.id} onClick={() => setVistaFecha(v.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${vistaFecha === v.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {v.label}
                </button>
              ))}
            </div>

            {/* Selector de fecha (ancla — para semana/mes marca el día dentro del rango) + filtro por tipo */}
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200" />
              <button onClick={() => setMostrarFiltros((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${filtrosActivos > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                🗂️ Filtros {filtrosActivos > 0 && `(${filtrosActivos})`}
              </button>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              <ChipTipo activo={filtroTipo === null} onClick={() => setFiltroTipo(null)} label="Todos" />
              {TIPOS.map((t) => (
                <ChipTipo key={t.id} activo={filtroTipo === t.id} onClick={() => setFiltroTipo(t.id)} label={`${t.ic} ${t.label}`} />
              ))}
            </div>

            {/* 🆕 Panel de filtros territoriales/organizativos + buscador */}
            {mostrarFiltros && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5">
                <input value={textoBuscar} onChange={(e) => setTextoBuscar(e.target.value)} placeholder="🔎 Buscar en bitácora..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                <div className="grid grid-cols-2 gap-2">
                  <SelectorFiltro label="Municipio" value={filtroMunicipio} onChange={setFiltroMunicipio}
                    opciones={catalogosFiltro.municipios.map((m) => ({ value: m.id, label: m.nombre }))} />
                  <SelectorFiltro label="Cargo/rol" value={filtroRol} onChange={setFiltroRol}
                    opciones={catalogosFiltro.roles.map((r) => ({ value: r, label: r }))} />
                  <SelectorFiltro label="Distrito Federal" value={filtroDistritoFederal} onChange={setFiltroDistritoFederal}
                    opciones={catalogosFiltro.distritos_federales.map((d) => ({ value: d, label: `Distrito ${d}` }))} />
                  <SelectorFiltro label="Distrito Local" value={filtroDistritoLocal} onChange={setFiltroDistritoLocal}
                    opciones={catalogosFiltro.distritos_locales.map((d) => ({ value: d, label: `Distrito ${d}` }))} />
                </div>
                {filtrosActivos > 0 && (
                  <button onClick={limpiarFiltros} className="text-[11px] font-bold text-red-400">✕ Limpiar filtros</button>
                )}
              </div>
            )}

            {/* Línea de tiempo */}
            {cargando ? (
              <p className="text-sm text-slate-500 text-center py-8">Cargando…</p>
            ) : eventos.length === 0 ? (
              <EstadoVacio texto="No hay nada registrado en este periodo. Usa el botón + de abajo para el primer registro." />
            ) : (
              <div className="space-y-2">
                {eventos.map((ev) => <TarjetaEvento key={ev.id} evento={ev} onResuelto={cargarTodo} mostrarFecha={vistaFecha !== 'dia'} />)}
              </div>
            )}
          </>
        ) : vista === 'pendientes' ? (
          <div className="space-y-2">
            {pendientesTodos.length === 0 ? (
              <EstadoVacio texto="No hay pendientes abiertos. 🎉" />
            ) : (
              pendientesTodos.map((p) => <TarjetaPendiente key={p.id} pendiente={p} onResuelto={cargarTodo} />)
            )}
          </div>
        ) : null}

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

// 🆕 Selector genérico para los filtros territoriales/organizativos.
function SelectorFiltro({ label, value, onChange, opciones }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
        <option value="">Todos</option>
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
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

function TarjetaEvento({ evento, onResuelto, mostrarFecha }) {
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
            {/* 🆕 En vista Semana/Mes se muestra fecha además de hora, para no perderse entre varios días */}
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {mostrarFecha ? new Date(evento.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' · ' : ''}
              {horaCorta(evento.creado_en)}
            </span>
          </div>
          {evento.descripcion && <p className="text-xs text-slate-400 mt-0.5 whitespace-pre-line">{evento.descripcion}</p>}
          <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
            <span className="text-[10px] text-slate-500">{evento.usuario_nombre}</span>
            {evento.municipio_nombre && <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{evento.municipio_nombre}</span>}
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
          {/* 🆕 sub-fase 1c — Evidencias fotográficas del registro */}
          <EvidenciasEvento eventoId={evento.id} totalInicial={evento.total_evidencias} />
        </div>
      </div>
    </div>
  );
}

// 🆕 Repositorio de Evidencias por registro de bitácora. Reutiliza el
// endpoint genérico de fotos (POST /api/fotos/subir, contexto='bitacora')
// que ya usan Incidencias/Actas/Casas — no se sube nada a un sistema
// aparte. Máximo 8 fotos por registro (lo controla el backend).
function EvidenciasEvento({ eventoId, totalInicial }) {
  const [abierto, setAbierto] = useState(false);
  const [fotos, setFotos] = useState(null); // null = aún no se han cargado
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const total = fotos ? fotos.length : (totalInicial || 0);

  const cargarFotos = useCallback(() => {
    api.get(`/fotos/bitacora/${eventoId}`)
      .then((r) => setFotos(r.data.data))
      .catch(() => setError('No se pudieron cargar las evidencias.'));
  }, [eventoId]);

  function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && fotos === null) cargarFotos();
  }

  async function subirFoto(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    try {
      const datos = new FormData();
      datos.append('foto', archivo);
      datos.append('contexto', 'bitacora');
      datos.append('referencia_id', eventoId);
      await api.post('/fotos/subir', datos, { headers: { 'Content-Type': 'multipart/form-data' } });
      cargarFotos();
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo subir la foto. Intenta de nuevo.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function borrarFoto(id) {
    if (!confirm('¿Borrar esta foto?')) return;
    try {
      await api.delete(`/fotos/${id}`);
      setFotos((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setError('No se pudo borrar la foto.');
    }
  }

  return (
    <div className="mt-2">
      <button onClick={alternar} className="text-[11px] font-bold text-slate-400 hover:text-slate-300 flex items-center gap-1">
        📷 Evidencias {total > 0 && `(${total})`} {abierto ? '▾' : '▸'}
      </button>
      {abierto && (
        <div className="mt-1.5">
          {fotos === null ? (
            <p className="text-[11px] text-slate-500">Cargando…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {fotos.map((f) => (
                <div key={f.id} className="relative w-16 h-16 flex-shrink-0">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt="Evidencia" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
                  </a>
                  <button onClick={() => borrarFoto(f.id)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center leading-none">✕</button>
                </div>
              ))}
              {(fotos.length < 8) && (
                <label className="w-16 h-16 flex-shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-xl cursor-pointer">
                  {subiendo ? '…' : '+'}
                  <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={subirFoto} disabled={subiendo} className="hidden" />
                </label>
              )}
            </div>
          )}
          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}

// 🆕 "¿Qué cambió?" — cada renglón muestra anterior/actual/cambio,
// SIN decir si es bueno o malo (la persona decide cómo leerlo).
function ComparativoCambio({ titulo, datos }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-300">{titulo}</p>
        <p className={`text-xs font-black ${datos.cambio > 0 ? 'text-emerald-400' : datos.cambio < 0 ? 'text-red-400' : 'text-slate-500'}`}>
          {datos.anterior} → {datos.actual} ({datos.cambio > 0 ? '+' : ''}{datos.cambio})
        </p>
      </div>
      {datos.detalle.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {datos.detalle.slice(0, 6).map((d) => (
            <div key={d.tipo} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{d.etiqueta}</span>
              <span className="text-slate-300">{d.anterior} → {d.actual} <span className={d.cambio > 0 ? 'text-emerald-400' : d.cambio < 0 ? 'text-red-400' : 'text-slate-500'}>({d.cambio > 0 ? '+' : ''}{d.cambio})</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 🆕 Panel de Incidencias abiertas dentro de Bitácora — reutiliza la
// misma tabla del módulo Incidencias, no duplica nada.
function TarjetaIncidencia({ incidencia }) {
  const COLOR_URGENCIA = { urgente: 'bg-red-500/20 text-red-300', alta: 'bg-orange-500/20 text-orange-300', media: 'bg-amber-500/20 text-amber-300', baja: 'bg-slate-600/30 text-slate-300' };
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-100 capitalize">{incidencia.tipo?.replace(/_/g, ' ')}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${COLOR_URGENCIA[incidencia.urgencia] || COLOR_URGENCIA.baja}`}>{incidencia.urgencia}</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{incidencia.descripcion}</p>
      <div className="flex flex-wrap gap-1.5 mt-1.5 items-center text-[10px] text-slate-500">
        {incidencia.reportado_por_nombre && <span>Reportó: {incidencia.reportado_por_nombre}</span>}
        {incidencia.municipio_nombre && <span className="bg-slate-800 px-1.5 py-0.5 rounded">{incidencia.municipio_nombre}</span>}
        {incidencia.seccion_numero && <span className="bg-slate-800 px-1.5 py-0.5 rounded">Sección {incidencia.seccion_numero}</span>}
        <span>{new Date(incidencia.creado_en).toLocaleDateString('es-MX')}</span>
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

        {/* 🆕 Ahora son 13 tipos (antes 5) — se acomodan en 5 columnas, varias filas */}
        <div className="grid grid-cols-5 gap-1.5">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[9px] font-bold transition-colors ${
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
  const hoy = new Date().toISOString().slice(0, 10);

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
        {/* 🆕 sub-fase 1c — Reporte de cierre en PDF: resumen del día +
            incidencias abiertas + línea de tiempo completa. Se puede
            descargar antes o después de cerrar la jornada. */}
        <button onClick={() => descargarArchivo(`/reportes/pdf/bitacora-cierre?fecha=${hoy}`, 'reporte_cierre_jornada.pdf')}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs">
          📄 Descargar reporte de cierre (PDF)
        </button>
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

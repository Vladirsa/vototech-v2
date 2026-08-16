import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';

const TIPO_ICONO = { evento: '🎪', reunion: '👥', recorrido: '🚶', entrevista: '🎤' };
const TIPO_LABEL = { evento: 'Evento', reunion: 'Reunión', recorrido: 'Recorrido', entrevista: 'Entrevista' };

// 🆕 8 colores para clasificar — antes solo había 3 (azul/amarillo/
// rojo). Los nombres coinciden exactamente con lo que acepta el
// backend (COLORES_VALIDOS en agenda.js).
const COLOR_ESTILO = {
  indigo:  { borde: 'border-l-indigo-500',  bg: 'bg-indigo-500/10',  punto: 'bg-indigo-400',  swatch: 'bg-indigo-500',  texto: 'text-indigo-300',  label: 'Normal' },
  emerald: { borde: 'border-l-emerald-500', bg: 'bg-emerald-500/10', punto: 'bg-emerald-400', swatch: 'bg-emerald-500', texto: 'text-emerald-300', label: 'Confirmado fuerte' },
  amber:   { borde: 'border-l-amber-500',   bg: 'bg-amber-500/10',   punto: 'bg-amber-400',   swatch: 'bg-amber-500',   texto: 'text-amber-300',   label: 'Importante' },
  red:     { borde: 'border-l-red-500',     bg: 'bg-red-500/10',     punto: 'bg-red-400',     swatch: 'bg-red-500',     texto: 'text-red-300',     label: 'Urgente/Crisis' },
  purple:  { borde: 'border-l-purple-500',  bg: 'bg-purple-500/10',  punto: 'bg-purple-400',  swatch: 'bg-purple-500',  texto: 'text-purple-300',  label: 'Estratégico' },
  pink:    { borde: 'border-l-pink-500',    bg: 'bg-pink-500/10',    punto: 'bg-pink-400',    swatch: 'bg-pink-500',    texto: 'text-pink-300',    label: 'Medios/Prensa' },
  cyan:    { borde: 'border-l-cyan-500',    bg: 'bg-cyan-500/10',    punto: 'bg-cyan-400',    swatch: 'bg-cyan-500',    texto: 'text-cyan-300',    label: 'Digital/Redes' },
  slate:   { borde: 'border-l-slate-500',   bg: 'bg-slate-500/10',   punto: 'bg-slate-400',   swatch: 'bg-slate-500',   texto: 'text-slate-300',   label: 'Interno/Bajo perfil' },
};

// 🆕 Estado de aprobación — solo Candidato o Secretario Particular
// pueden mover una reunión de "propuesta" a "confirmado" (o rechazarla).
const ESTADO_ESTILO = {
  propuesto: { label: '⏳ Propuesta — pendiente de aprobación', color: 'bg-amber-500/20 text-amber-300' },
  confirmado: { label: '✅ Confirmado', color: 'bg-emerald-500/20 text-emerald-300' },
  cancelado: { label: '❌ Rechazado/Cancelado', color: 'bg-red-500/20 text-red-300' },
};

const TIPO_LUGAR_LABEL = { calle: 'Calle', auditorio: 'Auditorio', deportivo: 'Deportivo', parque: 'Parque', otro: 'Otro' };

function FormularioEvento({ inicial, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial);
  const [etiquetaNueva, setEtiquetaNueva] = useState('');

  const agregarEtiqueta = () => {
    if (!etiquetaNueva.trim()) return;
    setForm({ ...form, etiquetas: [...(form.etiquetas || []), etiquetaNueva.trim()] });
    setEtiquetaNueva('');
  };
  const quitarEtiqueta = (i) => setForm({ ...form, etiquetas: form.etiquetas.filter((_, idx) => idx !== i) });

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
      <input placeholder="Título del evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

      <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
        {Object.entries(TIPO_ICONO).map(([k, v]) => <option key={k} value={k}>{v} {TIPO_LABEL[k]}</option>)}
      </select>

      {/* 🆕 Selector visual de color — 8 opciones, se ve mejor que un dropdown */}
      <div>
        <label className="text-[10px] text-slate-500 font-bold block mb-1.5">Color de clasificación</label>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(COLOR_ESTILO).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setForm({ ...form, color_alerta: k })}
              title={v.label}
              className={`w-8 h-8 rounded-full ${v.swatch} ${form.color_alerta === k ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-50'}`} />
          ))}
        </div>
        <p className="text-[9px] text-slate-500 mt-1">{COLOR_ESTILO[form.color_alerta]?.label}</p>
      </div>

      {/* 🆕 Etiquetas libres */}
      <div>
        <label className="text-[10px] text-slate-500 font-bold block mb-1">Etiquetas</label>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {(form.etiquetas || []).map((et, i) => (
            <span key={i} className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full flex items-center gap-1">
              {et} <button onClick={() => quitarEtiqueta(i)} className="text-indigo-400 font-bold">✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input placeholder="ej: campaña rural, urgente..." value={etiquetaNueva} onChange={(e) => setEtiquetaNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEtiqueta())}
            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
          <button type="button" onClick={agregarEtiqueta} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">+ Agregar</button>
        </div>
      </div>

      <input type="datetime-local" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      <BuscadorCalle valor={form.lugar} onSeleccion={(d) => setForm({ ...form, lugar: d.direccion_completa, lat: d.lat, lng: d.lng })} />
      <input placeholder="Sección (opcional)" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

      {/* 🆕 Campos exactos que pide el formulario de Agenda de Eventos
          del INE — para que la exportación salga completa. */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase">📋 Para el reporte al INE (opcional, pero recomendado)</div>
        <div className="flex gap-2">
          <input placeholder="Nombre(s) del responsable" value={form.responsable_nombres || ''} onChange={(e) => setForm({ ...form, responsable_nombres: e.target.value })}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
        </div>
        <div className="flex gap-2">
          <input placeholder="Primer apellido" value={form.responsable_apellido_paterno || ''} onChange={(e) => setForm({ ...form, responsable_apellido_paterno: e.target.value })}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
          <input placeholder="Segundo apellido (opcional)" value={form.responsable_apellido_materno || ''} onChange={(e) => setForm({ ...form, responsable_apellido_materno: e.target.value })}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
        </div>
        <input placeholder="Referencias del lugar (calles cercanas, puntos conocidos)" value={form.referencias_ubicacion || ''} onChange={(e) => setForm({ ...form, referencias_ubicacion: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
        <select value={form.tipo_lugar || ''} onChange={(e) => setForm({ ...form, tipo_lugar: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs">
          <option value="">Tipo de lugar exacto...</option>
          {Object.entries(TIPO_LUGAR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {form.tipo === 'reunion' && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 space-y-2.5">
          <div className="text-[10px] font-bold text-indigo-300 uppercase">📋 Ficha de la reunión — para que el candidato llegue informado</div>
          <div className="flex gap-2">
            <input placeholder="Nombre del anfitrión" value={form.anfitrion_nombre || ''} onChange={(e) => setForm({ ...form, anfitrion_nombre: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Teléfono" value={form.anfitrion_telefono || ''} onChange={(e) => setForm({ ...form, anfitrion_telefono: e.target.value })}
              className="w-32 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <input placeholder="Estructura relacionada (ej. Coordinación Zona Centro)" value={form.estructura_relacionada || ''} onChange={(e) => setForm({ ...form, estructura_relacionada: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Grupo social (ej. Club de madres, comerciantes)" value={form.grupo_social || ''} onChange={(e) => setForm({ ...form, grupo_social: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <div className="flex gap-2">
            <input placeholder="Duración (min)" type="number" value={form.duracion_minutos || ''} onChange={(e) => setForm({ ...form, duracion_minutos: e.target.value ? parseInt(e.target.value) : null })}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Personas esperadas" type="number" value={form.personas_esperadas || ''} onChange={(e) => setForm({ ...form, personas_esperadas: e.target.value ? parseInt(e.target.value) : null })}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={!!form.ofrece_aperitivo} onChange={(e) => setForm({ ...form, ofrece_aperitivo: e.target.checked })} />
            ¿Van a dar aperitivo?
          </label>
          {form.ofrece_aperitivo && (
            <input placeholder="¿Qué van a ofrecer?" value={form.detalle_aperitivo || ''} onChange={(e) => setForm({ ...form, detalle_aperitivo: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          )}
        </div>
      )}
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

function ModalFicha({ eventoId, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get(`/agenda/${eventoId}/ficha-tecnica`).then((r) => setDatos(r.data.data)).finally(() => setCargando(false));
  }, [eventoId]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        {cargando ? (
          <div className="text-center text-slate-500 py-10">Cargando ficha...</div>
        ) : !datos ? (
          <div className="text-center text-red-400 py-10">No se pudo cargar la ficha</div>
        ) : (
          <>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-lg font-black text-white">{datos.evento.titulo}</h2>
                <p className="text-[10px] text-slate-500">{new Date(datos.evento.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <button onClick={onCerrar} className="text-slate-500 text-xl">✕</button>
            </div>

            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 space-y-1 mb-3">
              <div className="text-[10px] font-bold text-indigo-300 uppercase mb-1">👤 Con quién vas a hablar</div>
              {datos.evento.anfitrion_nombre && <p className="text-xs text-slate-200"><strong>Anfitrión:</strong> {datos.evento.anfitrion_nombre} {datos.evento.anfitrion_telefono && `(${datos.evento.anfitrion_telefono})`}</p>}
              {datos.evento.estructura_relacionada && <p className="text-xs text-slate-200"><strong>Estructura:</strong> {datos.evento.estructura_relacionada}</p>}
              {datos.evento.grupo_social && <p className="text-xs text-slate-200"><strong>Grupo:</strong> {datos.evento.grupo_social}</p>}
              {datos.evento.personas_esperadas && <p className="text-xs text-slate-200"><strong>Personas esperadas:</strong> {datos.evento.personas_esperadas}</p>}
              {datos.evento.duracion_minutos && <p className="text-xs text-slate-200"><strong>Duración:</strong> {datos.evento.duracion_minutos} min</p>}
              <p className="text-xs text-slate-200"><strong>Aperitivo:</strong> {datos.evento.ofrece_aperitivo ? (datos.evento.detalle_aperitivo || 'Sí') : 'No'}</p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 mb-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">📍 Sección {datos.evento.seccion_numero || '—'} {datos.evento.municipio && `· ${datos.evento.municipio}`}</div>
              {datos.ficha_seccion && datos.ficha_seccion.length > 0 ? datos.ficha_seccion.map((f, i) => (
                <p key={i} className="text-[10px] text-slate-400">{TIPO_LABEL[f.tipo_eleccion] || f.tipo_eleccion} {f.anio}: ganó <strong className="text-white">{f.ganador?.toUpperCase()}</strong></p>
              )) : <p className="text-[10px] text-slate-500">Sin histórico disponible</p>}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 mb-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">🗳️ Tu avance ahí</div>
              {datos.promovidos && datos.promovidos.total > 0 ? (
                <>
                  <p className="text-[10px] text-slate-400">{datos.promovidos.total} promovidos en esta sección</p>
                  {datos.promovidos.por_clasificacion.map((p) => <p key={p.clasificacion} className="text-[10px] text-slate-500">· {p.clasificacion}: {p.total}</p>)}
                </>
              ) : <p className="text-[10px] text-slate-500">Sin promovidos registrados aquí todavía</p>}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 mb-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">📋 Encuestas</div>
              <p className="text-[10px] text-slate-400">{datos.encuestas?.total_respuestas || 0} respuestas capturadas en esta sección</p>
            </div>

            <button onClick={() => descargarArchivo(`/agenda/${eventoId}/pdf`, `tarjeta_${datos.evento.titulo.replace(/\s+/g, '_')}.pdf`)}
              className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-bold">
              📄 Descargar tarjeta informativa (PDF)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 🆕 Modal de gestión — documentos por evento y compromisos
 * pendientes, todo en un solo lugar por evento.
 */
function ModalGestion({ evento, onCerrar, onActualizado }) {
  const [tab, setTab] = useState('documentos');
  const [documentos, setDocumentos] = useState(null);
  const [compromisos, setCompromisos] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [nuevoCompromiso, setNuevoCompromiso] = useState({ descripcion: '', fecha_limite: '' });

  const cargarDocumentos = () => api.get(`/agenda/${evento.id}/documentos`).then((r) => setDocumentos(r.data.data));
  const cargarCompromisos = () => api.get(`/agenda/${evento.id}/compromisos`).then((r) => setCompromisos(r.data.data));
  useEffect(() => { cargarDocumentos(); cargarCompromisos(); }, [evento.id]);

  const subirDocumento = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    const fd = new FormData();
    fd.append('archivo', archivo);
    try { await api.post(`/agenda/${evento.id}/documentos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); cargarDocumentos(); }
    catch (e) { alert('No se pudo subir el archivo'); }
    setSubiendo(false);
  };
  const borrarDocumento = async (id) => { await api.delete(`/agenda/documentos/${id}`); cargarDocumentos(); };

  const crearCompromiso = async () => {
    if (!nuevoCompromiso.descripcion) return;
    await api.post(`/agenda/${evento.id}/compromisos`, nuevoCompromiso);
    setNuevoCompromiso({ descripcion: '', fecha_limite: '' });
    cargarCompromisos();
    onActualizado();
  };
  const completarCompromiso = async (id) => { await api.patch(`/agenda/compromisos/${id}/completar`); cargarCompromisos(); onActualizado(); };
  const borrarCompromiso = async (id) => { await api.delete(`/agenda/compromisos/${id}`); cargarCompromisos(); onActualizado(); };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-black text-white">{evento.titulo}</h2>
          <button onClick={onCerrar} className="text-slate-500 text-xl">✕</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('documentos')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab === 'documentos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📎 Documentos</button>
          <button onClick={() => setTab('compromisos')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab === 'compromisos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Compromisos</button>
        </div>

        {tab === 'documentos' && (
          <div className="space-y-2">
            <label className="block w-full py-2.5 rounded-lg bg-indigo-600/80 text-white text-xs font-bold text-center cursor-pointer">
              {subiendo ? '⏳ Subiendo...' : '+ Subir documento'}
              <input type="file" className="hidden" onChange={(e) => subirDocumento(e.target.files[0])} disabled={subiendo} />
            </label>
            {documentos === null ? <div className="text-center text-slate-500 text-xs py-4">⏳ Cargando...</div> :
             documentos.length === 0 ? <div className="text-center text-slate-500 text-xs py-4">Sin documentos todavía</div> :
             documentos.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 font-bold truncate flex-1">📄 {d.nombre_archivo}</a>
                <button onClick={() => borrarDocumento(d.id)} className="text-red-500 text-xs ml-2">🗑️</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'compromisos' && (
          <div className="space-y-2">
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <input placeholder="¿Qué se comprometió a hacer?" value={nuevoCompromiso.descripcion}
                onChange={(e) => setNuevoCompromiso({ ...nuevoCompromiso, descripcion: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              <div className="flex gap-2">
                <input type="date" value={nuevoCompromiso.fecha_limite} onChange={(e) => setNuevoCompromiso({ ...nuevoCompromiso, fecha_limite: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                <button onClick={crearCompromiso} disabled={!nuevoCompromiso.descripcion} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">+ Agregar</button>
              </div>
            </div>
            {compromisos === null ? <div className="text-center text-slate-500 text-xs py-4">⏳ Cargando...</div> :
             compromisos.length === 0 ? <div className="text-center text-slate-500 text-xs py-4">Sin compromisos todavía</div> :
             compromisos.map((c) => (
              <div key={c.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${c.completado ? 'bg-emerald-500/10' : 'bg-slate-800/50'}`}>
                <div className="flex-1">
                  <div className={`text-xs ${c.completado ? 'text-emerald-400 line-through' : 'text-white'}`}>{c.descripcion}</div>
                  <div className="text-[9px] text-slate-500">{c.responsable_nombre || 'Sin asignar'}{c.fecha_limite && ` · vence ${new Date(c.fecha_limite).toLocaleDateString('es-MX')}`}</div>
                </div>
                {!c.completado && <button onClick={() => completarCompromiso(c.id)} className="text-emerald-400 text-xs mr-2">✅</button>}
                <button onClick={() => borrarCompromiso(c.id)} className="text-red-500 text-xs">🗑️</button>
              </div>
            ))}
          </div>
        )}
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
                    <span key={j} className={`w-1 h-1 rounded-full ${(COLOR_ESTILO[e.color_alerta] || COLOR_ESTILO.indigo).punto}`} />
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

function VistaDia({ eventos, diaActual, onCambiarDia, onEditar }) {
  const HORAS = Array.from({ length: 17 }, (_, i) => i + 6);
  const ALTO_HORA = 56;

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
          const est = COLOR_ESTILO[e.color_alerta] || COLOR_ESTILO.indigo;
          return (
            <button key={e.id} onClick={() => onEditar(e.id)}
              className={`absolute left-14 right-2 rounded-lg border-l-4 ${est.borde} ${est.bg} px-2 py-1 text-left overflow-hidden hover:brightness-125`}
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

/** 🆕 Panel de tiempos de traslado — muestra si el día es realista de cumplir. */
function PanelTraslados({ fecha }) {
  const [tramos, setTramos] = useState(null);
  useEffect(() => { api.get(`/agenda/tiempos-traslado?fecha=${fecha}`).then((r) => setTramos(r.data.data)).catch(() => setTramos([])); }, [fecha]);

  if (!tramos || tramos.length === 0) return null;
  const RIESGO_ESTILO = { alto: 'bg-red-500/10 border-red-500/30 text-red-300', medio: 'bg-amber-500/10 border-amber-500/30 text-amber-300', bajo: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
      <div className="text-[10px] font-bold text-slate-400 uppercase">🚗 Tiempos de traslado del día</div>
      {tramos.map((t, i) => (
        <div key={i} className={`text-[10px] rounded-lg px-2.5 py-1.5 border ${RIESGO_ESTILO[t.riesgo]}`}>
          {t.de} → {t.a}: <strong>{t.minutos_traslado} min de traslado</strong> ({t.minutos_disponibles} min disponibles)
          {t.riesgo === 'alto' && ' ⚠️ No alcanza el tiempo'}
          {t.fuente === 'estimado' && <span className="text-slate-500"> · estimado</span>}
        </div>
      ))}
    </div>
  );
}

/** 🆕 Compromisos pendientes de toda la campaña — vista rápida sin entrar evento por evento. */
function PanelCompromisosGlobal() {
  const [pendientes, setPendientes] = useState(null);
  const cargar = () => api.get('/agenda/compromisos-pendientes').then((r) => setPendientes(r.data.data));
  useEffect(cargar, []);
  const completar = async (id) => { await api.patch(`/agenda/compromisos/${id}/completar`); cargar(); };

  if (pendientes === null) return <div className="text-center text-slate-500 text-xs py-6">⏳ Cargando...</div>;
  if (pendientes.length === 0) return <div className="text-center text-slate-500 text-xs py-6">✅ Sin compromisos pendientes</div>;

  return (
    <div className="space-y-2">
      {pendientes.map((c) => {
        const vencido = c.fecha_limite && new Date(c.fecha_limite) < new Date();
        return (
          <div key={c.id} className={`rounded-xl border p-3 ${vencido ? 'border-red-500/40 bg-red-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{c.descripcion}</div>
                <div className="text-[10px] text-slate-500">{c.evento_titulo} · {c.responsable_nombre || 'Sin asignar'}{c.fecha_limite && ` · ${vencido ? '⚠️ venció' : 'vence'} ${new Date(c.fecha_limite).toLocaleDateString('es-MX')}`}</div>
              </div>
              <button onClick={() => completar(c.id)} className="text-emerald-400 text-lg">✅</button>
            </div>
          </div>
        );
      })}
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
  const [puedeAprobar, setPuedeAprobar] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(!!seccionUrl);
  const [editandoId, setEditandoId] = useState(null);
  const [verFichaId, setVerFichaId] = useState(null);
  const [gestionandoEvento, setGestionandoEvento] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [vista, setVista] = useState('lista'); // 'lista' | 'dia' | 'calendario' | 'anuncios' | 'compromisos'
  const [diaActual, setDiaActual] = useState(new Date());
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);

  const formVacio = {
    titulo: '', tipo: 'evento', color_alerta: 'indigo', etiquetas: [], fecha_inicio: '', lugar: '', seccion_numero: seccionUrl || '', descripcion: '', lat: null, lng: null,
    anfitrion_nombre: '', anfitrion_telefono: '', estructura_relacionada: '', grupo_social: '', duracion_minutos: null, personas_esperadas: null, ofrece_aperitivo: false, detalle_aperitivo: '',
    responsable_nombres: '', responsable_apellido_paterno: '', responsable_apellido_materno: '', referencias_ubicacion: '', tipo_lugar: '',
  };

  const cargar = () => {
    setCargando(true);
    api.get('/agenda').then((r) => { setEventos(r.data.data); setPuedeAprobar(r.data.puede_aprobar); setCargando(false); });
  };
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
  const aprobar = async (id) => { await api.patch(`/agenda/${id}/aprobar`); cargar(); };
  const rechazar = async (id) => {
    const motivo = prompt('¿Por qué se rechaza esta reunión? (opcional)');
    await api.patch(`/agenda/${id}/rechazar`, { motivo });
    cargar();
  };

  const eventosFiltrados = filtroTipo === 'todos' ? eventos : eventos.filter((e) => e.tipo === filtroTipo);
  const grupos = agruparPorFecha(eventosFiltrados);
  const eventoEditando = editandoId ? eventos.find((e) => e.id === editandoId) : null;
  const totalRealizados = eventos.filter((e) => e.realizado).length;
  const totalPropuestos = eventos.filter((e) => e.estado === 'propuesto').length;

  const TarjetaEvento = ({ e }) => {
    const est = COLOR_ESTILO[e.color_alerta] || COLOR_ESTILO.indigo;
    return (
      <div className={`rounded-xl border-l-[6px] ${est.borde} border-y border-r border-slate-800 p-4 ${e.realizado ? 'bg-slate-900/30 opacity-60' : 'bg-slate-900/60'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{TIPO_ICONO[e.tipo]}</span>
            <div>
              <div className="text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                {e.titulo}
                {e.realizado && <span className="text-emerald-400 text-xs">✅ Realizado</span>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {new Date(e.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                {e.lugar && ` · ${e.lugar}`}{e.seccion_numero && ` · Secc. ${e.seccion_numero}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {e.tipo === 'reunion' && <button onClick={() => setVerFichaId(e.id)} className="text-[10px] text-purple-400 font-bold">📋</button>}
            <button onClick={() => setGestionandoEvento(e)} className="text-[10px] text-cyan-400 font-bold relative">
              📎{(e.total_documentos > 0 || e.compromisos_pendientes > 0) && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[7px] flex items-center justify-center text-white">{parseInt(e.total_documentos || 0) + parseInt(e.compromisos_pendientes || 0)}</span>}
            </button>
            {!e.realizado && e.estado !== 'propuesto' && <button onClick={() => marcarRealizado(e.id)} className="text-[10px] text-emerald-400 font-bold">✅</button>}
            <button onClick={() => setEditandoId(e.id)} className="text-[10px] text-indigo-400 font-bold">✏️</button>
            <button onClick={() => eliminar(e.id)} className="text-slate-600 hover:text-red-400 text-xs">🗑️</button>
          </div>
        </div>

        {/* 🆕 Estado de aprobación + etiquetas — más grandes y con
            íconos, para que se distingan de un vistazo rápido */}
        <div className="flex items-center gap-2 flex-wrap mt-3 pl-14">
          {e.estado && e.estado !== 'confirmado' && ESTADO_ESTILO[e.estado] && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${ESTADO_ESTILO[e.estado].color}`}>{ESTADO_ESTILO[e.estado].label}</span>
          )}
          {(e.etiquetas || []).map((et, i) => (
            <span key={i} className={`text-xs font-bold px-3 py-1 rounded-full ${est.bg} ${est.texto}`}>🏷️ {et}</span>
          ))}
        </div>

        {/* 🆕 Botones de aprobar/rechazar — SOLO visibles para quien puede hacerlo */}
        {e.estado === 'propuesto' && puedeAprobar && (
          <div className="flex gap-2 mt-2 pl-11">
            <button onClick={() => aprobar(e.id)} className="flex-1 py-1.5 rounded-lg bg-emerald-600/80 text-white text-[10px] font-bold">✅ Aprobar reunión</button>
            <button onClick={() => rechazar(e.id)} className="flex-1 py-1.5 rounded-lg bg-red-600/80 text-white text-[10px] font-bold">❌ Rechazar</button>
          </div>
        )}
        {e.estado === 'propuesto' && !puedeAprobar && (
          <p className="text-[9px] text-amber-400 mt-1.5 pl-11">Propuesta por {e.propuesto_por_nombre} — esperando aprobación del Candidato o Secretario Particular</p>
        )}

        {e.descripcion && <p className="text-[10px] text-slate-400 mt-2 pl-11">{e.descripcion}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-black text-white">📅 Agenda</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/agenda/exportar-ine', 'agenda_ine.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold" title="Excel con el formato exacto del INE">
              📥 Exportar para INE
            </button>
            {vista !== 'anuncios' && vista !== 'compromisos' && (
              <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                {mostrarForm ? 'Cancelar' : '+ Evento'}
              </button>
            )}
          </div>
        </div>

        {totalPropuestos > 0 && puedeAprobar && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
            ⏳ Tienes {totalPropuestos} reunión(es) propuesta(s) esperando tu aprobación
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
          <button onClick={() => setVista('dia')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'dia' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🕐 Día</button>
          <button onClick={() => setVista('calendario')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'calendario' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗓️ Mes</button>
          <button onClick={() => setVista('compromisos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'compromisos' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Compromisos</button>
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
            inicial={{ ...eventoEditando, fecha_inicio: eventoEditando.fecha_inicio?.slice(0, 16), seccion_numero: eventoEditando.seccion_numero || '', color_alerta: eventoEditando.color_alerta || 'indigo', etiquetas: eventoEditando.etiquetas || [] }}
            onGuardar={editar} onCancelar={() => setEditandoId(null)}
          />
        )}

        {vista === 'anuncios' ? (
          <PanelAnuncios />
        ) : vista === 'compromisos' ? (
          <PanelCompromisosGlobal />
        ) : vista === 'dia' ? (
          <>
            <VistaDia eventos={eventos} diaActual={diaActual}
              onCambiarDia={(d) => setDiaActual(d === 'hoy' ? new Date() : new Date(diaActual.getTime() + d * 86400000))}
              onEditar={setEditandoId} />
            <PanelTraslados fecha={diaActual.toISOString().slice(0, 10)} />
          </>
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
      {verFichaId && <ModalFicha eventoId={verFichaId} onCerrar={() => setVerFichaId(null)} />}
      {gestionandoEvento && <ModalGestion evento={gestionandoEvento} onCerrar={() => setGestionandoEvento(null)} onActualizado={cargar} />}
    </div>
  );
}

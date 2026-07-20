import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import AsistenteIA from '../components/AsistenteIA';

const TIPO_PLAZO = { plazo_ine: { ic: '🏛️', label: 'Plazo INE', color: 'text-blue-400' }, plazo_ite: { ic: '⚖️', label: 'Plazo ITE', color: 'text-purple-400' }, veda: { ic: '🚫', label: 'Veda Electoral', color: 'text-red-400' }, otro: { ic: '📌', label: 'Otro', color: 'text-slate-400' } };
const ESTADO_QUEJA = { presentada: 'bg-blue-500/10 text-blue-400', en_proceso: 'bg-amber-500/10 text-amber-400', resuelta: 'bg-emerald-500/10 text-emerald-400' };

export default function Juridico() {
  const [tab, setTab] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [calendario, setCalendario] = useState([]);
  const [quejas, setQuejas] = useState([]);
  const [mostrarFormPlazo, setMostrarFormPlazo] = useState(false);
  const [mostrarFormQueja, setMostrarFormQueja] = useState(false);
  const [formPlazo, setFormPlazo] = useState({ titulo: '', tipo: 'plazo_ite', fecha: '', descripcion: '' });
  const [formQueja, setFormQueja] = useState({ tipo: 'queja', autoridad: 'ite', descripcion: '', numero_expediente: '' });
  const [fechaInicioCampana, setFechaInicioCampana] = useState('');
  const [auditoria, setAuditoria] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const [formDoc, setFormDoc] = useState({ categoria: 'ine', nombre: '' });

  const cargar = () => {
    api.get('/juridico/resumen').then((r) => setResumen(r.data.data));
    api.get('/juridico/calendario').then((r) => setCalendario(r.data.data));
    api.get('/juridico/quejas').then((r) => setQuejas(r.data.data));
    api.get('/juridico/fecha-inicio-campana').then((r) => setFechaInicioCampana(r.data.data?.fecha_inicio_campana_oficial?.slice(0, 10) || ''));
    api.get('/juridico/auditoria').then((r) => setAuditoria(r.data.data)).catch(() => setAuditoria([]));
    api.get('/documentos').then((r) => setDocumentos(r.data.data)).catch(() => setDocumentos([]));
  };

  const subirDocumento = async (archivo) => {
    if (!archivo) return;
    setSubiendoDoc(true);
    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('categoria', formDoc.categoria);
    formData.append('nombre', formDoc.nombre || archivo.name);
    try {
      await api.post('/documentos/subir', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFormDoc({ categoria: 'ine', nombre: '' });
      cargar();
    } catch (e) {
      alert(e.response?.data?.error || 'Error al subir el documento');
    }
    setSubiendoDoc(false);
  };

  const borrarDocumento = async (id) => {
    if (!confirm('¿Borrar este documento?')) return;
    await api.delete(`/documentos/${id}`);
    cargar();
  };
  useEffect(cargar, []);

  const guardarFechaInicioCampana = async (fecha) => {
    setFechaInicioCampana(fecha);
    await api.patch('/juridico/fecha-inicio-campana', { fecha });
  };

  const guardarPlazo = async () => {
    await api.post('/juridico/calendario', formPlazo);
    setFormPlazo({ titulo: '', tipo: 'plazo_ite', fecha: '', descripcion: '' });
    setMostrarFormPlazo(false);
    cargar();
  };
  const marcarCumplido = async (id, cumplido) => { await api.patch(`/juridico/calendario/${id}/cumplido`, { cumplido: !cumplido }); cargar(); };
  const eliminarPlazo = async (id) => { await api.delete(`/juridico/calendario/${id}`); cargar(); };

  const guardarQueja = async () => {
    await api.post('/juridico/quejas', formQueja);
    setFormQueja({ tipo: 'queja', autoridad: 'ite', descripcion: '', numero_expediente: '' });
    setMostrarFormQueja(false);
    cargar();
  };
  const cambiarEstadoQueja = async (id, estado) => { await api.patch(`/juridico/quejas/${id}`, { estado }); cargar(); };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">⚖️ Área Jurídica</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('resumen')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'resumen' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📊 Resumen</button>
          <button onClick={() => setTab('calendario')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'calendario' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📅 Calendario Electoral</button>
          <button onClick={() => setTab('quejas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'quejas' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📄 Quejas y Recursos</button>
          <button onClick={() => setTab('auditoria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'auditoria' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔍 Auditoría</button>
          <button onClick={() => setTab('documentos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'documentos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📁 Documentos</button>
        </div>

        {/* Fecha oficial de inicio de campaña — base de la alerta legal en Activos */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <h3 className="text-xs font-bold text-amber-300 uppercase mb-1">⚖️ Fecha oficial de inicio de campaña</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            El ITE está sancionando activamente "actos anticipados de campaña" en Tlaxcala (bardas y espectaculares colocados antes de tiempo).
            Con esta fecha, el módulo de Activos te avisa automáticamente si algo se registró antes de lo permitido.
          </p>
          <input type="date" value={fechaInicioCampana} onChange={(e) => guardarFechaInicioCampana(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        </div>

        {tab === 'resumen' && resumen && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-amber-400">{resumen.quejas_abiertas}</div>
                <div className="text-[9px] text-slate-500">Quejas/recursos abiertos</div>
              </div>
              <Link to="/incidencias" className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center hover:bg-slate-800/60">
                <div className="text-lg font-black text-red-400">{resumen.incidencias_activas}</div>
                <div className="text-[9px] text-slate-500">Incidencias activas →</div>
              </Link>
              <Link to="/finanzas" className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center hover:bg-slate-800/60">
                <div className="text-lg font-black text-indigo-400">{resumen.tope_gasto ? Math.round(resumen.gasto_actual / resumen.tope_gasto * 100) : 0}%</div>
                <div className="text-[9px] text-slate-500">Tope de gasto usado →</div>
              </Link>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">⏰ Próximos plazos</h3>
              {resumen.proximos_plazos.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-3">Sin plazos próximos registrados</div>
              ) : resumen.proximos_plazos.map((p) => {
                const dias = Math.ceil((new Date(p.fecha) - new Date()) / 86400000);
                const t = TIPO_PLAZO[p.tipo];
                return (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <span className="text-xs text-slate-300">{t.ic} {p.titulo}</span>
                    <span className={`text-[10px] font-bold ${dias <= 7 ? 'text-red-400' : 'text-slate-500'}`}>{dias === 0 ? 'Hoy' : `en ${dias}d`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'calendario' && (
          <div className="space-y-3">
            <button onClick={() => setMostrarFormPlazo(!mostrarFormPlazo)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
              {mostrarFormPlazo ? 'Cancelar' : '+ Agregar plazo'}
            </button>
            {mostrarFormPlazo && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                <input placeholder="Título del plazo" value={formPlazo.titulo} onChange={(e) => setFormPlazo({ ...formPlazo, titulo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <select value={formPlazo.tipo} onChange={(e) => setFormPlazo({ ...formPlazo, tipo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  {Object.entries(TIPO_PLAZO).map(([k, v]) => <option key={k} value={k}>{v.ic} {v.label}</option>)}
                </select>
                <input type="date" value={formPlazo.fecha} onChange={(e) => setFormPlazo({ ...formPlazo, fecha: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <textarea placeholder="Descripción (opcional)" value={formPlazo.descripcion} onChange={(e) => setFormPlazo({ ...formPlazo, descripcion: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <button onClick={guardarPlazo} disabled={!formPlazo.titulo || !formPlazo.fecha} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
              </div>
            )}
            {calendario.map((p) => {
              const t = TIPO_PLAZO[p.tipo];
              return (
                <div key={p.id} className={`rounded-xl border border-slate-800 p-3 ${p.cumplido ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-sm font-bold ${t.color}`}>{t.ic} {p.titulo}</span>
                      <div className="text-[10px] text-slate-500">{new Date(p.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      {p.descripcion && <p className="text-[10px] text-slate-400 mt-1">{p.descripcion}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => marcarCumplido(p.id, p.cumplido)} className="text-[10px] font-bold text-emerald-400">{p.cumplido ? '↩️' : '✅'}</button>
                      <button onClick={() => eliminarPlazo(p.id)} className="text-red-500 text-xs">🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'quejas' && (
          <div className="space-y-3">
            <button onClick={() => setMostrarFormQueja(!mostrarFormQueja)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
              {mostrarFormQueja ? 'Cancelar' : '+ Nueva queja/recurso'}
            </button>
            {mostrarFormQueja && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                <div className="flex gap-2">
                  <select value={formQueja.tipo} onChange={(e) => setFormQueja({ ...formQueja, tipo: e.target.value })} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                    <option value="queja">Queja</option><option value="recurso">Recurso</option>
                  </select>
                  <select value={formQueja.autoridad} onChange={(e) => setFormQueja({ ...formQueja, autoridad: e.target.value })} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                    <option value="ite">ITE (estatal)</option><option value="ine">INE (federal)</option>
                  </select>
                </div>
                <input placeholder="Número de expediente (si ya lo tienes)" value={formQueja.numero_expediente} onChange={(e) => setFormQueja({ ...formQueja, numero_expediente: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Descripción del caso</span>
                  <AsistenteIA contexto="redactar_queja" onTextoGenerado={(t) => setFormQueja({ ...formQueja, descripcion: t })} />
                </div>
                <textarea placeholder="Describe los hechos brevemente, la IA te ayuda a redactarlo formal" value={formQueja.descripcion} onChange={(e) => setFormQueja({ ...formQueja, descripcion: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
                <button onClick={guardarQueja} disabled={!formQueja.descripcion} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
              </div>
            )}
            {quejas.map((q) => (
              <div key={q.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-white">{q.tipo === 'queja' ? '📄 Queja' : '⚖️ Recurso'} — {q.autoridad.toUpperCase()}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${ESTADO_QUEJA[q.estado]}`}>{q.estado}</span>
                </div>
                {q.numero_expediente && <div className="text-[10px] text-slate-500">Expediente: {q.numero_expediente}</div>}
                <p className="text-xs text-slate-300 mt-1">{q.descripcion}</p>
                <div className="flex gap-1.5 mt-2">
                  {q.estado !== 'en_proceso' && <button onClick={() => cambiarEstadoQueja(q.id, 'en_proceso')} className="text-[10px] font-bold text-amber-400">En proceso</button>}
                  {q.estado !== 'resuelta' && <button onClick={() => cambiarEstadoQueja(q.id, 'resuelta')} className="text-[10px] font-bold text-emerald-400">Resuelta</button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'auditoria' && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500">Bitácora de las acciones más sensibles: resultados electorales, finanzas, cambios de rol, e importaciones masivas de contactos. Solo altos mandos la pueden ver.</p>
            {auditoria.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-10">Sin acciones registradas todavía (o tu rol no tiene permiso para verla)</div>
            ) : auditoria.map((a) => {
              const TABLA_LABEL = { resultados_casilla: '🗳️ Resultado de casilla', gastos_campana: '💰 Gasto registrado', usuarios: '👤 Cambio de usuario', promovidos_importacion: '📥 Importación de contactos' };
              const ACCION_COLOR = { crear: 'text-emerald-400', editar: 'text-amber-400', eliminar: 'text-red-400' };
              return (
                <div key={a.id} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-white">{TABLA_LABEL[a.tabla] || a.tabla}</span>
                    <span className={`text-[9px] font-bold uppercase ${ACCION_COLOR[a.accion]}`}>{a.accion}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{a.usuario_nombre || 'Usuario eliminado'} · {new Date(a.creado_en).toLocaleString('es-MX')}</div>
                  {a.detalle && <pre className="text-[9px] text-slate-400 mt-1.5 bg-slate-950/50 rounded p-2 overflow-x-auto">{JSON.stringify(a.detalle, null, 1)}</pre>}
                </div>
              );
            })}
          </div>
        )}
        {tab === 'documentos' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase">📥 Subir documento</h3>
              <div className="flex gap-2">
                <select value={formDoc.categoria} onChange={(e) => setFormDoc({ ...formDoc, categoria: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  <option value="ine">INE</option>
                  <option value="nombramiento">Nombramiento</option>
                  <option value="acta">Acta</option>
                  <option value="contrato">Contrato</option>
                  <option value="oficio">Oficio</option>
                  <option value="otro">Otro</option>
                </select>
                <input placeholder="Nombre descriptivo (opcional)" value={formDoc.nombre} onChange={(e) => setFormDoc({ ...formDoc, nombre: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </div>
              <label className="block">
                <input type="file" onChange={(e) => subirDocumento(e.target.files[0])} disabled={subiendoDoc} className="hidden" id="input-documento" />
                <span className="block text-center py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold cursor-pointer" onClick={() => document.getElementById('input-documento').click()}>
                  {subiendoDoc ? '⏳ Subiendo...' : '+ Elegir archivo'}
                </span>
              </label>
            </div>

            {documentos.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-10">Sin documentos todavía</div>
            ) : documentos.map((d) => {
              const CATEGORIA_ICONO = { ine: '🏛️', nombramiento: '📜', acta: '📋', contrato: '📄', oficio: '✉️', otro: '📎' };
              return (
                <div key={d.id} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{CATEGORIA_ICONO[d.categoria]}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{d.nombre}</div>
                      <div className="text-[9px] text-slate-500">{d.subido_por_nombre} · {new Date(d.creado_en).toLocaleDateString('es-MX')} · {d.tamano_kb} KB</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-indigo-400">Ver</a>
                    <button onClick={() => borrarDocumento(d.id)} className="text-[10px] font-bold text-red-400">Borrar</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

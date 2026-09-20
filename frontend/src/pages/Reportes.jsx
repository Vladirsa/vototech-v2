import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';

const PARTIDOS_COLOR = {
  morena: '#8B0000', pan: '#003DA5', pri: '#006847', pvem: '#2D7D27',
  pt: '#CC0000', mc: '#F26522', prd: '#FFCB00', pac: '#E91E63',
  rsp: '#7c3aed', fxm: '#0891b2', panalt: '#64748b',
  // 🆕 2 partidos nuevos con registro nacional desde el 1° de julio
  // de 2026 — no se quitó nada de los anteriores porque perder
  // registro NACIONAL no quita el registro LOCAL que algunos
  // conservan en ciertos estados, y ahí sí pueden ser clientes.
  somos: '#EC4899', // "SOMOS" (antes "Somos México") — emblema oficial aprobado por el INE: la palabra SOMOS en rosa sobre blanco
  paz: '#64748b', // Partido PAZ — color oficial aún no confirmado, verificar cuando el INE lo publique
};

// 🆕 Etiquetas legibles por rol — para el filtro "por estructura" de
// Bitácora diaria y Actividad de Campo.
const ROL_LABEL = {
  candidato: 'Candidato', jefe_campana: 'Jefe de Campaña', coord_general: 'Coord. General',
  coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional',
  promotor: 'Promotor', representante_casilla: 'Repres. de Casilla',
  encargado_juridico: 'Encargado Jurídico', encargado_finanzas: 'Encargado Finanzas', voluntario: 'Voluntario',
};
const ROL_ES_LIDER = ['candidato', 'jefe_campana', 'coord_general', 'coord_distrital', 'coord_municipal', 'coord_seccional'];

/**
 * 🆕 Resultados reales de una encuesta — qué contestó la gente,
 * desglosado por pregunta, y cruzado con género/edad/sección.
 */
function ModalResultadosEncuesta({ encuestaId, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [preguntaAbierta, setPreguntaAbierta] = useState(null);

  useEffect(() => {
    api.get(`/reportes/encuestas/${encuestaId}/resultados`).then((r) => {
      setDatos(r.data.data);
      if (r.data.data.preguntas.length > 0) setPreguntaAbierta(r.data.data.preguntas[0].id);
    });
  }, [encuestaId]);

  if (!datos) return null;
  const pregunta = datos.preguntas.find((p) => p.id === preguntaAbierta);

  const barra = (obj, colorClase = 'bg-pink-500') => {
    const total = Object.values(obj).reduce((s, n) => s + n, 0);
    const max = Math.max(1, ...Object.values(obj));
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([opcion, n]) => (
      <div key={opcion} className="mb-1.5">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-slate-300">{opcion}</span>
          <span className="text-slate-400 font-bold">{n} ({total > 0 ? Math.round((n / total) * 100) : 0}%)</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${colorClase}`} style={{ width: `${(n / max) * 100}%` }} />
        </div>
      </div>
    ));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">{datos.encuesta.titulo}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>
        <p className="text-xs text-slate-500">{datos.total_respuestas} respuestas totales</p>

        <div className="flex gap-1.5 flex-wrap">
          {datos.preguntas.map((p, i) => (
            <button key={p.id} onClick={() => setPreguntaAbierta(p.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${preguntaAbierta === p.id ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              Pregunta {i + 1}
            </button>
          ))}
        </div>

        {pregunta && (
          <div className="space-y-3">
            <p className="text-sm text-white font-bold">{pregunta.texto}</p>
            <p className="text-[10px] text-slate-500">{pregunta.total_respondieron} personas contestaron esta pregunta</p>

            <div className="bg-slate-800/40 rounded-xl p-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Resultado general</div>
              {barra(pregunta.por_opcion)}
            </div>

            {Object.keys(pregunta.por_genero).length > 0 && (
              <div className="bg-slate-800/40 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Por género</div>
                {Object.entries(pregunta.por_genero).map(([genero, opciones]) => (
                  <div key={genero} className="mb-2">
                    <div className="text-[10px] text-indigo-300 font-bold mb-1">{genero}</div>
                    {barra(opciones, 'bg-indigo-500')}
                  </div>
                ))}
              </div>
            )}

            {Object.keys(pregunta.por_edad).length > 0 && (
              <div className="bg-slate-800/40 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Por rango de edad</div>
                {Object.entries(pregunta.por_edad).map(([edad, opciones]) => (
                  <div key={edad} className="mb-2">
                    <div className="text-[10px] text-emerald-300 font-bold mb-1">{edad}</div>
                    {barra(opciones, 'bg-emerald-500')}
                  </div>
                ))}
              </div>
            )}

            {Object.keys(pregunta.por_seccion).length > 0 && (
              <div className="bg-slate-800/40 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Por sección (top 10)</div>
                {Object.entries(pregunta.por_seccion).slice(0, 10).map(([seccion, opciones]) => (
                  <div key={seccion} className="mb-2">
                    <div className="text-[10px] text-amber-300 font-bold mb-1">Sección {String(seccion).padStart(3, '0')}</div>
                    {barra(opciones, 'bg-amber-500')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 🆕 REPORTES PERSONALIZADOS — tablas dinámicas filtrables.
// Sigue el motor de /reportes-vototech-skills: distingue DATOS
// ORIGINALES (filas de la tabla) de CÁLCULOS (fila de totales),
// nunca inventa cifras — todo sale directo del backend.
const AGRUPACIONES_OPCIONES = [
  { id: 'seccion', label: '📍 Por sección' },
  { id: 'municipio', label: '🏘️ Por municipio' },
  { id: 'distrito_local', label: '🗺️ Por región (Distrito Local)' },
  { id: 'distrito_federal', label: '🗺️ Por región (Distrito Federal)' },
  { id: 'estructura', label: '🏗️ Por estructura (rol)' },
  { id: 'coordinador', label: '👤 Por coordinador' },
  { id: 'clasificacion', label: '🎯 Por base (clasificación)' },
  { id: 'detalle', label: '📋 Detalle de promovidos' },
];

function PanelReportesPersonalizados() {
  const [agruparPor, setAgruparPor] = useState('seccion');
  const [municipioId, setMunicipioId] = useState('');
  const [seccionNumero, setSeccionNumero] = useState('');
  const [rol, setRol] = useState('');
  const [clasificacion, setClasificacion] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const construirParams = () => {
    const p = { agrupar_por: agruparPor };
    if (municipioId) p.municipio_id = municipioId;
    if (seccionNumero) p.seccion_numero = seccionNumero;
    if (rol) p.rol = rol;
    if (clasificacion) p.clasificacion = clasificacion;
    if (fechaInicio) p.fecha_inicio = fechaInicio;
    if (fechaFin) p.fecha_fin = fechaFin;
    return p;
  };

  const generar = async () => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/reportes/personalizado', { params: construirParams() });
      setResultado(data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo generar el reporte');
      setResultado(null);
    }
    setCargando(false);
  };

  useEffect(() => { generar(); /* eslint-disable-next-line */ }, []);

  const descargarExcel = () => {
    const params = new URLSearchParams(construirParams()).toString();
    descargarArchivo(`/reportes/personalizado/exportar?${params}`, `reporte_personalizado_${agruparPor}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase">Agrupar por</div>
        <div className="flex gap-2 flex-wrap">
          {AGRUPACIONES_OPCIONES.map((o) => (
            <button key={o.id} onClick={() => setAgruparPor(o.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${agruparPor === o.id ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {o.label}
            </button>
          ))}
        </div>

        <div className="text-[10px] font-bold text-slate-500 uppercase pt-1">Filtros opcionales</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input type="number" placeholder="N° de sección" value={seccionNumero} onChange={(e) => setSeccionNumero(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
          <select value={rol} onChange={(e) => setRol(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
            <option value="">Todos los roles</option>
            {Object.entries(ROL_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={clasificacion} onChange={(e) => setClasificacion(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
            <option value="">Todas las clasificaciones</option>
            <option value="base">Base</option>
            <option value="persuadible">Persuadible</option>
            <option value="adversario">Adversario</option>
          </select>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={generar} disabled={cargando}
            className="px-4 py-2 rounded-lg bg-fuchsia-600 text-white text-xs font-bold disabled:opacity-40">
            {cargando ? '⏳ Generando…' : '🔍 Generar reporte'}
          </button>
          <button onClick={descargarExcel}
            className="px-4 py-2 rounded-lg bg-emerald-700/50 text-emerald-300 text-xs font-bold">
            📥 Descargar Excel
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Tabla dinámica */}
      {resultado && !resultado.es_detalle && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-800/60 text-xs font-bold text-slate-300">{resultado.nombre_agrupacion}</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-800/40">
              <tr>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">{resultado.nombre_agrupacion}</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Total</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Base</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Persuadible</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Adversario</th>
              </tr>
            </thead>
            <tbody>
              {resultado.filas.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500 py-6">Sin datos para este filtro</td></tr>
              ) : resultado.filas.map((f, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-white font-bold">{f.etiqueta}</td>
                  <td className="px-3 py-2 text-center text-slate-300">{f.total}</td>
                  <td className="px-3 py-2 text-center text-purple-400">{f.comprometidos}</td>
                  <td className="px-3 py-2 text-center text-emerald-400">{f.base}</td>
                  <td className="px-3 py-2 text-center text-amber-400">{f.persuadible}</td>
                  <td className="px-3 py-2 text-center text-red-400">{f.adversario}</td>
                </tr>
              ))}
            </tbody>
            {resultado.filas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-800/40 font-black">
                  <td className="px-3 py-2 text-white">TOTAL</td>
                  <td className="px-3 py-2 text-center text-white">{resultado.totales.total}</td>
                  <td className="px-3 py-2 text-center text-purple-300">{resultado.totales.comprometidos}</td>
                  <td className="px-3 py-2 text-center text-emerald-300">{resultado.totales.base}</td>
                  <td className="px-3 py-2 text-center text-amber-300">{resultado.totales.persuadible}</td>
                  <td className="px-3 py-2 text-center text-red-300">{resultado.totales.adversario}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Detalle de promovidos (hasta 1000 filas) */}
      {resultado && resultado.es_detalle && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
          <div className="px-4 py-2 bg-slate-800/60 text-xs font-bold text-slate-300">Detalle de promovidos — {resultado.filas.length} registros (máx. 1000)</div>
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-slate-800/40">
              <tr>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">Nombre</th>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">Teléfono</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Sección</th>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">Municipio</th>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">Clasificación</th>
                <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometido</th>
                <th className="text-left px-3 py-2 text-slate-400 font-bold">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {resultado.filas.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-500 py-6">Sin datos para este filtro</td></tr>
              ) : resultado.filas.map((f, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-white font-bold whitespace-nowrap">{f.nombre}</td>
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{f.telefono}</td>
                  <td className="px-3 py-2 text-center text-slate-300">{f.seccion}</td>
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{f.municipio}</td>
                  <td className="px-3 py-2 text-slate-300">{f.clasificacion || 'Sin clasificar'}</td>
                  <td className="px-3 py-2 text-center text-purple-400">{f.comprometido}</td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{f.registrado_por || 'N/D'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 🗂️ FICHA DE ESTRUCTURA — reporte a nivel MUNICIPIO (se movió aquí
// desde Estructura: era un reporte de solo lectura, no gestión
// operativa del equipo, así que tiene más sentido junto con Ficha de
// Sección). Muestra quién es el encargado, sus ramificaciones (equipo
// completo) y los DATOS BRUTOS de promotores/promovidos de cada
// quien — sin promediar ni interpretar, tal como los pide el motor de
// reportes de /reportes-vototech-skills.
function PanelFichaEstructura() {
  const [municipios, setMunicipios] = useState([]);
  const [municipioId, setMunicipioId] = useState('');
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.get('/estructura/municipios-disponibles').then((r) => setMunicipios(r.data.data)).catch(() => setMunicipios([]));
  }, []);

  useEffect(() => {
    if (!municipioId) { setFicha(null); return; }
    setCargando(true);
    api.get(`/estructura/ficha-estructura/${municipioId}`)
      .then((r) => setFicha(r.data.data))
      .catch(() => setFicha(null))
      .finally(() => setCargando(false));
  }, [municipioId]);

  return (
    <div className="space-y-3">
      <select value={municipioId} onChange={(e) => setMunicipioId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm">
        <option value="">Elige un municipio de tu campaña...</option>
        {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
      </select>

      {cargando && <div className="text-center text-slate-500 py-6 text-sm">⏳ Cargando...</div>}

      {ficha && !cargando && (
        <div className="space-y-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">{ficha.municipio.nombre}</h2>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ficha.estado === 'ACTIVA' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{ficha.estado}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">👤 Encargado del municipio</h3>
            {ficha.responsable ? (
              <p className="text-sm text-white font-bold">{ficha.responsable.nombre} <span className="text-slate-500 font-normal">— {ficha.responsable.puesto || ficha.responsable.rol}</span></p>
            ) : (
              <p className="text-xs text-red-400">Sin responsable directo asignado a este municipio</p>
            )}
          </div>

          {/* 🆕 Ramificaciones — el árbol del encargado, con datos
              BRUTOS de promotores y promovidos de cada persona */}
          {ficha.ramificaciones && ficha.ramificaciones.ramas.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">🌳 Ramificaciones — datos brutos por rama</h3>
              <div className="space-y-3">
                {ficha.ramificaciones.ramas.map((rama) => (
                  <div key={rama.id} className="bg-slate-800/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <div className="text-sm font-bold text-white">{rama.nombre}</div>
                        <div className="text-[9px] text-slate-500">{rama.puesto || ROL_LABEL[rama.rol]} · {rama.total_personas_directas} promotores a su cargo</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-400">{rama.total_promovidos}</div>
                        <div className="text-[9px] text-slate-500">promovidos en la rama</div>
                      </div>
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400 mb-2">
                      <span>✋ Propio: {rama.propio_total_promovidos} ({rama.propio_comprometidos} comprometidos)</span>
                      <span className="text-purple-400">{rama.total_comprometidos} comprometidos en total</span>
                      {rama.total_duplicados > 0 && <span className="text-red-400">⚠️ {rama.total_duplicados} duplicados</span>}
                    </div>
                    {rama.promotores.length > 0 && (
                      <div className="space-y-1 border-t border-slate-700 pt-2">
                        {rama.promotores.map((p) => (
                          <div key={p.id} className="flex justify-between text-[10px]">
                            <span className="text-slate-300">{p.nombre} <span className="text-slate-600">({ROL_LABEL[p.rol] || p.rol})</span></span>
                            <span className={p.duplicados > 0 ? 'text-red-400' : 'text-slate-400'}>
                              {p.total_promovidos} promovidos{p.comprometidos > 0 && ` · ${p.comprometidos} comp.`}{p.duplicados > 0 && ` · ${p.duplicados} dup.`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">👥 Integrantes Autorizados — {ficha.integrantes.length}</h3>
            {ficha.integrantes.length === 0 ? (
              <p className="text-[11px] text-slate-500">Sin nadie asignado a secciones de este municipio</p>
            ) : ficha.integrantes.map((i) => (
              <p key={i.id} className="text-xs text-slate-300">{i.nombre} — {i.rol}</p>
            ))}
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">📈 Actividad (30 días)</h3>
            <p className="text-sm text-white font-bold">{ficha.actividad_30d} promovidos capturados</p>
          </div>

          {ficha.incidencias.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <h3 className="text-xs font-bold text-red-400 uppercase mb-2">🚨 Incidencias abiertas — {ficha.incidencias.length}</h3>
              {ficha.incidencias.map((i) => <p key={i.id} className="text-xs text-red-300">{i.tipo} — {i.urgencia}</p>)}
            </div>
          )}

          {ficha.historico.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">🕐 Histórico</h3>
              {ficha.historico.map((h, i) => (
                <p key={i} className="text-[11px] text-slate-400">{h.motivo} — {new Date(h.creado_en).toLocaleDateString('es-MX')}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Reportes() {
  const [tab, setTab] = useState('ficha-seccion');
  const [subTabActividad, setSubTabActividad] = useState('resumen');
  // 🆕 Ficha Inteligente de Sección — a diferencia de la del estado,
  // esta se busca por número (no tiene sentido cargar las 634 de
  // una vez).
  const [numeroBuscado, setNumeroBuscado] = useState('');
  const [fichaSeccion, setFichaSeccion] = useState(null);
  const [buscandoFicha, setBuscandoFicha] = useState(false);
  const [errorFicha, setErrorFicha] = useState('');
  const buscarFichaSeccion = async () => {
    if (!numeroBuscado) return;
    setBuscandoFicha(true);
    setErrorFicha('');
    try {
      const { data } = await api.get(`/reportes/ficha-seccion/${numeroBuscado}`);
      setFichaSeccion(data.data);
    } catch (e) { setErrorFicha(e.response?.data?.error || 'No se pudo cargar'); setFichaSeccion(null); }
    setBuscandoFicha(false);
  };
  const [actividadResumen, setActividadResumen] = useState(null);
  const [actividadPromotores, setActividadPromotores] = useState([]);
  const [actividadSecciones, setActividadSecciones] = useState([]);
  // 🆕 Mismo tratamiento que Bitácora diaria — filtro por estructura,
  // y agrupación territorial (sección/municipio/distrito) en vez de
  // solo ver sección por sección.
  const [filtroRolActividad, setFiltroRolActividad] = useState('todos');
  const [agruparTerritorioPor, setAgruparTerritorioPor] = useState('seccion');
  const [encuestasResumen, setEncuestasResumen] = useState(null);
  // 🆕 Ver los resultados reales de una encuesta específica
  const [encuestaDetalleId, setEncuestaDetalleId] = useState(null);

  useEffect(() => {
    api.get('/reportes/actividad-resumen').then((r) => setActividadResumen(r.data.data));
    api.get('/reportes/actividad-por-promotor').then((r) => setActividadPromotores(r.data.data));
    api.get('/reportes/actividad-por-seccion').then((r) => setActividadSecciones(r.data.data));
    api.get('/reportes/encuestas-resumen').then((r) => setEncuestasResumen(r.data.data));
  }, []);

  // 🆕 Actividad de Campo — filtro por rol (misma lógica que Bitácora)
  const actividadPromotoresFiltrada = actividadPromotores.filter((p) => {
    if (filtroRolActividad === 'todos') return true;
    if (filtroRolActividad === 'lideres') return ROL_ES_LIDER.includes(p.rol);
    return p.rol === filtroRolActividad;
  });
  const rolesConDatosActividad = [...new Set(actividadPromotores.map((p) => p.rol))].filter(Boolean);

  // 🆕 Agrupar la actividad territorial por sección, municipio, o
  // distrito — antes solo se podía ver sección por sección.
  const actividadAgrupada = (() => {
    if (agruparTerritorioPor === 'seccion') return actividadSecciones;
    const clave = agruparTerritorioPor === 'municipio' ? 'municipio' : agruparTerritorioPor === 'distrito_local' ? 'distrito_local' : 'distrito_federal';
    const grupos = {};
    actividadSecciones.forEach((s) => {
      const k = s[clave] ?? 'Sin dato';
      if (!grupos[k]) grupos[k] = { etiqueta: k, total_promovidos: 0, comprometidos: 0, promotores_set: new Set() };
      grupos[k].total_promovidos += parseInt(s.total_promovidos);
      grupos[k].comprometidos += parseInt(s.comprometidos);
    });
    return Object.values(grupos).sort((a, b) => b.total_promovidos - a.total_promovidos);
  })();
  const maxActividadAgrupada = Math.max(1, ...actividadAgrupada.map((a) => parseInt(a.total_promovidos)));

  return (
    <div className="space-y-5">
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/exportar/promovidos', 'reporte_promovidos.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold">
              📥 Excel
            </button>
            <button onClick={() => descargarArchivo('/reportes/cierre-campana-pdf', 'reporte_cierre_campana.pdf')}
              className="px-3 py-2.5 rounded-xl bg-red-700/50 text-red-300 text-sm font-bold">
              📄 Reporte de cierre (PDF)
            </button>
          </div>
        </div>

        {/* 🆕 Antes esto se veía casi igual que las pestañas de abajo
            — por eso no quedaba claro que son botones para DESCARGAR
            un PDF, no para navegar. Ahora tienen su propio bloque,
            con etiqueta clara y estilo de "botón de acción", no de
            pestaña. */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">📥 Descargar reporte en PDF</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => descargarArchivo('/reportes/pdf/juridico', 'reporte_juridico.pdf')} className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 rounded-lg border border-indigo-500/20">⬇️ Jurídico</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/estructura', 'reporte_estructura.pdf')} className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 rounded-lg border border-indigo-500/20">⬇️ Estructura</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/incidencias', 'reporte_incidencias.pdf')} className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 rounded-lg border border-indigo-500/20">⬇️ Incidencias</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/encuestas', 'reporte_encuestas.pdf')} className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 rounded-lg border border-indigo-500/20">⬇️ Encuestas</button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('ficha-seccion')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'ficha-seccion' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📍 Ficha de Sección</button>
          <button onClick={() => setTab('ficha-estructura')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'ficha-estructura' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗂️ Ficha de Estructura</button>
          <button onClick={() => setTab('actividad')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'actividad' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Actividad de Campo</button>
          <button onClick={() => setTab('encuestas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'encuestas' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Encuestas</button>
          <button onClick={() => setTab('personalizado')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'personalizado' ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🧩 Reportes Personalizados</button>
        </div>

        {tab === 'ficha-seccion' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="number" placeholder="Número de sección (ej: 178)" value={numeroBuscado} onChange={(e) => setNumeroBuscado(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarFichaSeccion()}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <button onClick={buscarFichaSeccion} disabled={buscandoFicha || !numeroBuscado}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
                {buscandoFicha ? '⏳' : '🔍 Buscar'}
              </button>
            </div>
            {errorFicha && <p className="text-xs text-red-400">{errorFicha}</p>}

            {fichaSeccion && (
              <div className="space-y-3">
                {/* Identificación */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-lg font-black text-white">Sección {fichaSeccion.identificacion.numero}</div>
                  <div className="text-xs text-slate-400">
                    {fichaSeccion.identificacion.municipio} · Distrito Local {fichaSeccion.identificacion.distrito_local} · Distrito Federal {fichaSeccion.identificacion.distrito_federal}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Lista nominal: {fichaSeccion.identificacion.lista_nominal?.toLocaleString() || 'N/D'}</div>
                </div>

                {/* Score Territorial explicable */}
                {fichaSeccion.score_territorial !== null && (
                  <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-300">🎯 Score Territorial</span>
                      <span className="text-2xl font-black text-white">{fichaSeccion.score_territorial}<span className="text-sm text-slate-500">/100</span></span>
                    </div>
                    <div className="space-y-2">
                      {fichaSeccion.score_componentes.map((c) => (
                        <div key={c.nombre}>
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-slate-300">{c.nombre}</span>
                            <span className="text-slate-400 font-bold">{c.puntos !== null ? `${c.puntos}/${c.de}` : 'Sin dato'}</span>
                          </div>
                          {c.puntos !== null && (
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${(c.puntos / c.de) * 100}%` }} />
                            </div>
                          )}
                          <p className="text-[9px] text-slate-500 mt-0.5">📎 {c.fuente}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Histórico + tendencia */}
                {fichaSeccion.historico.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">📈 Histórico electoral</div>
                    {fichaSeccion.tendencia && (
                      <div className={`text-[11px] font-bold mb-2 ${fichaSeccion.tendencia.direccion === 'subiendo' ? 'text-emerald-400' : fichaSeccion.tendencia.direccion === 'bajando' ? 'text-red-400' : 'text-slate-400'}`}>
                        {fichaSeccion.tendencia.direccion === 'subiendo' ? '📈' : fichaSeccion.tendencia.direccion === 'bajando' ? '📉' : '➡️'} Tendencia: {fichaSeccion.tendencia.direccion} ({fichaSeccion.tendencia.diferencia_pct > 0 ? '+' : ''}{fichaSeccion.tendencia.diferencia_pct} pts)
                      </div>
                    )}
                    {fichaSeccion.historico.map((h) => (
                      <div key={h.anio} className="mb-3">
                        <div className="text-xs font-bold text-slate-400 mb-1.5">{h.anio}</div>
                        <div className="space-y-1">
                          {Object.entries(h.por_partido).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
                            <div key={p} className="flex items-center justify-between text-sm bg-slate-800/40 rounded-lg px-3 py-1.5">
                              <span className="flex items-center gap-2 font-bold text-white">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PARTIDOS_COLOR[p] || '#64748b' }} />
                                {p.toUpperCase()}
                              </span>
                              <span className="text-slate-300">{v.toLocaleString()} <span className="text-slate-500">({h.total > 0 ? Math.round((v / h.total) * 100) : 0}%)</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Estructura + cobertura */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2">🗂️ Estructura y cobertura</div>
                  {fichaSeccion.estructura.length === 0 ? (
                    <p className="text-[11px] text-amber-400">⚠️ Sin coordinador asignado a esta sección</p>
                  ) : fichaSeccion.estructura.map((e) => (
                    <p key={e.id} className="text-[11px] text-slate-300">👤 {e.nombre} — {e.puesto || e.rol}</p>
                  ))}
                  <p className="text-[11px] text-slate-400 mt-1">
                    🗳️ Casillas: {fichaSeccion.cobertura_casillas.con_representante}/{fichaSeccion.cobertura_casillas.total} con representante asignado
                  </p>
                </div>

                {/* Actividad */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2">🤝 Actividad</div>
                  <p className="text-[11px] text-slate-300">{fichaSeccion.actividad.total_promovidos} promovidos totales ({fichaSeccion.actividad.comprometidos} comprometidos) — {fichaSeccion.actividad.ultimos_30_dias} nuevos en los últimos 30 días</p>
                </div>

                {/* Riesgo de llenado */}
                {fichaSeccion.riesgo_llenado && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">⚠️ Riesgo de llenado de actas (ITE, por distrito)</div>
                    <p className="text-[11px] text-slate-300">{fichaSeccion.riesgo_llenado.porcentaje_consistente}% de actas consistentes — nivel: {fichaSeccion.riesgo_llenado.nivel_riesgo}</p>
                  </div>
                )}

                {/* 🆕 Promotores por estructura — quién ha trabajado
                    esta sección de verdad, y de qué coordinador
                    depende cada uno. */}
                {fichaSeccion.promotores_por_estructura?.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">👥 Promotores que han trabajado aquí — {fichaSeccion.promotores_por_estructura.length}</div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {fichaSeccion.promotores_por_estructura.map((p) => (
                        <div key={p.id} className="flex justify-between items-center text-[11px] border-b border-slate-800 last:border-0 py-1">
                          <div>
                            <span className="text-slate-200 font-bold">{p.nombre}</span>
                            <span className="text-slate-500"> · {p.jefe_directo ? `depende de ${p.jefe_directo}` : 'sin jefe directo'}</span>
                          </div>
                          <span className="text-emerald-400 font-bold">{p.promovidos_aqui}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 🆕 Reuniones realizadas en esta sección */}
                {fichaSeccion.reuniones && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">📅 Reuniones</div>
                    <p className="text-[11px] text-slate-300">{fichaSeccion.reuniones.realizadas} de {fichaSeccion.reuniones.total} realizadas en esta sección</p>
                  </div>
                )}

                {/* 🆕 Inversión y rentabilidad — cuánto se le ha
                    puesto a esta sección, y si eso se refleja en
                    resultados reales (comprometidos). */}
                {fichaSeccion.inversion && (
                  <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4">
                    <div className="text-xs font-bold text-amber-300 uppercase mb-2">💰 Inversión y rentabilidad</div>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <div className="text-lg font-black text-white">${fichaSeccion.inversion.inversion_total_materiales.toLocaleString()}</div>
                        <div className="text-[9px] text-slate-500">Invertido en materiales aquí</div>
                      </div>
                      <div>
                        <div className="text-lg font-black text-white">{fichaSeccion.inversion.costo_por_comprometido !== null ? `$${fichaSeccion.inversion.costo_por_comprometido}` : 'N/D'}</div>
                        <div className="text-[9px] text-slate-500">Costo por comprometido</div>
                      </div>
                    </div>
                    {fichaSeccion.inversion.materiales.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {fichaSeccion.inversion.materiales.map((m, i) => (
                          <div key={i} className="flex justify-between text-[10px] text-slate-300">
                            <span>{m.tipo}{m.subtipo ? ` — ${m.subtipo}` : ''} (x{m.cantidad || 1})</span>
                            <span>${parseFloat(m.costo || 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[9px] text-slate-500">{fichaSeccion.inversion.nota}</p>
                  </div>
                )}

                {/* Incidencias */}
                {fichaSeccion.incidencias.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">🚨 Incidencias recientes</div>
                    {fichaSeccion.incidencias.map((i) => (
                      <p key={i.id} className="text-[11px] text-slate-300">{i.tipo} — {i.urgencia} ({i.estado})</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 🗂️ FICHA DE ESTRUCTURA — reporte a nivel municipio */}
        {tab === 'ficha-estructura' && <PanelFichaEstructura />}

        {/* ── 🎯 ACTIVIDAD DE CAMPO — Resumen / Por promotor / Por sección ── */}
        {tab === 'actividad' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setSubTabActividad('resumen')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'resumen' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Resumen</button>
              <button onClick={() => setSubTabActividad('promotor')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'promotor' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Por estructura</button>
              <button onClick={() => setSubTabActividad('seccion')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'seccion' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Por territorio</button>
            </div>

            {subTabActividad === 'resumen' && actividadResumen && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900/60 border border-emerald-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-emerald-400">{actividadResumen.total_reportes}</div>
                    <div className="text-[9px] text-slate-500">Reportes de campo</div>
                  </div>
                  <div className="bg-slate-900/60 border border-blue-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-blue-400">{actividadResumen.personas_contactadas}</div>
                    <div className="text-[9px] text-slate-500">Personas contactadas</div>
                  </div>
                  <div className="bg-slate-900/60 border border-purple-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-purple-400">{actividadResumen.comprometidos} ({actividadResumen.pct_comprometidos}%)</div>
                    <div className="text-[9px] text-slate-500">Comprometidos a votar</div>
                  </div>
                  <div className="bg-slate-900/60 border border-amber-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-amber-400">{actividadResumen.secciones_cubiertas}</div>
                    <div className="text-[9px] text-slate-500">Secciones cubiertas</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Actividades por tipo</h3>
                    {Object.keys(actividadResumen.actividades_por_tipo).length === 0 ? (
                      <div className="text-[11px] text-slate-500">Sin reportes</div>
                    ) : Object.entries(actividadResumen.actividades_por_tipo).map(([tipo, n]) => (
                      <div key={tipo} className="flex justify-between text-xs py-1"><span className="text-slate-300 capitalize">{tipo}</span><span className="text-white font-bold">{n}</span></div>
                    ))}
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Reportes últimos 7 días</h3>
                    {actividadResumen.ultimos_7_dias.every((d) => d.total === 0) ? (
                      <div className="text-[11px] text-slate-500">Sin actividad reciente</div>
                    ) : (
                      <div className="flex items-end gap-1 h-16">
                        {actividadResumen.ultimos_7_dias.map((d) => (
                          <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-emerald-500 rounded-t" style={{ height: `${Math.max(4, (d.total / Math.max(...actividadResumen.ultimos_7_dias.map(x => x.total), 1)) * 100)}%` }} />
                            <span className="text-[7px] text-slate-600">{new Date(d.fecha).getDate()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Promotores activos — {actividadResumen.promotores_activos} en total</h3>
                  {actividadResumen.promotores.length === 0 ? (
                    <div className="text-[11px] text-slate-500">Sin promotores registrados</div>
                  ) : actividadResumen.promotores.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                      <span className="text-slate-300">{p.nombre}</span>
                      <span className="text-emerald-400 font-bold">{p.total_promovidos}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {subTabActividad === 'promotor' && (
              <div className="space-y-3">
                {/* 🆕 Filtro por rol — mismo criterio que Bitácora diaria */}
                <select value={filtroRolActividad} onChange={(e) => setFiltroRolActividad(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  <option value="todos">Todos los niveles</option>
                  <option value="lideres">Solo líderes/coordinadores</option>
                  {rolesConDatosActividad.map((r) => <option key={r} value={r}>{ROL_LABEL[r] || r}</option>)}
                </select>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-400 font-bold">Nombre</th>
                        <th className="text-left px-3 py-2 text-slate-400 font-bold">Rol</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-bold">Total</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-bold">Últimos 7 días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actividadPromotoresFiltrada.length === 0 ? (
                        <tr><td colSpan={5} className="text-center text-slate-500 py-6">Sin actividad para este filtro</td></tr>
                      ) : actividadPromotoresFiltrada.map((p) => (
                        <tr key={p.id} className="border-t border-slate-800">
                          <td className="px-3 py-2 text-white font-bold">{p.nombre}{p.puesto && <span className="text-slate-500 font-normal"> · {p.puesto}</span>}</td>
                          <td className="px-3 py-2 text-slate-400">{ROL_LABEL[p.rol] || p.rol}</td>
                          <td className="px-3 py-2 text-center text-slate-300">{p.total_promovidos}</td>
                          <td className="px-3 py-2 text-center text-purple-400">{p.comprometidos}</td>
                          <td className="px-3 py-2 text-center text-emerald-400">{p.ultimos_7_dias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {subTabActividad === 'seccion' && (
              <div className="space-y-3">
                {/* 🆕 Agrupar por sección, municipio, distrito local o
                    federal — antes solo se veía sección por sección. */}
                <div className="flex gap-2 flex-wrap">
                  {[['seccion', 'Sección'], ['municipio', 'Municipio'], ['distrito_local', 'Distrito Local'], ['distrito_federal', 'Distrito Federal']].map(([id, label]) => (
                    <button key={id} onClick={() => setAgruparTerritorioPor(id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${agruparTerritorioPor === id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* 🆕 Gráfica de barras — top territorios por actividad */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Top 10 — promovidos por {agruparTerritorioPor === 'seccion' ? 'sección' : agruparTerritorioPor === 'municipio' ? 'municipio' : agruparTerritorioPor === 'distrito_local' ? 'distrito local' : 'distrito federal'}</h3>
                  <div className="space-y-2">
                    {actividadAgrupada.slice(0, 10).map((a) => (
                      <div key={a.seccion_numero || a.etiqueta}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-slate-300">{agruparTerritorioPor === 'seccion' ? String(a.seccion_numero).padStart(3, '0') : a.etiqueta}</span>
                          <span className="text-slate-400 font-bold">{a.total_promovidos}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${(a.total_promovidos / maxActividadAgrupada) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-400 font-bold">{agruparTerritorioPor === 'seccion' ? 'Sección' : agruparTerritorioPor === 'municipio' ? 'Municipio' : agruparTerritorioPor === 'distrito_local' ? 'Distrito Local' : 'Distrito Federal'}</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-bold">Promovidos</th>
                        <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                        {agruparTerritorioPor === 'seccion' && <th className="text-center px-3 py-2 text-slate-400 font-bold">Promotores</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {actividadAgrupada.length === 0 ? (
                        <tr><td colSpan={4} className="text-center text-slate-500 py-6">Sin actividad todavía</td></tr>
                      ) : actividadAgrupada.map((s) => (
                        <tr key={s.seccion_numero || s.etiqueta} className="border-t border-slate-800">
                          <td className="px-3 py-2 text-white font-bold">{agruparTerritorioPor === 'seccion' ? String(s.seccion_numero).padStart(3, '0') : s.etiqueta}</td>
                          <td className="px-3 py-2 text-center text-slate-300">{s.total_promovidos}</td>
                          <td className="px-3 py-2 text-center text-purple-400">{s.comprometidos}</td>
                          {agruparTerritorioPor === 'seccion' && <td className="px-3 py-2 text-center text-emerald-400">{s.promotores_activos}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 📋 CONCENTRADO DE ENCUESTAS — por municipio y por sección */}
        {tab === 'encuestas' && encuestasResumen && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-slate-900/60 border border-pink-800/40 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-pink-400">{encuestasResumen.total_encuestas}</div>
                <div className="text-[9px] text-slate-500">Encuestas creadas</div>
              </div>
              <div className="bg-slate-900/60 border border-indigo-800/40 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-indigo-400">{encuestasResumen.total_respuestas}</div>
                <div className="text-[9px] text-slate-500">Respuestas totales</div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Por encuesta</h3>
              {encuestasResumen.encuestas.length === 0 ? (
                <div className="text-[11px] text-slate-500 text-center py-3">Sin encuestas todavía — créalas desde Promovidos</div>
              ) : encuestasResumen.encuestas.map((e) => (
                <button key={e.id} onClick={() => setEncuestaDetalleId(e.id)}
                  className="w-full flex justify-between text-xs py-1.5 border-b border-slate-800 last:border-0 hover:bg-slate-800/40 rounded px-1">
                  <span className="text-slate-300">{e.titulo}</span>
                  <span className="text-white font-bold">{e.total_respuestas} → ver resultados</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Respuestas por municipio</h3>
                {encuestasResumen.por_municipio.length === 0 ? (
                  <div className="text-[11px] text-slate-500">Sin ubicación registrada todavía</div>
                ) : encuestasResumen.por_municipio.map((m) => (
                  <div key={m.municipio} className="flex justify-between text-xs py-1">
                    <span className="text-slate-300">{m.municipio}</span>
                    <span className="text-white font-bold">{m.total}</span>
                  </div>
                ))}
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Top secciones con respuestas</h3>
                {encuestasResumen.por_seccion.length === 0 ? (
                  <div className="text-[11px] text-slate-500">Sin ubicación registrada todavía</div>
                ) : encuestasResumen.por_seccion.map((s) => (
                  <div key={s.seccion_numero} className="flex justify-between text-xs py-1">
                    <span className="text-slate-300">Sección {s.seccion_numero} {s.municipio && `(${s.municipio})`}</span>
                    <span className="text-white font-bold">{s.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 🧩 REPORTES PERSONALIZADOS — tablas dinámicas filtrables */}
        {tab === 'personalizado' && <PanelReportesPersonalizados />}

        {encuestaDetalleId && <ModalResultadosEncuesta encuestaId={encuestaDetalleId} onCerrar={() => setEncuestaDetalleId(null)} />}
    </div>
  );
}

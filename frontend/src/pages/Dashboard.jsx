import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import Panel2FA from '../components/Panel2FA';
import { useAuth } from '../lib/authStore';

const ROL_CORTO = { coord_general: 'Coord. General', coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional' };
const ICONO_ACTIVO = { espectacular: '📺', barda: '🧱', manta: '🎏', ine_representante: '🗳️', utilitario: '👕' };
const NOMBRE_ACTIVO = { espectacular: 'Espectaculares', barda: 'Bardas', manta: 'Mantas', ine_representante: 'Representantes', utilitario: 'Utilitarios' };

function Gauge({ porcentaje }) {
  const pct = Math.min(100, Math.max(0, porcentaje));
  const angulo = (pct / 100) * 180;
  const r = 70, cx = 90, cy = 90;
  const puntoFinal = { x: cx + r * Math.cos(Math.PI - (angulo * Math.PI) / 180), y: cy - r * Math.sin(Math.PI - (angulo * Math.PI) / 180) };
  const largeArc = angulo > 180 ? 1 : 0;

  return (
    <svg viewBox="0 0 180 100" className="w-40 h-24">
      <path d={`M 20 90 A 70 70 0 0 1 160 90`} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
      {pct > 0 && (
        <path d={`M 20 90 A 70 70 0 ${largeArc} 1 ${puntoFinal.x} ${puntoFinal.y}`} fill="none" stroke="url(#grad)" strokeWidth="14" strokeLinecap="round" />
      )}
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="90" r="4" fill="#ef4444" />
      <circle cx="160" cy="90" r="4" fill="#ef4444" />
      <text x="90" y="72" textAnchor="middle" className="fill-white" style={{ fontSize: 26, fontWeight: 900 }}>{pct}%</text>
      <text x="90" y="88" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>de la meta</text>
    </svg>
  );
}

function GraficaTendencia({ datos }) {
  if (!datos || datos.length === 0) return null;
  const ancho = 600, alto = 160, margen = { arriba: 15, abajo: 30, izq: 10, der: 10 };
  const maxValor = Math.max(1, ...datos.map((d) => d.total));
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.arriba - margen.abajo;
  const paso = anchoUtil / (datos.length - 1 || 1);

  const puntos = datos.map((d, i) => ({
    x: margen.izq + i * paso,
    y: margen.arriba + altoUtil - (d.total / maxValor) * altoUtil,
    ...d,
  }));
  const lineaPath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${lineaPath} L ${puntos[puntos.length - 1].x} ${margen.arriba + altoUtil} L ${puntos[0].x} ${margen.arriba + altoUtil} Z`;

  const saltoEtiqueta = datos.length > 10 ? 3 : 2;

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto">
      <defs>
        <linearGradient id="gradTendencia" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#gradTendencia)" />
      <path d={lineaPath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#818cf8" />
          {i % saltoEtiqueta === 0 && (
            <text x={p.x} y={alto - 10} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
              {new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
            </text>
          )}
          {p.total > 0 && (
            <text x={p.x} y={p.y - 8} textAnchor="middle" className="fill-indigo-300" style={{ fontSize: 9, fontWeight: 700 }}>{p.total}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function GraficaBarras({ datos }) {
  if (!datos || datos.length === 0) return null;
  const maxValor = Math.max(1, ...datos.map((d) => d.total));
  return (
    <div className="space-y-2">
      {datos.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 w-16 flex-shrink-0 text-right truncate">{d.nombre}</span>
          <div className="flex-1 h-5 bg-slate-800 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md flex items-center justify-end px-1.5"
              style={{ width: `${Math.max(6, (d.total / maxValor) * 100)}%`, background: `linear-gradient(90deg, #6366f1, #a855f7)` }}
            >
              <span className="text-[9px] font-bold text-white">{d.total}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GraficaDona({ base, persuadible, adversario }) {
  const total = base + persuadible + adversario;
  if (total === 0) return <div className="text-xs text-slate-500 text-center py-4">Sin promovidos clasificados todavía</div>;

  const r = 45, cx = 55, cy = 55, grosor = 16;
  const circunferencia = 2 * Math.PI * r;
  const segmentos = [
    { valor: base, color: '#10b981', label: 'Base' },
    { valor: persuadible, color: '#f59e0b', label: 'Persuadible' },
    { valor: adversario, color: '#64748b', label: 'Adversario' },
  ];
  let acumulado = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="w-28 h-28 flex-shrink-0">
        {segmentos.map((s, i) => {
          const largo = (s.valor / total) * circunferencia;
          const offset = -((acumulado / total) * circunferencia);
          acumulado += s.valor;
          if (s.valor === 0) return null;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={grosor}
              strokeDasharray={`${largo} ${circunferencia - largo}`} strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-white" style={{ fontSize: 20, fontWeight: 900 }}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>promovidos</text>
      </svg>
      <div className="space-y-1.5 flex-1">
        {segmentos.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />{s.label}</span>
            <span className="font-bold text-white">{s.valor} <span className="text-slate-500 font-normal">({total > 0 ? Math.round(s.valor / total * 100) : 0}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const usuario = useAuth((s) => s.usuario);
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [encuestasResumen, setEncuestasResumen] = useState(null);
  const [alertasInteligentes, setAlertasInteligentes] = useState([]);
  const [vistaEjecutiva, setVistaEjecutiva] = useState(false);
  const [ejecutivo, setEjecutivo] = useState(null);

  useEffect(() => {
    api.get('/dashboard/resumen').then((r) => { setD(r.data.data); setCargando(false); }).catch(() => setCargando(false));
    api.get('/reportes/encuestas-resumen').then((r) => setEncuestasResumen(r.data.data)).catch(() => {});
    api.get('/inteligencia/alertas').then((r) => setAlertasInteligentes(r.data.data)).catch(() => {});
    api.get('/dashboard/ejecutivo').then((r) => setEjecutivo(r.data.data)).catch(() => {});
  }, []);

  if (cargando || !d) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Calculando panel de mando...</div>;
  }

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
  const maxDistrito = Math.max(1, ...d.actividad_por_distrito.map((a) => parseInt(a.total)));
  const ALERTA_ESTILO = {
    critica: 'bg-red-500/10 border-red-500/40 text-red-300',
    advertencia: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
    meta: 'bg-purple-500/10 border-purple-500/40 text-purple-300',
    info: 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300',
  };
  const ALERTA_ICONO = { critica: '⚠️', advertencia: '📋', meta: '🎯', info: '💡' };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Hola, {usuario?.nombre?.split(' ')[0] || 'Equipo'} 👋</h1>
            <p className="text-sm text-slate-500">Panel de mando — {d.candidato}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setVistaEjecutiva((v) => !v)}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${vistaEjecutiva ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              {vistaEjecutiva ? '📊 Vista completa' : '⚡ Vista ejecutiva'}
            </button>
            <Link to="/mapa" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">🗺️ Ver mapa</Link>
          </div>
        </div>

        {vistaEjecutiva && ejecutivo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="bg-slate-900/60 border border-indigo-800/30 rounded-2xl p-5">
                <div className="text-3xl font-black text-indigo-400">{ejecutivo.cobertura_pct}%</div>
                <div className="text-xs text-slate-400 mt-1">🟢 Cobertura territorial</div>
                <div className="text-[10px] text-slate-600 mt-1">{ejecutivo.secciones_con_presencia} de {ejecutivo.total_secciones} secciones con presencia</div>
              </div>
              <div className="bg-slate-900/60 border border-emerald-800/30 rounded-2xl p-5">
                <div className="text-3xl font-black text-emerald-400">{ejecutivo.voto_estimado.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-1">🟢 Voto estimado (comprometidos)</div>
                {ejecutivo.meta_votos && <div className="text-[10px] text-slate-600 mt-1">Meta: {ejecutivo.meta_votos.toLocaleString()}</div>}
              </div>
              <div className={`bg-slate-900/60 border rounded-2xl p-5 ${ejecutivo.municipios_riesgo > 0 ? 'border-red-800/40' : 'border-emerald-800/30'}`}>
                <div className={`text-3xl font-black ${ejecutivo.municipios_riesgo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{ejecutivo.municipios_riesgo}</div>
                <div className="text-xs text-slate-400 mt-1">🟢 Municipios en riesgo</div>
                <div className="text-[10px] text-slate-600 mt-1">de {ejecutivo.total_municipios} en tu territorio</div>
              </div>
              <div className="bg-slate-900/60 border border-purple-800/30 rounded-2xl p-5">
                <div className="text-3xl font-black text-purple-400">{ejecutivo.estructura_activa_pct}%</div>
                <div className="text-xs text-slate-400 mt-1">🟢 Estructura activa</div>
                <div className="text-[10px] text-slate-600 mt-1">{ejecutivo.promotores_activos} de {ejecutivo.total_promotores} promotores trabajando esta semana</div>
              </div>
              <div className="bg-slate-900/60 border border-amber-800/30 rounded-2xl p-5 md:col-span-2 xl:col-span-1">
                <div className="text-3xl font-black text-amber-400">{ejecutivo.avance_diario}</div>
                <div className="text-xs text-slate-400 mt-1">🟢 Avance diario (promedio últimos 7 días)</div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📈 Tendencia — promovidos por día (últimos 14 días)</h3>
              {ejecutivo.tendencia_14_dias?.some((t) => t.total > 0) ? (
                <GraficaTendencia datos={ejecutivo.tendencia_14_dias} />
              ) : (
                <div className="text-xs text-slate-500 text-center py-6">Sin actividad registrada en los últimos 14 días</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📊 Dónde se está trabajando más</h3>
                {ejecutivo.comparativo_territorio?.length > 0 ? (
                  <GraficaBarras datos={ejecutivo.comparativo_territorio} />
                ) : (
                  <div className="text-xs text-slate-500 text-center py-6">Sin promovidos con sección registrada todavía</div>
                )}
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">🍩 Distribución estratégica</h3>
                <GraficaDona
                  base={ejecutivo.distribucion_clasificacion?.base || 0}
                  persuadible={ejecutivo.distribucion_clasificacion?.persuadible || 0}
                  adversario={ejecutivo.distribucion_clasificacion?.adversario || 0}
                />
              </div>
            </div>
          </div>
        ) : (
        <>

        {alertasInteligentes.length > 0 && (
          <div className="bg-gradient-to-br from-slate-900 to-purple-950/40 border border-purple-800/30 rounded-2xl p-4">
            <h2 className="text-xs font-bold text-purple-300 uppercase mb-3 flex items-center gap-1.5">🧠 Inteligencia Electoral</h2>
            <div className="space-y-2">
              {alertasInteligentes.map((a, i) => {
                const COLOR = { alta: 'border-red-500/40 bg-red-500/5', media: 'border-amber-500/40 bg-amber-500/5', info: 'border-emerald-500/40 bg-emerald-500/5' };
                return (
                  <Link key={i} to={a.enlace} className={`block rounded-xl border p-3 hover:brightness-125 transition ${COLOR[a.severidad]}`}>
                    <div className="flex gap-2 items-start">
                      <span className="text-lg flex-shrink-0">{a.icono}</span>
                      <p className="text-xs text-slate-200 leading-relaxed">{a.mensaje}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/60 border border-indigo-800/30 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-6">
          <Gauge porcentaje={d.meta_electoral.porcentaje} />
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🎯</span>
              <h2 className="font-black text-white">Avance hacia la meta electoral</h2>
            </div>
            <p className="text-[10px] text-indigo-300 mb-3">
              Cuantifica <strong>promovidos</strong>, no votos — verificar por quién vota alguien es ilegal (coacción de voto), así que no se puede medir. Los promovidos comprometidos son el indicador más honesto disponible del avance real hacia tu meta.
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full bg-purple-500" />Promovidos registrados</span><strong className="text-purple-400">{d.meta_electoral.promovidos_registrados}</strong></div>
              <div className="flex justify-between"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />Meta de votos</span><strong className="text-emerald-400">{d.meta_electoral.meta_votos.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-500" />Faltan para la meta</span><strong className="text-amber-400">{d.meta_electoral.faltan_para_meta.toLocaleString()}</strong></div>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${d.meta_electoral.porcentaje}%` }} />
            </div>
            {d.meta_electoral.ritmo_necesario != null && (
              <p className="text-[11px] text-slate-500 mt-2">Ritmo necesario: <strong className="text-amber-400">{d.meta_electoral.ritmo_necesario} promovidos/día</strong> durante {d.meta_electoral.dias_restantes} días</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            ['secciones_ganadas', '🟢', 'Secciones ganadas', 'border-emerald-700/50', 'text-emerald-400'],
            ['secciones_con_promotores', '🔵', 'Secciones con promotores', 'border-blue-700/50', 'text-blue-400'],
            ['secciones_perdidas', '🔴', 'Secciones perdidas', 'border-red-700/50', 'text-red-400'],
            ['promovidos_hoy', '🟣', 'Promovidos hoy', 'border-purple-700/50', 'text-purple-400'],
            ['comprometidos_hoy', '🟡', 'Comprometidos hoy', 'border-indigo-700/50', 'text-indigo-400'],
            ['incidencias_activas', '🟢', 'Incidencias activas', 'border-emerald-700/50', 'text-emerald-400'],
          ].map(([key, ico, label, border, color]) => (
            <div key={key} className={`bg-slate-900/60 border ${border} rounded-xl p-3`}>
              <div className={`text-2xl font-black ${color}`}>{d.kpis[key]}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">⚠️ Alertas del sistema</h3>
            <div className="space-y-2">
              {d.alertas.map((a, i) => (
                <div key={i} className={`text-xs rounded-lg border px-3 py-2 ${ALERTA_ESTILO[a.tipo]}`}>{ALERTA_ICONO[a.tipo]} {a.texto}</div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">🔴 Secciones más críticas</h3>
            <div className="space-y-2">
              {d.secciones_criticas.length === 0 ? <div className="text-xs text-slate-500">Sin secciones críticas por ahora</div> :
                d.secciones_criticas.map((s) => (
                  <div key={s.seccion} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-white font-bold w-8">{s.seccion}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${Math.min(100, s.deficit_votos / 3)}%` }} /></div>
                    <span className="text-red-400 text-[10px] flex-shrink-0">-{s.deficit_votos} votos</span>
                  </div>
                ))}
            </div>
            <Link to="/priorizacion" className="text-[10px] font-bold text-indigo-400 block pt-2">Ver todas en Priorización →</Link>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📅 Agenda de hoy</h3>
            {d.agenda_hoy.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Sin eventos programados hoy</div>
            ) : (
              <div className="space-y-2">
                {d.agenda_hoy.map((e, i) => (
                  <div key={i} className="text-xs">
                    <div className="font-bold text-white">{e.titulo}</div>
                    <div className="text-slate-500">{new Date(e.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {e.lugar && `· ${e.lugar}`}</div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/agenda" className="text-[10px] font-bold text-indigo-400 block pt-2">+ Agregar evento →</Link>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">🔥 Actividad de campo — últimos 7 días por distrito local</h3>
          {d.actividad_por_distrito.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-2">Sin actividad reciente registrada</div>
          ) : (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {d.actividad_por_distrito.map((a) => {
                  const intensidad = parseInt(a.total) / maxDistrito;
                  const color = intensidad > 0.66 ? '#22c55e' : intensidad > 0.33 ? '#eab308' : '#ef4444';
                  return (
                    <div key={a.distrito_local} className="w-11 h-11 rounded-lg flex items-center justify-center text-xs font-black text-white" style={{ background: color, opacity: 0.3 + intensidad * 0.7 }} title={`${a.total} contactos`}>
                      {a.distrito_local}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2">
                <span>Sin actividad</span>
                <div className="flex-1 h-1.5 mx-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500" />
                <span>Muy activo</span>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">👤 Actividad reciente de promotores</h3>
            {d.actividad_reciente.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Sin reportes registrados</div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {d.actividad_reciente.map((r, i) => (
                  <div key={i} className="text-xs flex items-center justify-between">
                    <span className="text-slate-300"><strong className="text-white">{r.promotor}</strong> registró a {r.promovido}</span>
                    <span className="text-slate-500 text-[10px]">Secc. {r.seccion_numero}</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/promovidos" className="text-[10px] font-bold text-indigo-400 block pt-2">Ver todos los reportes →</Link>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            {d.mejor_promotor && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">🏆 Mejor promotor</h3>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">🥇 {d.mejor_promotor.nombre}</span>
                  <span className="text-amber-400 text-xs font-bold">{d.mejor_promotor.total_promovidos} promovidos</span>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">🗂️ Coordinadores</h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {d.coordinadores.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{c.nombre} <span className="text-slate-600">({ROL_CORTO[c.rol]})</span></span>
                    <span className="text-slate-400">{c.equipo} equipo · {c.promovidos_equipo} prom.</span>
                  </div>
                ))}
              </div>
              <Link to="/estructura" className="text-[10px] font-bold text-indigo-400 block pt-2">Ver estructura completa →</Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📺 Activos de campaña</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(NOMBRE_ACTIVO).map((tipo) => (
                <div key={tipo} className="bg-slate-800/50 rounded-lg p-2.5 flex items-center gap-2">
                  <span className="text-lg">{ICONO_ACTIVO[tipo]}</span>
                  <div>
                    <div className="text-sm font-black text-white">{tipo === 'utilitario' ? (d.activos[tipo]?.cantidad || 0) : (d.activos[tipo]?.total || 0)}</div>
                    <div className="text-[9px] text-slate-500">{NOMBRE_ACTIVO[tipo]}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/activos" className="text-[10px] font-bold text-indigo-400 block pt-2">Gestionar activos →</Link>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">💰 Gasto total de campaña</h3>
            <div className="text-3xl font-black text-emerald-400">{fmt(d.gasto_total)}</div>
            <p className="text-[10px] text-slate-500 mt-1">Incluye todos los gastos registrados en Finanzas</p>
            <Link to="/finanzas" className="text-[10px] font-bold text-indigo-400 block pt-2">Ver control financiero →</Link>
          </div>
        </div>

        {encuestasResumen && encuestasResumen.total_respuestas > 0 && (
          <div className="bg-slate-900/60 border border-pink-800/30 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📋 Encuestas — concentrado</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center"><div className="text-lg font-black text-pink-400">{encuestasResumen.total_encuestas}</div><div className="text-[9px] text-slate-500">Encuestas</div></div>
              <div className="text-center"><div className="text-lg font-black text-indigo-400">{encuestasResumen.total_respuestas}</div><div className="text-[9px] text-slate-500">Respuestas</div></div>
              <div className="text-center"><div className="text-lg font-black text-emerald-400">{encuestasResumen.por_municipio.length}</div><div className="text-[9px] text-slate-500">Municipios con datos</div></div>
            </div>
            <Link to="/reportes" className="text-[10px] font-bold text-indigo-400">Ver concentrado completo →</Link>
          </div>
        )}

        {['candidato', 'jefe_campana', 'coord_general'].includes(usuario?.rol) && <Panel2FA />}

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase">🔔 Notificaciones push</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Mensajes directos, incidencias urgentes y avisos de vencimiento — llegan aunque tengas la app cerrada</p>
          </div>
          <button onClick={() => api.post('/push/prueba').then(() => alert('Si no te llegó nada, revisa que hayas dado permiso de notificaciones al navegador.'))}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold flex-shrink-0">Probar</button>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">📄 Descargar reportes en PDF</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => descargarArchivo('/reportes/cierre-campana-pdf', 'reporte_cierre_campana.pdf')} className="px-3 py-2 rounded-lg bg-red-700/40 text-red-300 text-xs font-bold">📄 Cierre de campaña</button>
            <button onClick={() => descargarArchivo('/auth/mi-contrato-pdf', 'contrato_vototech.pdf')} className="px-3 py-2 rounded-lg bg-amber-700/40 text-amber-300 text-xs font-bold">📜 Mi contrato de servicio</button>
            <button onClick={() => descargarArchivo('/exportar/respaldo-completo', 'respaldo_completo.xlsx')} className="px-3 py-2 rounded-lg bg-emerald-700/40 text-emerald-300 text-xs font-bold">💾 Respaldo completo (Excel)</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/juridico', 'reporte_juridico.pdf')} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">📄 Jurídico</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/estructura', 'reporte_estructura.pdf')} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">📄 Estructura</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/incidencias', 'reporte_incidencias.pdf')} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">📄 Incidencias</button>
            <button onClick={() => descargarArchivo('/reportes/pdf/encuestas', 'reporte_encuestas.pdf')} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">📄 Encuestas</button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

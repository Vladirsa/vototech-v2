import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

const ROL_CORTO = { coord_general: 'Coord. General', coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional' };
const ICONO_ACTIVO = { espectacular: '📺', barda: '🧱', manta: '🎏', ine_representante: '🗳️', utilitario: '👕' };
const NOMBRE_ACTIVO = { espectacular: 'Espectaculares', barda: 'Bardas', manta: 'Mantas', ine_representante: 'Representantes', utilitario: 'Utilitarios' };

function Gauge({ porcentaje }) {
  const pct = Math.min(100, Math.max(0, porcentaje));
  const angulo = (pct / 100) * 180; // semicírculo
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

export default function Dashboard() {
  const usuario = useAuth((s) => s.usuario);
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get('/dashboard/resumen').then((r) => { setD(r.data.data); setCargando(false); }).catch(() => setCargando(false));
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
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Hola, {usuario?.nombre?.split(' ')[0] || 'Equipo'} 👋</h1>
            <p className="text-sm text-slate-500">Panel de mando — {d.candidato}</p>
          </div>
          <Link to="/mapa" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">🗺️ Ver mapa</Link>
        </div>

        {/* 🎯 AVANCE HACIA LA META ELECTORAL */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/60 border border-indigo-800/30 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-6">
          <Gauge porcentaje={d.meta_electoral.porcentaje} />
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎯</span>
              <h2 className="font-black text-white">Avance hacia la meta electoral</h2>
            </div>
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

        {/* 6 KPIs */}
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

        {/* Alertas · Secciones críticas · Agenda de hoy */}
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

        {/* Actividad de campo por distrito */}
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
          {/* Actividad reciente de promotores */}
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

          {/* Mejor promotor + coordinadores */}
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

        {/* Activos y Finanzas */}
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
      </div>
    </div>
  );
}

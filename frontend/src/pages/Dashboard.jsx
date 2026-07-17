import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

const FASE_COLOR = {
  identificacion: 'from-blue-600 to-cyan-600',
  persuasion: 'from-amber-600 to-orange-600',
  cierre: 'from-orange-600 to-red-600',
  movilizacion: 'from-red-600 to-rose-600',
  dia_d: 'from-purple-600 to-pink-600',
  sin_fecha: 'from-slate-600 to-slate-700',
};

export default function Dashboard() {
  const usuario = useAuth((s) => s.usuario);
  const [hoy, setHoy] = useState(null);
  const [resumenPromos, setResumenPromos] = useState(null);
  const [prioridad, setPrioridad] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [proximosEventos, setProximosEventos] = useState([]);
  const [finanzas, setFinanzas] = useState(null);
  const [saludEstructura, setSaludEstructura] = useState(null);
  const [incidenciasUrgentes, setIncidenciasUrgentes] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/priorizacion/hoy'),
      api.get('/promovidos/resumen'),
      api.get('/priorizacion'),
      api.get('/reportes/tendencia'),
      api.get('/agenda'),
      api.get('/finanzas'),
      api.get('/estructura/salud'),
      api.get('/incidencias'),
    ]).then(([hoyRes, promosRes, prioRes, tendRes, agendaRes, finRes, saludRes, incRes]) => {
      setHoy(hoyRes.data.data);
      setResumenPromos(promosRes.data.data);
      setPrioridad(prioRes.data);
      setTendencia(tendRes.data.data);
      const ahora = Date.now();
      setProximosEventos(
        agendaRes.data.data
          .filter((e) => new Date(e.fecha_inicio).getTime() > ahora)
          .slice(0, 3)
      );
      setFinanzas(finRes.data.resumen);
      setSaludEstructura(saludRes.data.data);
      setIncidenciasUrgentes(incRes.data.data.filter((i) => i.estado === 'activa' && i.urgencia === 'urgente').length);
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  if (cargando) {
    return <div className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-slate-50 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;
  }

  const colorFase = FASE_COLOR[hoy?.fase] || FASE_COLOR.sin_fecha;
  const maxTendencia = Math.max(1, ...tendencia.map((t) => t.promovidos));
  const fmtDinero = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-slate-50 p-4 md:p-8 transition-colors">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white dark:text-white light:text-slate-900">Hola, {usuario?.nombre?.split(' ')[0] || 'Equipo'} 👋</h1>
            <p className="text-sm text-slate-500">Este es el estado real de tu campaña hoy</p>
          </div>
          <Link to="/mapa" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">🗺️ Ver mapa</Link>
        </div>

        {/* 🎯 QUÉ HACER HOY + contador de días, más grande y visible */}
        <div className={`rounded-2xl p-6 bg-gradient-to-br ${colorFase} shadow-xl`}>
          <div className="flex items-start gap-4">
            <div className="text-4xl">{hoy?.icono}</div>
            <div className="flex-1">
              {hoy?.dias_restantes != null && (
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black text-white">{hoy.dias_restantes}</span>
                  <span className="text-xs font-bold text-white/70 uppercase tracking-wide">días para la elección</span>
                </div>
              )}
              <p className="text-white font-semibold leading-relaxed">{hoy?.mensaje}</p>
            </div>
          </div>
        </div>

        {/* Alertas urgentes — solo aparecen si hay algo que atender */}
        {(incidenciasUrgentes > 0 || saludEstructura?.resumen?.sobrecargado > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {incidenciasUrgentes > 0 && (
              <Link to="/incidencias" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-red-500/20">
                <span className="text-sm text-red-300">🚨 <strong>{incidenciasUrgentes}</strong> incidencia(s) urgente(s) sin resolver</span>
                <span className="text-xs font-bold text-red-400">Ver →</span>
              </Link>
            )}
            {saludEstructura?.resumen?.sobrecargado > 0 && (
              <Link to="/estructura" className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-orange-500/20">
                <span className="text-sm text-orange-300">🔴 <strong>{saludEstructura.resumen.sobrecargado}</strong> coordinador(es) sobrecargado(s)</span>
                <span className="text-xs font-bold text-orange-400">Ver →</span>
              </Link>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="md:col-span-2 space-y-6">
            {/* Resumen de promovidos */}
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Tu gente, clasificada</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-emerald-800/50 light:border-emerald-200 rounded-2xl p-4">
                  <div className="text-2xl font-black text-emerald-400">{resumenPromos?.por_clasificacion?.base || 0}</div>
                  <div className="text-xs text-slate-400 mt-1">✅ Base — asegúralos para el día D</div>
                </div>
                <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-amber-800/50 light:border-amber-200 rounded-2xl p-4">
                  <div className="text-2xl font-black text-amber-400">{resumenPromos?.por_clasificacion?.persuadible || 0}</div>
                  <div className="text-xs text-slate-400 mt-1">🎯 Persuadibles — aquí rinde tu esfuerzo</div>
                </div>
                <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4">
                  <div className="text-2xl font-black text-slate-400">{resumenPromos?.por_clasificacion?.adversario || 0}</div>
                  <div className="text-xs text-slate-400 mt-1">⛔ Adversarios — no gastes aquí</div>
                </div>
              </div>
              {resumenPromos?.persuadibles_sin_seguimiento > 0 && (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-amber-300">
                    ⚠️ <strong>{resumenPromos.persuadibles_sin_seguimiento}</strong> persuadibles llevan más de 15 días sin contacto
                  </span>
                  <Link to="/promovidos?filtro=seguimiento" className="text-xs font-bold text-amber-400 underline">Ver lista →</Link>
                </div>
              )}
            </div>

            {/* 📈 Gráfica de tendencia — dato que ya existía pero nunca se mostraba */}
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">📈 Ritmo de registro (últimos 14 días)</h2>
              <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4">
                {tendencia.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-6">Aún no hay suficiente actividad para mostrar tendencia</div>
                ) : (
                  <div className="flex items-end gap-1.5 h-24">
                    {tendencia.map((t) => (
                      <div key={t.fecha} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full bg-indigo-500 rounded-t hover:bg-indigo-400 transition-all"
                          style={{ height: `${Math.max(4, (t.promovidos / maxTendencia) * 100)}%` }} />
                        <div className="absolute -top-6 opacity-0 group-hover:opacity-100 text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-white whitespace-nowrap transition-opacity">
                          {t.promovidos} el {new Date(t.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resumen del Motor de Priorización */}
            {prioridad && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide">Territorio</h2>
                  <Link to="/priorizacion" className="text-xs font-bold text-indigo-400">Ver análisis completo →</Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    ['criticas', '🔴', 'Críticas', 'text-red-400'],
                    ['recuperables', '🟠', 'Recuperables', 'text-orange-400'],
                    ['disputa', '🟡', 'En disputa', 'text-yellow-400'],
                    ['consolidar', '🟢', 'A consolidar', 'text-emerald-400'],
                    ['perdidas', '⚫', 'Sin esperanza', 'text-slate-500'],
                  ].map(([key, ico, label, color]) => (
                    <div key={key} className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">{ico}</div>
                      <div className={`text-xl font-black ${color}`}>{prioridad.resumen[key]}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Columna lateral */}
          <div className="space-y-6">
            {/* Próximos eventos de Agenda */}
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">📅 Próximos eventos</h2>
              <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4 space-y-2.5">
                {proximosEventos.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-2">Sin eventos próximos</div>
                ) : proximosEventos.map((e) => (
                  <div key={e.id} className="text-xs">
                    <div className="font-bold text-white dark:text-white light:text-slate-800">{e.titulo}</div>
                    <div className="text-slate-500">{new Date(e.fecha_inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
                <Link to="/agenda" className="text-[10px] font-bold text-indigo-400 block pt-1">Ver toda la agenda →</Link>
              </div>
            </div>

            {/* Finanzas resumen */}
            {finanzas?.tope_ople && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">💰 Control financiero</h2>
                <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4">
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className={`h-full ${finanzas.porcentaje_usado > 90 ? 'bg-red-500' : finanzas.porcentaje_usado > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, finanzas.porcentaje_usado)}%` }} />
                  </div>
                  <div className="text-xs text-slate-400">{fmtDinero(finanzas.total_gastado)} de {fmtDinero(finanzas.tope_ople)} ({finanzas.porcentaje_usado}%)</div>
                  <Link to="/finanzas" className="text-[10px] font-bold text-indigo-400 block pt-2">Ver detalle →</Link>
                </div>
              </div>
            )}

            {/* Semáforo de salud de estructura */}
            {saludEstructura && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">🗂️ Salud de estructura</h2>
                <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-2 text-center">
                  <div><div className="text-emerald-400 font-black">{saludEstructura.resumen.sano}</div><div className="text-[9px] text-slate-500">Sano</div></div>
                  <div><div className="text-red-400 font-black">{saludEstructura.resumen.sobrecargado}</div><div className="text-[9px] text-slate-500">Sobrecargado</div></div>
                  <div><div className="text-amber-400 font-black">{saludEstructura.resumen.bajo}</div><div className="text-[9px] text-slate-500">Subutilizado</div></div>
                  <div><div className="text-slate-500 font-black">{saludEstructura.resumen.vacio}</div><div className="text-[9px] text-slate-500">Sin equipo</div></div>
                  <Link to="/estructura" className="col-span-2 text-[10px] font-bold text-indigo-400 pt-1">Ver estructura →</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

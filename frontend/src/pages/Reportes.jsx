import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';

const PARTIDOS_COLOR = {
  morena: '#8B0000', pan: '#003DA5', pri: '#006847', pvem: '#2D7D27',
  pt: '#CC0000', mc: '#F26522', prd: '#FFCB00', pac: '#E91E63',
  rsp: '#7c3aed', fxm: '#0891b2', panalt: '#64748b',
};

export default function Reportes() {
  const [tab, setTab] = useState('diario');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [diario, setDiario] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [estadisticas, setEstadisticas] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    api.get(`/reportes/diario?fecha=${fecha}`).then((r) => setDiario(r.data.data)).finally(() => setCargando(false));
  }, [fecha]);

  useEffect(() => {
    api.get('/reportes/tendencia').then((r) => setTendencia(r.data.data));
    api.get('/reportes/estadisticas').then((r) => setEstadisticas(r.data.data));
  }, []);

  const maxTendencia = Math.max(1, ...tendencia.map((t) => t.promovidos));
  const totalHoy = diario.reduce((s, d) => s + parseInt(d.promovidos_nuevos), 0);
  const totalContactosHoy = diario.reduce((s, d) => s + parseInt(d.contactos_hechos), 0);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📊 Reportes y Estadísticas</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => descargarArchivo('/exportar/promovidos', 'reporte_promovidos.xlsx')}
            className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold">
            📥 Exportar Excel
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('diario')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'diario' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Bitácora diaria</button>
          <button onClick={() => setTab('tendencia')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'tendencia' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📈 Tendencia</button>
          <button onClick={() => setTab('estadisticas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'estadisticas' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗺️ Análisis histórico</button>
        </div>

        {tab === 'diario' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <div className="flex gap-3 text-xs">
                <span className="text-slate-400">Total del día: <strong className="text-white">{totalHoy}</strong> promovidos, <strong className="text-white">{totalContactosHoy}</strong> contactos</span>
              </div>
            </div>

            {cargando ? (
              <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>
            ) : diario.every((d) => parseInt(d.promovidos_nuevos) === 0 && parseInt(d.contactos_hechos) === 0) ? (
              <div className="text-center text-slate-500 py-10">Sin actividad registrada este día</div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400 font-bold">Promotor</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Promovidos</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Contactos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diario.filter((d) => parseInt(d.promovidos_nuevos) > 0 || parseInt(d.contactos_hechos) > 0).map((d) => (
                      <tr key={d.usuario_id} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-white font-bold">{d.nombre}</td>
                        <td className="px-3 py-2 text-center text-emerald-400">{d.promovidos_nuevos}</td>
                        <td className="px-3 py-2 text-center text-amber-400">{d.comprometidos_nuevos}</td>
                        <td className="px-3 py-2 text-center text-indigo-400">{d.contactos_hechos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'tendencia' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Últimos 14 días</h3>
            {tendencia.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-6">Aún no hay suficiente actividad para mostrar tendencia</div>
            ) : (
              <div className="flex items-end gap-2 h-40">
                {tendencia.map((t) => (
                  <div key={t.fecha} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="w-full flex flex-col justify-end" style={{ height: '140px' }}>
                      <div className="w-full bg-indigo-500 rounded-t hover:bg-indigo-400 transition-all relative"
                        style={{ height: `${Math.max(4, (t.promovidos / maxTendencia) * 100)}%` }}>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-white whitespace-nowrap transition-opacity">
                          {t.promovidos} ({t.comprometidos} comp.)
                        </div>
                      </div>
                    </div>
                    <span className="text-[8px] text-slate-500">{new Date(t.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'estadisticas' && estadisticas && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-white">{estadisticas.total_secciones}</div>
                <div className="text-[9px] text-slate-500">Secciones analizadas</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-white">{estadisticas.lista_nominal_total?.toLocaleString()}</div>
                <div className="text-[9px] text-slate-500">Padrón total</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-indigo-400">{estadisticas.participacion_promedio ?? 'N/D'}%</div>
                <div className="text-[9px] text-slate-500">Participación promedio {estadisticas.anio_historico}</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-white">{estadisticas.total_votos_historico?.toLocaleString()}</div>
                <div className="text-[9px] text-slate-500">Votos totales {estadisticas.anio_historico}</div>
              </div>
            </div>

            {estadisticas.anio_historico ? (
              <>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Resultados acumulados {estadisticas.anio_historico} (todo tu territorio)</h3>
                  <div className="space-y-2">
                    {Object.entries(estadisticas.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
                      <div key={p}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={`font-bold ${p === estadisticas.partido_campana ? 'text-indigo-300' : 'text-slate-300'}`}>
                            {p === estadisticas.partido_campana && '⭐ '}{p.toUpperCase()}
                          </span>
                          <span className="text-slate-400">{v.toLocaleString()} ({Math.round(v / estadisticas.total_votos_historico * 100)}%)</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${v / estadisticas.total_votos_historico * 100}%`, background: PARTIDOS_COLOR[p] || '#64748b' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 📊 COMPARACIÓN 2024 → PROYECCIÓN 2027 */}
                <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-800/30 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase mb-1">📊 Comparación: {estadisticas.anio_historico} → Proyección 2027</h3>
                  <p className="text-[10px] text-slate-500 mb-3">Resultado real de {estadisticas.anio_historico} + lo que aportan tus promovidos actuales (Base confirmada, con 65% de conversión a voto)</p>
                  <div className="space-y-3">
                    {Object.entries(estadisticas.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p]) => {
                      const votos2024 = estadisticas.votos_por_partido[p] || 0;
                      const votos2027 = estadisticas.proyeccion_2027[p] || votos2024;
                      const cambio = votos2027 - votos2024;
                      const totalProyectado = Object.values(estadisticas.proyeccion_2027).reduce((a, b) => a + b, 0);
                      return (
                        <div key={p}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`font-bold ${p === estadisticas.partido_campana ? 'text-indigo-300' : 'text-slate-300'}`}>{p.toUpperCase()}</span>
                            <span className="text-slate-400">
                              {Math.round(votos2024).toLocaleString()} → <strong className="text-white">{Math.round(votos2027).toLocaleString()}</strong>
                              {cambio > 0.5 && <span className="text-emerald-400"> (+{Math.round(cambio)})</span>}
                            </span>
                          </div>
                          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden relative">
                            <div className="h-full rounded-full opacity-40" style={{ width: `${votos2024 / totalProyectado * 100}%`, background: PARTIDOS_COLOR[p] || '#64748b' }} />
                            <div className="h-full rounded-full absolute top-0" style={{ width: `${votos2027 / totalProyectado * 100}%`, background: PARTIDOS_COLOR[p] || '#64748b', opacity: 0.3, borderRight: '2px solid white' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-3">⚠️ Es una proyección orientativa basada en tu avance actual, no un resultado garantizado — sirve para ver tendencia, no para confiarse.</p>
                </div>
              </>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300">
                ⚠️ Sin datos históricos cargados para este tipo de elección
              </div>
            )}

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Distribución de competitividad por sección</h3>
              <p className="text-[10px] text-slate-500 mb-3">Según qué tan grande fue la diferencia entre el 1º y 2º lugar en cada sección</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['arrasador', 'Dominio claro', 'text-emerald-400', 'bg-emerald-500/10', '+30% margen'],
                  ['comodo', 'Cómodo', 'text-blue-400', 'bg-blue-500/10', '15-30% margen'],
                  ['cerrado', 'Cerrado', 'text-amber-400', 'bg-amber-500/10', '5-15% margen'],
                  ['empate', 'Prácticamente empate', 'text-red-400', 'bg-red-500/10', '<5% margen'],
                ].map(([key, label, color, bg, sub]) => (
                  <div key={key} className={`rounded-lg p-3 text-center ${bg}`}>
                    <div className={`text-xl font-black ${color}`}>{estadisticas.distribucion_competitividad[key]}</div>
                    <div className="text-[9px] text-slate-400">{label}</div>
                    <div className="text-[8px] text-slate-600">{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(estadisticas.promovidos_por_partido).length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Partido declarado por tus promovidos (hoy)</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(estadisticas.promovidos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
                    <div key={p} className="flex items-center gap-1.5 bg-slate-800/50 rounded-full px-3 py-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: PARTIDOS_COLOR[p] || '#64748b' }} />
                      <span className="text-white font-bold">{n}</span>
                      <span className="text-slate-400">{p.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import Ayuda from '../components/Ayuda';

const PARTIDOS_COLOR = {
  morena: '#8B0000', pan: '#003DA5', pri: '#006847', pvem: '#2D7D27',
  pt: '#CC0000', mc: '#F26522', prd: '#FFCB00', pac: '#E91E63',
  rsp: '#7c3aed', fxm: '#0891b2', panalt: '#64748b',
};

export default function Reportes() {
  const [tab, setTab] = useState('diario');
  const [subTabActividad, setSubTabActividad] = useState('resumen');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [diario, setDiario] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [estadisticas, setEstadisticas] = useState(null);
  const [fichaEstado, setFichaEstado] = useState(null);
  const [tipoAgregado, setTipoAgregado] = useState('dip_federal');
  const [agregados, setAgregados] = useState(null);
  const [probabilidad, setProbabilidad] = useState(null);
  const [regresion, setRegresion] = useState(null);
  const [pruebaRitmo, setPruebaRitmo] = useState(null);
  const [caminoTriunfo, setCaminoTriunfo] = useState(null);
  const [actividadResumen, setActividadResumen] = useState(null);
  const [actividadPromotores, setActividadPromotores] = useState([]);
  const [actividadSecciones, setActividadSecciones] = useState([]);
  const [encuestasResumen, setEncuestasResumen] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get(`/reportes/agregados/${tipoAgregado}`).then((r) => setAgregados(r.data.data)).catch(() => setAgregados(null));
  }, [tipoAgregado]);

  useEffect(() => {
    setCargando(true);
    api.get(`/reportes/diario?fecha=${fecha}`).then((r) => setDiario(r.data.data)).finally(() => setCargando(false));
  }, [fecha]);

  useEffect(() => {
    api.get('/reportes/tendencia').then((r) => setTendencia(r.data.data));
    api.get('/reportes/estadisticas').then((r) => setEstadisticas(r.data.data));
    api.get('/reportes/ficha-estado').then((r) => setFichaEstado(r.data.data)).catch(() => setFichaEstado(null));
    api.get('/reportes/probabilidad').then((r) => setProbabilidad(r.data.data));
    api.get('/reportes/regresion-cobertura').then((r) => setRegresion(r.data.data));
    api.get('/reportes/prueba-ritmo').then((r) => setPruebaRitmo(r.data.data));
    api.get('/reportes/camino-triunfo').then((r) => setCaminoTriunfo(r.data.data));
    api.get('/reportes/actividad-resumen').then((r) => setActividadResumen(r.data.data));
    api.get('/reportes/actividad-por-promotor').then((r) => setActividadPromotores(r.data.data));
    api.get('/reportes/actividad-por-seccion').then((r) => setActividadSecciones(r.data.data));
    api.get('/reportes/encuestas-resumen').then((r) => setEncuestasResumen(r.data.data));
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

        {/* Descargas rápidas de PDF por módulo */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => descargarArchivo('/reportes/pdf/juridico', 'reporte_juridico.pdf')} className="text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800/60 px-2.5 py-1.5 rounded-lg">📄 Jurídico</button>
          <button onClick={() => descargarArchivo('/reportes/pdf/estructura', 'reporte_estructura.pdf')} className="text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800/60 px-2.5 py-1.5 rounded-lg">📄 Estructura</button>
          <button onClick={() => descargarArchivo('/reportes/pdf/incidencias', 'reporte_incidencias.pdf')} className="text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800/60 px-2.5 py-1.5 rounded-lg">📄 Incidencias</button>
          <button onClick={() => descargarArchivo('/reportes/pdf/encuestas', 'reporte_encuestas.pdf')} className="text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800/60 px-2.5 py-1.5 rounded-lg">📄 Encuestas</button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('diario')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'diario' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Bitácora diaria</button>
          <button onClick={() => setTab('tendencia')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'tendencia' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📈 Tendencia</button>
          <button onClick={() => setTab('estadisticas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'estadisticas' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗺️ Análisis histórico</button>
          <button onClick={() => setTab('ficha-estado')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'ficha-estado' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🏛️ Ficha del Estado</button>
          <button onClick={() => setTab('otros-cargos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'otros-cargos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗳️ Senado / Dip. Federal / Dip. Local</button>
          <button onClick={() => setTab('probabilidad')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'probabilidad' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎲 Estadística y Probabilidad</button>
          <button onClick={() => setTab('actividad')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'actividad' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Actividad de Campo</button>
          <button onClick={() => setTab('encuestas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'encuestas' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Encuestas</button>
        </div>

        {tab === 'probabilidad' && probabilidad && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300">
              ⚠️ <strong>Esto no es una encuesta científica.</strong> Se basa en tus propios promovidos (una muestra sesgada, no aleatoria) y en el comportamiento histórico real de tu territorio. Úsalo como termómetro de tendencia, no como certeza.
            </div>

            {/* Intervalo de confianza sobre promovidos */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">📏 Intervalo de confianza — % de tus promovidos que son tu partido
                <Ayuda texto="Es un RANGO en vez de un solo número, porque con una muestra chica nunca podemos estar 100% seguros del valor exacto. Entre más gente contactada, más angosto (y confiable) se vuelve el rango." />
              </h3>
              <p className="text-[10px] text-slate-500 mb-3">Método: Wilson score, 95% de confianza · muestra: {probabilidad.total_promovidos_muestra} promovidos con partido declarado</p>
              {probabilidad.intervalo_confianza.centro == null ? (
                <div className="text-xs text-slate-500 text-center py-4">Aún no hay suficientes promovidos con partido declarado</div>
              ) : (
                <div>
                  <div className="text-3xl font-black text-white text-center mb-2">{probabilidad.intervalo_confianza.centro}%</div>
                  <div className="relative h-3 bg-slate-800 rounded-full">
                    <div className="absolute h-3 bg-indigo-500/40 rounded-full" style={{ left: `${probabilidad.intervalo_confianza.inferior}%`, width: `${probabilidad.intervalo_confianza.superior - probabilidad.intervalo_confianza.inferior}%` }} />
                    <div className="absolute h-5 w-1 bg-white rounded-full -top-1" style={{ left: `${probabilidad.intervalo_confianza.centro}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                    <span>{probabilidad.intervalo_confianza.inferior}% (mínimo probable)</span>
                    <span>{probabilidad.intervalo_confianza.superior}% (máximo probable)</span>
                  </div>
                  {!probabilidad.muestra_suficiente && (
                    <div className="mt-2 text-[10px] bg-amber-500/10 text-amber-300 rounded px-2 py-1">📊 Se necesitan mín. 30 promovidos con partido declarado para más confiabilidad (tienes {probabilidad.total_promovidos_muestra})</div>
                  )}
                  <div className="mt-2 text-[10px] text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2">💬 <strong>¿Qué significa esto?</strong> {probabilidad.interpretacion_ic}</div>
                </div>
              )}
            </div>

            {/* Simulación Monte Carlo */}
            {!probabilidad.simulacion_disponible ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300">⚠️ {probabilidad.mensaje}</div>
            ) : (
              <>
                <div className="bg-gradient-to-br from-purple-950/60 to-indigo-950/40 border border-purple-800/30 rounded-xl p-5 text-center">
                  <div className="text-[10px] font-bold text-purple-300 uppercase mb-1">🎲 Simulación Monte Carlo — {probabilidad.metodologia.corridas_simuladas.toLocaleString()} escenarios
                    <Ayuda texto="Imagina que la elección se repite miles de veces con la incertidumbre real (¿y si sube el ánimo? ¿y si baja?). El % que ves es en cuántos de esos escenarios simulados ganas — no es una promesa, es una probabilidad." />
                  </div>
                  <div className={`text-4xl font-black ${probabilidad.probabilidad_triunfo >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{probabilidad.probabilidad_triunfo}%</div>
                  <p className="text-[10px] text-slate-400 mt-1">de los escenarios simulados, ganas</p>
                  <div className="mt-3 text-[10px] text-left text-slate-300 bg-slate-900/50 rounded-lg px-3 py-2">💬 <strong>¿Qué significa esto?</strong> {probabilidad.interpretacion_probabilidad}</div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Rango de votos proyectados el día D</h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-lg font-black text-slate-400">{probabilidad.proyeccion_votos.p10.toLocaleString()}</div><div className="text-[9px] text-slate-500">Escenario pesimista (p10)</div></div>
                    <div><div className="text-lg font-black text-white">{probabilidad.proyeccion_votos.p50.toLocaleString()}</div><div className="text-[9px] text-slate-500">Escenario más probable (p50)</div></div>
                    <div><div className="text-lg font-black text-emerald-400">{probabilidad.proyeccion_votos.p90.toLocaleString()}</div><div className="text-[9px] text-slate-500">Escenario optimista (p90)</div></div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3">Tu oponente principal sacó {probabilidad.votos_oponente_referencia.toLocaleString()} votos en la última elección comparable.</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">🔬 Metodología (transparencia total)</h3>
                  <ul className="text-[10px] text-slate-400 space-y-1">
                    <li>• {probabilidad.metodologia.bootstrap_real
                      ? `Bootstrap no paramétrico: se remuestreó de ${probabilidad.metodologia.secciones_usadas_bootstrap} secciones reales — ${probabilidad.metodologia.metodo_bootstrap_descripcion}`
                      : `Sin suficientes secciones comparables para bootstrap real — se usó un supuesto conservador de ±6% de volatilidad`}</li>
                    <li>• Promovidos "Base" actuales: {probabilidad.metodologia.promovidos_base_actuales}, proyectados a {probabilidad.metodologia.promovidos_base_proyectados_dia_d} para el día de la elección ({probabilidad.metodologia.dias_restantes} días restantes)</li>
                    <li>• Tasa de conversión de promovido a voto: simulada con incertidumbre (~60% ± 15%), no un valor fijo</li>
                  </ul>
                </div>
              </>
            )}

            {/* 🛣️ CAMINO AL TRIUNFO — cuántas secciones necesitas ganar */}
            {caminoTriunfo?.disponible && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">🛣️ ¿Con cuántas secciones ganas la elección?</h3>
                <div className="grid grid-cols-3 gap-2 text-center my-3">
                  <div><div className="text-lg font-black text-emerald-400">{caminoTriunfo.secciones_ganadas_hoy}</div><div className="text-[9px] text-slate-500">Ganas hoy</div></div>
                  <div><div className="text-lg font-black text-amber-400">{caminoTriunfo.secciones_necesarias_adicionales}</div><div className="text-[9px] text-slate-500">Necesitas voltear</div></div>
                  <div><div className="text-lg font-black text-slate-400">{caminoTriunfo.total_secciones}</div><div className="text-[9px] text-slate-500">Total en tu territorio</div></div>
                </div>
                <div className="text-[10px] text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2 mb-3">💬 <strong>¿Qué significa esto?</strong> {caminoTriunfo.interpretacion}</div>
                {caminoTriunfo.top_secciones_camino?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase mb-1.5">Estas secciones son tu camino más corto</div>
                    <div className="flex flex-wrap gap-1.5">
                      {caminoTriunfo.top_secciones_camino.map((s) => (
                        <span key={s.seccion} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-1 rounded-full">Secc. {s.seccion} (-{s.deficit})</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 📈 REGRESIÓN — cobertura de promotores vs promovidos generados */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">📈 Regresión: cobertura de promotores vs. promovidos generados
                <Ayuda texto="Responde: ¿de verdad ayuda tener más promotores en una sección, o da igual? Si el número es alto, sí ayuda mucho. Si es bajo, probablemente importa más QUIÉN está ahí que CUÁNTOS son." />
              </h3>
              <p className="text-[10px] text-slate-500 mb-3">Método: mínimos cuadrados ordinarios (paramétrica)</p>
              {!regresion ? (
                <div className="text-xs text-slate-500 text-center py-4">⏳ Calculando...</div>
              ) : !regresion.suficientes_datos ? (
                <div className="text-[10px] bg-amber-500/10 text-amber-300 rounded-lg px-3 py-2">📊 {regresion.mensaje}</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="text-center"><div className="text-lg font-black text-white">{regresion.pendiente}</div><div className="text-[9px] text-slate-500">Promovidos extra por cada promotor</div></div>
                    <div className="text-center"><div className="text-lg font-black text-indigo-400">{Math.round(regresion.r_cuadrada * 100)}%</div><div className="text-[9px] text-slate-500">Qué tanto explica esta relación (R²)</div></div>
                  </div>
                  <div className="text-[10px] text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2">💬 <strong>¿Qué significa esto?</strong> {regresion.interpretacion}</div>
                  <p className="text-[9px] text-slate-600 mt-2">Basado en {regresion.secciones_analizadas} secciones con datos de cobertura y promovidos</p>
                </>
              )}
            </div>

            {/* 🧪 PRUEBA DE HIPÓTESIS — ritmo actual vs necesario */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">🧪 Prueba de hipótesis: ¿tu ritmo actual alcanza?
                <Ayuda texto="Compara qué tan rápido está avanzando tu equipo contra qué tan rápido NECESITA avanzar para llegar a la meta. Te dice si la diferencia es real (hay que preocuparse) o solo variación normal del día a día." />
              </h3>
              <p className="text-[10px] text-slate-500 mb-3">Método: prueba t de una muestra (paramétrica), 14 días analizados</p>
              {!pruebaRitmo ? (
                <div className="text-xs text-slate-500 text-center py-4">⏳ Calculando...</div>
              ) : pruebaRitmo.dias_analizados < 7 ? (
                <div className="text-[10px] bg-amber-500/10 text-amber-300 rounded-lg px-3 py-2">📊 {pruebaRitmo.interpretacion}</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="text-center"><div className="text-lg font-black text-white">{pruebaRitmo.ritmo_real_promedio}</div><div className="text-[9px] text-slate-500">Tu ritmo real (promovidos/día)</div></div>
                    <div className="text-center"><div className="text-lg font-black text-amber-400">{pruebaRitmo.ritmo_necesario}</div><div className="text-[9px] text-slate-500">Ritmo que necesitas</div></div>
                  </div>
                  <div className={`text-[9px] font-bold uppercase mb-2 ${pruebaRitmo.significativo ? (pruebaRitmo.ritmo_real_promedio > pruebaRitmo.ritmo_necesario ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                    {pruebaRitmo.significativo ? '✅ Diferencia estadísticamente significativa' : '➖ Sin diferencia estadísticamente significativa'} (valor-p: {pruebaRitmo.valor_p})
                  </div>
                  <div className="text-[10px] text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2">💬 <strong>¿Qué significa esto?</strong> {pruebaRitmo.interpretacion}</div>
                </>
              )}
            </div>
          </div>
        )}

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
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed">
              <strong>¿Para qué sirve esto?</strong> Es la foto general de TODO tu territorio en una elección histórica — cuántas secciones, tamaño del padrón, participación, votos totales.
              No compara boletas entre sí (eso lo hace "Comparativa" en Promovidos → Analítica) — aquí ves el panorama completo de una sola elección.
            </div>
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

        {tab === 'ficha-estado' && fichaEstado && (
          <div className="space-y-4">
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed">
              <strong>Diferencia con "Análisis histórico":</strong> esa pestaña usa SOLO los resultados que ya cargamos en el sistema, filtrados a tu territorio.
              Esta ficha es información de referencia general del estado completo — geografía electoral, demografía, autoridades — para dar contexto amplio, no solo lo que hay en la base de datos.
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-white">{fichaEstado.total_secciones}</div>
                <div className="text-[10px] text-slate-500">Secciones en el estado</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-white">{fichaEstado.total_municipios}</div>
                <div className="text-[10px] text-slate-500">Municipios</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-white">{fichaEstado.lista_nominal_estado.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">Lista nominal (nuestra BD)</div>
              </div>
            </div>

            {/* ── Demografía electoral (referencia INE) ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4" open>
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">🗳️ Demografía Electoral</summary>
              <div className="mt-3 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                <p>Lista Nominal: <strong className="text-white">1,035,742 electores</strong> (1.1% del total nacional). Mujeres: <strong className="text-white">52.5%</strong> (544,118) · Hombres: <strong className="text-white">47.5%</strong> (491,621). Voto desde el extranjero: 4,618 registrados.</p>
                <p><strong className="text-white">Municipios con mayor peso electoral:</strong> Tlaxcala Capital (80,240) · Huamantla (73,323) · Apizaco (68,406).</p>
              </div>
            </details>

            {/* ── Distritación ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">🗺️ Geografía y Distritación</summary>
              <div className="mt-3 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                <p><strong className="text-white">3 Distritos Federales:</strong> Distrito 01 (cabecera Apizaco, 19 municipios) · Distrito 02 (cabecera Tlaxcala, 24 municipios) · Distrito 03 (cabecera Zacatelco, 17 municipios). Circunscripción: 4ta (cabecera Ciudad de México).</p>
                <p><strong className="text-white">15 Distritos Locales</strong> — el congreso local se compone de 15 diputaciones de mayoría relativa.</p>
                <p><strong className="text-white">Presidencias de Comunidad (Usos y Costumbres):</strong> de más de 290 comunidades, 94 eligen autoridades por asamblea/mano alzada, el resto por voto en urna.</p>
              </div>
            </details>

            {/* ── Autoridades ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">🏢 Autoridades Electorales</summary>
              <div className="mt-3 space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                <p><strong className="text-white">INE Junta Local Ejecutiva</strong> (federal) — Tlaxcala de Xicohténcatl. 3 Juntas Distritales: 01 Apizaco, 02 Tlaxcala, 03 Zacatelco.</p>
                <p><strong className="text-white">Instituto Tlaxcalteca de Elecciones (ITE)</strong> — organiza elecciones de Gobernador, Diputados Locales y Ayuntamientos.</p>
                <p><strong className="text-white">Tribunal Electoral de Tlaxcala (TET)</strong> — resuelve impugnaciones y controversias locales.</p>
              </div>
            </details>

            {/* ── Segmentación por edad ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">📊 Lista Nominal por Edad (referencia estatal)</summary>
              <div className="mt-3 space-y-1.5">
                {[['18-24', 16.8], ['25-29', 11.4], ['30-34', 11.1], ['35-39', 10.1], ['40-44', 9.4], ['45-49', 8.9], ['50-54', 8.1], ['55-59', 6.6], ['60-64', 5.6], ['65+', 12.0]].map(([rango, pct]) => (
                  <div key={rango} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-14">{rango} años</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${pct * 5}%` }} /></div>
                    <span className="text-[10px] text-slate-300 w-10">{pct}%</span>
                  </div>
                ))}
              </div>
            </details>

            {/* ── Participación histórica ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">📉 Participación Ciudadana Histórica</summary>
              <div className="mt-3 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                <p>Tlaxcala se sitúa entre los 3 estados con mayor participación de México — habitualmente 5 a 10 puntos por arriba de la media nacional.</p>
                <p><strong className="text-white">2016:</strong> 65.6% · <strong className="text-white">2021:</strong> 64.7%-67.2% · <strong className="text-white">2024:</strong> 70.1% (récord histórico, 2° lugar nacional).</p>
                <p><strong className="text-white">Por género:</strong> mujeres 66%-68% de participación vs. hombres 56%-58% — la brecha se explica en parte por movilidad laboral/migración masculina fuera del estado.</p>
              </div>
            </details>

            {/* ── Comportamiento electoral / particularidades ── */}
            <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <summary className="text-xs font-bold text-indigo-300 uppercase cursor-pointer">🔍 Particularidades del Voto en Tlaxcala</summary>
              <div className="mt-3 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                <p><strong className="text-white">Votos nulos altos (4.5%-5.5%):</strong> de los más elevados de México — la boleta especial de Presidencia de Comunidad genera confusión al elector.</p>
                <p><strong className="text-white">Voto cruzado (18%-22%):</strong> en elecciones concurrentes, buena parte del electorado vota distinto para cargos federales vs. locales/municipales.</p>
                <p><strong className="text-white">Umbral de registro local (3%):</strong> los partidos locales deben sacar al menos 3% en diputaciones locales para conservar registro — esto hace que el mapa de partidos cambie cada 3 años.</p>
                <p><strong className="text-white">Fuerzas actuales:</strong> Morena y aliados 47%-49% · Oposición (PRI-PAN-PRD) 34%-37% · Partidos locales y minorías 14%-16%.</p>
              </div>
            </details>

            {fichaEstado.historico && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-3">
                  Resultado estatal agregado en nuestra base — {fichaEstado.historico.anio} ({fichaEstado.tipo_eleccion.replace('_', ' ')})
                </div>
                <div className="space-y-2">
                  {fichaEstado.historico.por_partido.map((p, i) => (
                    <div key={p.partido}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className={`font-bold ${i === 0 ? 'text-white' : 'text-slate-400'}`}>{i === 0 && '👑 '}{p.partido.toUpperCase()}</span>
                        <span className="text-slate-300">{p.votos.toLocaleString()} ({p.pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${i === 0 ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: `${p.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-[11px] text-emerald-300">
              📊 Tu campaña lleva {fichaEstado.tus_promovidos_totales} promovidos capturados en tu territorio.
            </div>
            <p className="text-[9px] text-slate-600">Fuentes de referencia: INE, ITE Tlaxcala. Los porcentajes de demografía/participación son de contexto general del estado, no se recalculan en vivo desde nuestra base de datos.</p>
          </div>
        )}

        {tab === 'otros-cargos' && (
          <div className="space-y-4">
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed">
              Estos cargos no se reportan sección por sección como Ayuntamiento — aquí están los resultados 2024 por distrito y a nivel estatal.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTipoAgregado('senaduria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tipoAgregado === 'senaduria' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Senadurías</button>
              <button onClick={() => setTipoAgregado('dip_federal')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tipoAgregado === 'dip_federal' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Dip. Federal</button>
              <button onClick={() => setTipoAgregado('dip_local')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tipoAgregado === 'dip_local' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Dip. Local</button>
            </div>

            {!agregados?.disponible ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center text-sm text-amber-300">⚠️ Sin datos cargados todavía para este cargo</div>
            ) : (
              <div className="space-y-3">
                {agregados.grupos.map((g, i) => (
                  <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">
                      {g.nivel === 'estado' ? `Consolidado estatal ${agregados.anio}` : `Distrito ${g.distrito_numero} — ${g.distrito_cabecera} (${agregados.anio})`}
                    </div>
                    <div className="space-y-2">
                      {g.resultados.map((r, j) => (
                        <div key={j}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className={`font-bold flex items-center gap-1 ${r.gano ? 'text-white' : 'text-slate-400'}`}>
                              {r.gano && '👑 '}{r.partido === 'nulos' ? 'NULOS' : r.partido.toUpperCase()}
                              {r.candidato && <span className="font-normal text-slate-500">— {r.candidato}</span>}
                            </span>
                            <span className="text-slate-300">{r.votos ? `${parseInt(r.votos).toLocaleString()} · ` : ''}{r.porcentaje}%{r.alcaldias_ganadas ? ` · ${r.alcaldias_ganadas} alcaldías` : ''}</span>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${r.gano ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: `${r.porcentaje}%` }} />
                          </div>
                          {r.notas && <p className="text-[9px] text-slate-500 mt-0.5">{r.notas}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 🎯 ACTIVIDAD DE CAMPO — Resumen / Por promotor / Por sección ── */}
        {tab === 'actividad' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setSubTabActividad('resumen')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'resumen' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Resumen</button>
              <button onClick={() => setSubTabActividad('promotor')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'promotor' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Por promotor</button>
              <button onClick={() => setSubTabActividad('seccion')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${subTabActividad === 'seccion' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Por sección</button>
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
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400 font-bold">Promotor</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Total</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Últimos 7 días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividadPromotores.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-slate-500 py-6">Sin promotores registrados</td></tr>
                    ) : actividadPromotores.map((p) => (
                      <tr key={p.id} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-white font-bold">{p.nombre}{p.puesto && <span className="text-slate-500 font-normal"> · {p.puesto}</span>}</td>
                        <td className="px-3 py-2 text-center text-slate-300">{p.total_promovidos}</td>
                        <td className="px-3 py-2 text-center text-purple-400">{p.comprometidos}</td>
                        <td className="px-3 py-2 text-center text-emerald-400">{p.ultimos_7_dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {subTabActividad === 'seccion' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400 font-bold">Sección</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Promovidos</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Comprometidos</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-bold">Promotores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividadSecciones.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-slate-500 py-6">Sin secciones con actividad</td></tr>
                    ) : actividadSecciones.map((s) => (
                      <tr key={s.seccion_numero} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-white font-bold">{String(s.seccion_numero).padStart(3, '0')}</td>
                        <td className="px-3 py-2 text-center text-slate-300">{s.total_promovidos}</td>
                        <td className="px-3 py-2 text-center text-purple-400">{s.comprometidos}</td>
                        <td className="px-3 py-2 text-center text-emerald-400">{s.promotores_activos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <div key={e.id} className="flex justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                  <span className="text-slate-300">{e.titulo}</span>
                  <span className="text-white font-bold">{e.total_respuestas}</span>
                </div>
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
      </div>
    </div>
  );
}

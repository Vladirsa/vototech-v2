import { useEffect, useState } from 'react';
import api from '../lib/api';
import Ayuda from './Ayuda';

const PARTIDOS_COLOR = {
  morena: '#8B0000', pan: '#003DA5', pri: '#006847', pvem: '#2D7D27',
  pt: '#CC0000', mc: '#F26522', prd: '#FFCB00', pac: '#E91E63',
  rsp: '#7c3aed', fxm: '#0891b2', panalt: '#64748b',
};
const PRIORIDAD_ESTILO = { urgente: 'bg-red-500/15 text-red-400', alta: 'bg-orange-500/15 text-orange-400', media: 'bg-amber-500/15 text-amber-400' };

function TarjetaKPI({ valor, label, color = 'text-white', borde = 'border-slate-800' }) {
  return (
    <div className={`bg-slate-900/60 border ${borde} rounded-xl p-4 text-center`}>
      <div className={`text-2xl font-black ${color}`}>{valor}</div>
      <div className="text-[10px] text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function BarraPartido({ partido, valor, max, esPropio }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-16 text-xs font-bold ${esPropio ? 'text-white' : 'text-slate-400'}`}>{partido.toUpperCase()}</span>
      <div className="flex-1 h-6 bg-slate-800 rounded-lg overflow-hidden">
        <div className="h-full rounded-lg flex items-center justify-end px-2 transition-all"
          style={{ width: `${max > 0 ? Math.max(4, (valor / max) * 100) : 0}%`, background: PARTIDOS_COLOR[partido] || '#64748b' }}>
          <span className="text-[10px] font-black text-white">{valor.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function AnaliticaPromovidos() {
  const [tab, setTab] = useState('partido');
  const [porPartido, setPorPartido] = useState(null);
  const [comparativa, setComparativa] = useState(null);
  const [diferenciado, setDiferenciado] = useState(null);
  const [oportunidad, setOportunidad] = useState(null);
  const [segmentacion, setSegmentacion] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/promovidos-analitica/por-partido'),
      api.get('/promovidos-analitica/comparativa'),
      api.get('/promovidos-analitica/voto-diferenciado'),
      api.get('/promovidos-analitica/oportunidad'),
      api.get('/promovidos-analitica/segmentacion'),
    ]).then(([p, c, d, o, s]) => {
      setPorPartido(p.data.data); setComparativa(c.data.data); setDiferenciado(d.data.data); setOportunidad(o.data.data);
      setSegmentacion(s.data.data);
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  if (cargando) return <div className="text-center text-slate-500 py-10">⏳ Calculando analítica...</div>;

  const TABS = [
    { id: 'partido', ic: '👥', label: 'Promovidos por partido' },
    { id: 'comparativa', ic: '📊', label: 'Comparativa 2024' },
    { id: 'diferenciado', ic: '🔀', label: 'Voto diferenciado' },
    { id: 'oportunidad', ic: '🎯', label: 'Oportunidad de voto' },
    { id: 'segmentacion', ic: '🧩', label: 'Segmentación' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h2 className="text-base font-black text-white">Analítica Electoral · VotoTech</h2>
            <p className="text-[10px] text-indigo-300">Promovidos propios · Resultados 2024 · Motor de Priorización</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {t.ic} {t.label}
          </button>
        ))}
      </div>

      {tab === 'partido' && porPartido && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TarjetaKPI valor={porPartido.total_propios} label={`Promovidos ${porPartido.partido_campana?.toUpperCase()}`} color="text-red-400" borde="border-red-800/40" />
            <TarjetaKPI valor={porPartido.total_oposicion} label="Promovidos oposición" color="text-slate-300" borde="border-slate-700" />
            <TarjetaKPI valor={`+${porPartido.total_propios - porPartido.total_oposicion}`} label={`Ventaja ${porPartido.partido_campana?.toUpperCase()}`} color="text-emerald-400" borde="border-emerald-800/40" />
            <TarjetaKPI valor={porPartido.total_general} label="Total promovidos" color="text-indigo-400" borde="border-indigo-800/40" />
          </div>

          {porPartido.por_partido.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-sm text-slate-500">
              Aún no hay promovidos con partido declarado — regístralos en la pestaña "Lista"
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase">Distribución de promovidos por partido</div>
              {porPartido.por_partido.map((p) => (
                <BarraPartido key={p.partido} partido={p.partido} valor={parseInt(p.total)} max={porPartido.por_partido[0]?.total} esPropio={p.partido === porPartido.partido_campana} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'comparativa' && comparativa && (
        <div className="space-y-4">
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed">
            <strong>¿Para qué sirve esto?</strong> Compara cómo le fue a tu partido en DOS boletas distintas del mismo día de elección (2024): Ayuntamiento y Presidente de Comunidad.
            Si alguien vota por ti en una boleta pero no en la otra, aquí se ve — te dice qué tan "leal completa" es tu gente, y en cuál boleta se pierde apoyo.
            No es lo mismo que "Análisis histórico" en Reportes (esa es la foto general de todo tu territorio, no una comparación de boletas).
          </div>
          {!comparativa.ayuntamiento.length && !comparativa.pres_comunidad.length ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center text-sm text-amber-300">
              ⚠️ Sin datos históricos 2024 cargados para tu territorio
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TarjetaKPI valor={comparativa.votos_propios.ayuntamiento.toLocaleString()} label={`Votos ${comparativa.partido_campana?.toUpperCase()} — Ayuntamiento`} color="text-red-400" borde="border-red-800/40" />
                <TarjetaKPI valor={comparativa.votos_propios.pres_comunidad.toLocaleString()} label={`Votos ${comparativa.partido_campana?.toUpperCase()} — Pdte. Comunidad`} color="text-orange-400" borde="border-orange-800/40" />
                <TarjetaKPI valor={`${comparativa.secciones_ganadas.ayuntamiento}/${comparativa.secciones_ganadas.ayuntamiento_total}`} label="Secciones ganadas — Ayto" color="text-emerald-400" borde="border-emerald-800/40" />
                <TarjetaKPI valor={`${comparativa.secciones_ganadas.pres_comunidad}/${comparativa.secciones_ganadas.pres_comunidad_total}`} label="Secciones ganadas — Pdte. Com." color="text-emerald-400" borde="border-emerald-800/40" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">🏛️ Ayuntamiento 2024</div>
                  {comparativa.ayuntamiento.map((p) => (
                    <BarraPartido key={p.partido} partido={p.partido} valor={parseInt(p.votos)} max={comparativa.ayuntamiento[0]?.votos} esPropio={p.partido === comparativa.partido_campana} />
                  ))}
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">🏠 Presidente de Comunidad 2024</div>
                  {comparativa.pres_comunidad.map((p) => (
                    <BarraPartido key={p.partido} partido={p.partido} valor={parseInt(p.votos)} max={comparativa.pres_comunidad[0]?.votos} esPropio={p.partido === comparativa.partido_campana} />
                  ))}
                </div>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                <div className="text-xs font-bold text-indigo-300 mb-1">💡 ¿Cuántos votos se pierden entre elecciones?</div>
                <div className={`text-2xl font-black ${comparativa.brecha >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {comparativa.brecha >= 0 ? '+' : ''}{comparativa.brecha.toLocaleString()} votos
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {comparativa.partido_campana?.toUpperCase()} sacó {comparativa.votos_propios.ayuntamiento.toLocaleString()} votos en Ayuntamiento pero {comparativa.votos_propios.pres_comunidad.toLocaleString()} en Pdte. de Comunidad.
                  {comparativa.brecha > 0 ? ' Esa gente sí vota por ustedes en Ayuntamiento — hay que replicarlo en las demás boletas.' : ' Ahí se está perdiendo apoyo entre una boleta y otra.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'diferenciado' && diferenciado && (
        <div className="space-y-4">
          {diferenciado.total_comparables === 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center text-sm text-amber-300">
              ⚠️ Sin secciones con ambas elecciones (Ayuntamiento y Pdte. Comunidad) para comparar
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TarjetaKPI valor={diferenciado.total_diferenciado} label="Secciones con voto diferenciado" color="text-amber-400" borde="border-amber-800/40" />
                <TarjetaKPI valor={diferenciado.total_consistente} label="Secciones con voto consistente" color="text-emerald-400" borde="border-emerald-800/40" />
                <TarjetaKPI valor={`${Math.round(diferenciado.total_diferenciado / diferenciado.total_comparables * 100)}%`} label="% de tu territorio" color="text-indigo-400" borde="border-indigo-800/40" />
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-3">🔀 Secciones donde la gente votó distinto entre boletas</div>
                <p className="text-[10px] text-slate-500 mb-3">Ganó un partido para Presidente Municipal, pero otro distinto para Presidente de Comunidad — señal de que el voto no es 100% fiel a un solo partido, hay oportunidad de persuasión ahí.</p>
                {diferenciado.secciones_diferenciado.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-4">No se encontraron secciones con voto diferenciado</div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {diferenciado.secciones_diferenciado.map((s) => (
                      <div key={s.seccion} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2 text-xs">
                        <span className="font-bold text-white">Sección {String(s.seccion).padStart(3, '0')}</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: `${PARTIDOS_COLOR[s.gano_ayuntamiento]}22`, color: PARTIDOS_COLOR[s.gano_ayuntamiento] }}>🏛️ {s.gano_ayuntamiento.toUpperCase()}</span>
                          <span className="text-slate-600">≠</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: `${PARTIDOS_COLOR[s.gano_pres_comunidad]}22`, color: PARTIDOS_COLOR[s.gano_pres_comunidad] }}>🏠 {s.gano_pres_comunidad.toUpperCase()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'oportunidad' && oportunidad && (
        <div className="space-y-4">
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
            <div className="text-xs font-bold text-indigo-300 mb-1">🎯 Tu oportunidad real hacia 2027</div>
            <p className="text-[11px] text-slate-300">
              Tienes <strong className="text-white">{oportunidad.total_comprometidos}</strong> comprometidos de <strong className="text-white">{oportunidad.total_promovidos}</strong> promovidos registrados.
              Tu meta es <strong className="text-white">{oportunidad.meta_votos.toLocaleString()}</strong> votos — vas al <strong className="text-emerald-400">{oportunidad.piramide[2].pct}%</strong>.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase">🔺 Pirámide de oportunidad electoral</div>
            {oportunidad.piramide.map((nivel, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{nivel.etiqueta}</span>
                  <span className="text-white font-bold">{nivel.valor.toLocaleString()} ({nivel.pct}%)</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500" style={{ width: `${Math.min(100, nivel.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase mb-1">⚡ Top secciones recuperables (déficit menor a 300 votos)</div>
            <p className="text-[10px] text-slate-500 mb-3">Ordenadas de la más fácil de recuperar a la más difícil — aquí es donde más rinde cada promotor.</p>
            {oportunidad.secciones_recuperables.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-4">Sin secciones recuperables detectadas (o ya vas ganando en todas)</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-[9px] uppercase">
                    <th className="text-left pb-2">Sección</th>
                    <th className="text-right pb-2">Votos propios</th>
                    <th className="text-right pb-2">Déficit</th>
                    <th className="text-right pb-2">Promotores</th>
                    <th className="text-right pb-2">Prioridad</th>
                  </tr>
                </thead>
                <tbody>
                  {oportunidad.secciones_recuperables.map((s) => (
                    <tr key={s.seccion} className="border-t border-slate-800">
                      <td className="py-2 font-bold text-white">{String(s.seccion).padStart(3, '0')}</td>
                      <td className="py-2 text-right text-slate-300">{s.votos_propios}</td>
                      <td className="py-2 text-right text-red-400 font-bold">-{s.deficit}</td>
                      <td className="py-2 text-right text-slate-300">{s.promotores_necesarios}</td>
                      <td className="py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${PRIORIDAD_ESTILO[s.prioridad]}`}>{s.prioridad}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'segmentacion' && segmentacion && (
        <div className="space-y-4">
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed">
            <strong>¿Para qué sirve esto?</strong> No usa datos del INE (no se pueden conseguir desglosados así) — es lo que tu propio equipo va capturando en campo, opcional, al registrar a alguien.
            Entre más completa la captura con el tiempo, más útil para decidir qué tipo de reunión organizar y con quién.
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-white">{segmentacion.total_con_segmentacion} de {segmentacion.total_promovidos}</div>
            <div className="text-[10px] text-slate-500">promovidos con género o edad capturados ({segmentacion.total_promovidos > 0 ? Math.round(segmentacion.total_con_segmentacion / segmentacion.total_promovidos * 100) : 0}%)</div>
          </div>

          {segmentacion.total_con_segmentacion === 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center text-sm text-amber-300">
              ⚠️ Todavía no hay datos de género o edad capturados. Pídele a tu equipo que los llene (son opcionales) al registrar nuevos promovidos.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Por género</div>
                {segmentacion.por_genero.length === 0 ? <p className="text-[10px] text-slate-600">Sin datos todavía</p> : segmentacion.por_genero.map((g) => (
                  <div key={g.genero} className="flex justify-between text-xs py-1"><span className="text-slate-300 capitalize">{g.genero}</span><span className="text-white font-bold">{g.total}</span></div>
                ))}
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Por rango de edad</div>
                {segmentacion.por_edad.length === 0 ? <p className="text-[10px] text-slate-600">Sin datos todavía</p> : segmentacion.por_edad.map((e) => (
                  <div key={e.rango_edad} className="flex justify-between text-xs py-1"><span className="text-slate-300">{e.rango_edad} años</span><span className="text-white font-bold">{e.total}</span></div>
                ))}
              </div>
            </div>
          )}

          {segmentacion.cruce_seccion_genero.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">Género por sección — útil para decidir el tipo de reunión</div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {segmentacion.cruce_seccion_genero.map((c, i) => (
                  <div key={i} className="flex justify-between text-[10px] text-slate-400">
                    <span>Sección {c.seccion}</span>
                    <span>{c.genero}: <strong className="text-white">{c.total}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

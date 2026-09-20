import { useEffect, useState } from 'react';
import api from '../lib/api';
import Ayuda from '../components/Ayuda';

/**
 * 🆕 "Estadística y Probabilidad" — antes era una sub-pestaña dentro
 * de "Análisis" (Reportes → Análisis → Estadística y Probabilidad).
 * A petición se sube a pestaña PRINCIPAL de Inteligencia Electoral,
 * en la misma jerarquía que Centro de Mando / Reportes / Priorización
 * — es contenido de decisión estratégica, no un sub-reporte.
 *
 * El resto de "Análisis" (Análisis histórico, Ficha del Estado,
 * Senado/Fed./Local) se eliminó del sistema — solo se conservó esta
 * parte, que es la que de verdad se usa para tomar decisiones.
 */
export default function EstadisticaProbabilidad() {
  const [probabilidad, setProbabilidad] = useState(null);
  const [regresion, setRegresion] = useState(null);
  const [pruebaRitmo, setPruebaRitmo] = useState(null);
  const [caminoTriunfo, setCaminoTriunfo] = useState(null);

  useEffect(() => {
    api.get('/reportes/probabilidad').then((r) => setProbabilidad(r.data.data));
    api.get('/reportes/regresion-cobertura').then((r) => setRegresion(r.data.data));
    api.get('/reportes/prueba-ritmo').then((r) => setPruebaRitmo(r.data.data));
    api.get('/reportes/camino-triunfo').then((r) => setCaminoTriunfo(r.data.data));
  }, []);

  if (!probabilidad) {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-3">🎲</div>
          <p className="text-slate-400">Cargando estadística y probabilidad...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
    </div>
  );
}

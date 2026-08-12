import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const ESTILO_PRIORIDAD = {
  critica:     { bg: 'bg-red-500/10', border: 'border-red-500/40', texto: 'text-red-400', barra: 'bg-red-500', label: '🔴 Crítica' },
  recuperable: { bg: 'bg-orange-500/10', border: 'border-orange-500/40', texto: 'text-orange-400', barra: 'bg-orange-500', label: '🟠 Recuperable' },
  disputa:     { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', texto: 'text-yellow-400', barra: 'bg-yellow-500', label: '🟡 Disputa' },
  consolidar:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', texto: 'text-emerald-400', barra: 'bg-emerald-500', label: '🟢 Consolidar' },
  perdida:     { bg: 'bg-slate-500/10', border: 'border-slate-500/40', texto: 'text-slate-500', barra: 'bg-slate-500', label: '⚫ Sin esperanza' },
};

const CLAVE_RESUMEN = { critica: 'criticas', recuperable: 'recuperables', disputa: 'disputa', consolidar: 'consolidar', perdida: 'perdidas' };

export default function Priorizacion() {
  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [orden, setOrden] = useState('deficit'); // 'deficit' | 'seccion'
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get('/priorizacion').then((r) => { setDatos(r.data); setCargando(false); });
  }, []);

  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Calculando estrategia...</div>;
  if (!datos?.data?.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-3">📊</div>
          <p className="text-slate-400">{datos?.mensaje || 'Sin datos suficientes todavía'}</p>
        </div>
      </div>
    );
  }

  let filas = filtro === 'todas' ? datos.data : datos.data.filter((f) => f.prioridad === filtro);
  if (busqueda) filas = filas.filter((f) => String(f.seccion).includes(busqueda));
  filas = [...filas].sort((a, b) => orden === 'deficit' ? b.deficit_votos - a.deficit_votos : a.seccion - b.seccion);
  // Para "déficit" queremos primero las MÁS FÁCILES de voltear (déficit chico pero > 0), luego el resto
  if (orden === 'deficit') {
    filas = [...filas].sort((a, b) => {
      const da = a.deficit_votos > 0 ? a.deficit_votos : Infinity;
      const db = b.deficit_votos > 0 ? b.deficit_votos : Infinity;
      return da - db;
    });
  }

  const totalCubiertos = datos.data.filter((f) => f.deficit_votos <= 0).length;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🎯 Motor de Priorización</h1>
            <p className="text-xs text-slate-500">
              {datos.dias_restantes} días para la elección · {datos.resumen.promovidos_necesarios_total.toLocaleString()} promovidos necesarios en total
            </p>
          </div>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        {/* KPIs resumen — mismo lenguaje visual que el resto del sistema */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-white">{datos.data.length}</div>
            <div className="text-[9px] text-slate-500">Total secciones</div>
          </div>
          {Object.entries(ESTILO_PRIORIDAD).map(([key, est]) => (
            <button key={key} onClick={() => setFiltro(filtro === key ? 'todas' : key)}
              className={`rounded-xl p-3 text-center border ${filtro === key ? `${est.bg} ${est.border}` : 'border-slate-800 bg-slate-900/60'}`}>
              <div className={`text-lg font-black ${est.texto}`}>{datos.resumen[CLAVE_RESUMEN[key]]}</div>
              <div className="text-[9px] text-slate-500">{est.label.replace(/^\S+\s/, '')}</div>
            </button>
          ))}
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-[11px] text-emerald-300">
          ✅ {totalCubiertos} de {datos.data.length} secciones ya tienen su meta de promovidos cubierta
        </div>
        {datos.resumen.secciones_prioritarias_sin_cobertura > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2 text-[11px] text-red-300">
            🈳 {datos.resumen.secciones_prioritarias_sin_cobertura} sección(es) prioritaria(s) sin NADIE asignado todavía — asígnalas desde Sectorización en el mapa
          </div>
        )}

        {/* Manual del Motor de Priorización — para que el equipo sepa
            qué hacer, no solo qué está viendo */}
        <details className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3">
          <summary className="text-xs font-bold text-indigo-300 cursor-pointer">📖 ¿Qué es esto y qué debo hacer con cada categoría? (toca para ver)</summary>
          <div className="mt-3 space-y-3 text-[11px] text-slate-300 leading-relaxed">
            <p>El Motor de Priorización cruza el histórico real de cada sección (quién ha ganado, por cuánto margen) con tu estructura actual, y te dice <strong>dónde de verdad vale la pena invertir tiempo y recursos</strong> — no todas las secciones merecen el mismo esfuerzo.</p>
            <div>
              <p className="font-bold text-red-400">🔴 Crítica — margen de 8% o menos, y vas perdiendo</p>
              <p className="text-slate-400">Aquí se gana o se pierde la elección. Prioridad máxima: manda a tu mejor gente, organiza reuniones, revisa que SÍ tengas promotores asignados.</p>
            </div>
            <div>
              <p className="font-bold text-orange-400">🟠 Recuperable — margen de 8% a 20%, vas perdiendo</p>
              <p className="text-slate-400">Se puede voltear con trabajo sostenido, pero no es la urgencia del día. Segunda prioridad de recursos.</p>
            </div>
            <div>
              <p className="font-bold text-yellow-400">🟡 Disputa — margen muy cerrado, resultado histórico inestable</p>
              <p className="text-slate-400">Ha cambiado de color entre elecciones — nadie tiene la ventaja asegurada. Vale la pena vigilar de cerca.</p>
            </div>
            <div>
              <p className="font-bold text-emerald-400">🟢 Consolidar — vas ganando</p>
              <p className="text-slate-400">No la descuides del todo (si el margen es chico, un descuido la pierde), pero no es donde debes concentrar el esfuerzo nuevo — ya la tienes.</p>
            </div>
            <div>
              <p className="font-bold text-slate-500">⚫ Sin esperanza — margen mayor a 20%, vas muy abajo</p>
              <p className="text-slate-400">Con los recursos de una campaña real, no es rentable pelearla. Mejor invertir ese esfuerzo en las críticas y recuperables.</p>
            </div>
            <p className="border-t border-slate-800 pt-2"><strong className="text-white">Déficit de votos:</strong> cuántos votos te faltan para empatar en esa sección, según el histórico. <strong className="text-white">⚠️ Sin nadie asignado:</strong> aviso extra cuando una sección prioritaria no tiene NINGÚN promotor o coordinador cubriéndola — eso es una alarma para resolver antes que nada.</p>
          </div>
        </details>

        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="🔍 Buscar sección..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs w-40" />
          <button onClick={() => setOrden('deficit')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${orden === 'deficit' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Más fáciles primero</button>
          <button onClick={() => setOrden('seccion')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${orden === 'seccion' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Por número</button>
          {filtro !== 'todas' && <button onClick={() => setFiltro('todas')} className="text-[10px] text-slate-500 font-bold">✕ Quitar filtro</button>}
        </div>

        {/* Lista de secciones */}
        <div className="space-y-2">
          {filas.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-10">Sin secciones que coincidan</div>
          ) : filas.map((f) => {
            const est = ESTILO_PRIORIDAD[f.prioridad];
            const totalPromos = f.promovidos_base + f.promovidos_persuadibles;
            const pctAvance = f.promovidos_necesarios > 0 ? Math.min(100, Math.round((totalPromos / f.promovidos_necesarios) * 100)) : 100;
            return (
              <div key={f.seccion} className={`rounded-xl border ${est.border} ${est.bg} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-white">{String(f.seccion).padStart(3, '0')}</span>
                    <span className={`text-xs font-bold ${est.texto}`}>{est.label}</span>
                    {f.sin_cobertura && (
                      <span className="text-[9px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">🈳 Sin nadie asignado</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">Ganó: <strong className="text-slate-300">{f.ganador_historico?.toUpperCase()}</strong> ({f.margen_pct > 0 ? '+' : ''}{f.margen_pct}%)</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-3">
                  <div>
                    <div className="text-slate-500">Lista nominal</div>
                    <div className="text-white font-bold">{f.lista_nominal?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Déficit de votos</div>
                    <div className="text-white font-bold">{f.deficit_votos > 0 ? f.deficit_votos.toLocaleString() : '✅ Cubierto'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Promovidos</div>
                    <div className="text-white font-bold">{totalPromos} de {f.promovidos_necesarios}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Gente asignada</div>
                    <div className={`font-bold ${f.personas_asignadas === 0 ? 'text-red-400' : 'text-white'}`}>{f.personas_asignadas} {f.personas_asignadas === 1 ? 'persona' : 'personas'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Ritmo diario necesario</div>
                    <div className={`font-bold ${f.ritmo_diario_necesario > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {f.ritmo_diario_necesario > 0 ? `${f.ritmo_diario_necesario}/día` : '✅ Meta lista'}
                    </div>
                  </div>
                </div>

                {/* Barra de avance visual — antes solo era un número suelto */}
                <div className="mb-3">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${est.barra}`} style={{ width: `${pctAvance}%` }} />
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{pctAvance}% de avance hacia la meta de esta sección</div>
                </div>

                {/* Accesos directos — conecta con los módulos relacionados */}
                <div className="flex gap-3">
                  <Link to={`/promovidos?seccion=${f.seccion}`} className="text-[10px] font-bold text-indigo-400">👁️ Ver promovidos →</Link>
                  <Link to={`/mapa`} className="text-[10px] font-bold text-indigo-400">🗺️ Ver en el mapa →</Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

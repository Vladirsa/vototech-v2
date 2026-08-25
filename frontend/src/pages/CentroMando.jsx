import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../lib/api';

const COLORES_CLASIFICACION = { base: '#10b981', persuadible: '#f59e0b', adversario: '#64748b' };

function TarjetaKPI({ icono, valor, etiqueta, color, sufijo = '' }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
      <div className="text-3xl mb-1">{icono}</div>
      <div className={`text-4xl md:text-5xl font-black ${color}`}>{valor}{sufijo}</div>
      <div className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{etiqueta}</div>
    </div>
  );
}

function TooltipOscuro({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-2xl">
      <div className="text-slate-400">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="font-bold" style={{ color: p.color || p.fill }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

/**
 * 🆕 Centro de Mando Ejecutivo — pantalla grande, tipo "war-room",
 * pensada para proyectarse en la oficina de campaña o simplemente
 * dar una impresión de nivel a la altura de una campaña grande
 * (Gobernador, Diputación Federal). Usa los mismos datos que ya
 * calculaba el Dashboard normal (/dashboard/ejecutivo) — solo
 * cambia cómo se ven: gráficas reales en vez de números sueltos.
 */
export default function CentroMando() {
  const [datos, setDatos] = useState(null);
  const [horaActual, setHoraActual] = useState(new Date());

  useEffect(() => {
    const cargar = () => api.get('/dashboard/ejecutivo').then((r) => setDatos(r.data.data)).catch(() => {});
    cargar();
    const intervaloRefresco = setInterval(cargar, 60000);
    const intervaloReloj = setInterval(() => setHoraActual(new Date()), 1000);
    return () => { clearInterval(intervaloRefresco); clearInterval(intervaloReloj); };
  }, []);

  if (!datos) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando Centro de Mando...</div>;
  }

  const datosDistribucion = [
    { name: 'Base', value: datos.distribucion_clasificacion.base, color: COLORES_CLASIFICACION.base },
    { name: 'Persuadible', value: datos.distribucion_clasificacion.persuadible, color: COLORES_CLASIFICACION.persuadible },
    { name: 'Adversario', value: datos.distribucion_clasificacion.adversario, color: COLORES_CLASIFICACION.adversario },
  ].filter((d) => d.value > 0);

  const tendenciaFormateada = datos.tendencia_14_dias.map((d) => ({
    ...d,
    fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
  }));

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            🗳️ Centro de Mando
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> EN VIVO
            </span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">Actualizado {horaActual.toLocaleTimeString('es-MX')} · se refresca solo cada minuto</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <TarjetaKPI icono="🗺️" valor={datos.cobertura_pct} sufijo="%" etiqueta={`Cobertura territorial (${datos.secciones_con_presencia}/${datos.total_secciones})`} color="text-indigo-400" />
        <TarjetaKPI icono="🤝" valor={datos.voto_estimado.toLocaleString()} etiqueta={datos.meta_votos ? `Voto estimado (meta: ${datos.meta_votos.toLocaleString()})` : 'Voto estimado'} color="text-emerald-400" />
        <TarjetaKPI icono="👥" valor={datos.estructura_activa_pct} sufijo="%" etiqueta={`Estructura activa (${datos.promotores_activos}/${datos.total_promotores})`} color="text-amber-400" />
        <TarjetaKPI icono="📈" valor={datos.avance_diario} etiqueta="Promovidos por día (prom. 7 días)" color="text-purple-400" />
      </div>

      {datos.total_municipios > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6 flex items-center gap-4">
          <div className="text-4xl">{datos.municipios_riesgo > 0 ? '⚠️' : '✅'}</div>
          <div>
            <div className={`text-xl font-black ${datos.municipios_riesgo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {datos.municipios_riesgo} de {datos.total_municipios} municipios en riesgo
            </div>
            <div className="text-xs text-slate-500">Donde el histórico dice que otro partido va ganando</div>
          </div>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">📈 Promovidos capturados — últimos 14 días</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={tendenciaFormateada}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="fechaCorta" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
            <Tooltip content={<TooltipOscuro />} />
            <Line type="monotone" dataKey="total" name="Promovidos" stroke="#818cf8" strokeWidth={3} dot={{ fill: '#818cf8', r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">📊 Territorio con más avance</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datos.comparativo_territorio} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#64748b" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" stroke="#94a3b8" fontSize={11} width={80} />
              <Tooltip content={<TooltipOscuro />} />
              <Bar dataKey="total" name="Promovidos" fill="#818cf8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">🎯 Distribución estratégica</h2>
          {datosDistribucion.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={datosDistribucion} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {datosDistribucion.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<TooltipOscuro />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-slate-500 text-sm py-16">Sin promovidos clasificados todavía</div>
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-600 mt-8">VotoTech — Centro de Mando Ejecutivo · Los datos se actualizan solos, no necesitas recargar la página</p>
    </div>
  );
}

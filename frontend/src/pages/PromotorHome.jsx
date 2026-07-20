import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';
import { ModalAgregar } from './Promovidos';

/**
 * La ÚNICA pantalla que ve un promotor — nada de módulos sueltos,
 * nada de menús con cosas que no le tocan. Solo su propio avance y
 * el botón para seguir agregando gente. Todo lo demás (Día D si le
 * toca ser representante de casilla, Incidencias si necesita
 * reportar algo urgente) sigue accesible desde el menú, pero esta
 * es su pantalla de inicio.
 */
export default function PromotorHome() {
  const usuario = useAuth((s) => s.usuario);
  const [resumen, setResumen] = useState(null);
  const [mostrarAgregar, setMostrarAgregar] = useState(false);

  const cargar = () => api.get('/promovidos/mi-resumen').then((r) => setResumen(r.data.data)).catch(() => {});
  useEffect(cargar, []);

  if (!resumen) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-5 pt-4">
        <div className="text-center space-y-1">
          <div className="text-3xl">🗳️</div>
          <h1 className="text-xl font-black text-white">¡Vota por tu candidato!</h1>
          <p className="text-xs text-slate-500">Hola, {usuario?.nombre?.split(' ')[0]} — este es tu avance</p>
        </div>

        {/* Medidor grande hacia la meta mínima */}
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 text-center shadow-xl">
          <div className="text-5xl font-black text-white">{resumen.comprometidos}</div>
          <div className="text-xs text-indigo-200 mt-1">de tu meta mínima de {resumen.meta} personas que llevarás a votar</div>
          <div className="h-3 bg-black/30 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${resumen.porcentaje_meta}%` }} />
          </div>
          <div className="text-lg font-bold text-emerald-300 mt-2">{resumen.porcentaje_meta}%</div>
          {resumen.porcentaje_meta >= 100 && <div className="text-xs text-emerald-300 mt-1">🎉 ¡Ya cumpliste tu meta! Sigue sumando gente.</div>}
        </div>

        {/* Totales */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-white">{resumen.total}</div>
            <div className="text-[10px] text-slate-500">Personas registradas en total</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-400">{resumen.comprometidos}</div>
            <div className="text-[10px] text-slate-500">Comprometidas a votar</div>
          </div>
        </div>

        {/* Por sección */}
        {resumen.por_seccion.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Tu gente, por sección</div>
            {resumen.por_seccion.map((s) => (
              <div key={s.seccion} className="flex justify-between text-sm py-1">
                <span className="text-slate-300">{s.seccion !== 'sin sección' ? `Sección ${s.seccion}` : 'Sin sección'}</span>
                <span className="text-white font-bold">{s.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* Últimos registrados */}
        {resumen.ultimos.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Últimos que registraste</div>
            {resumen.ultimos.map((p) => (
              <div key={p.id} className="flex justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                <span className="text-slate-300">{p.nombre}</span>
                <span className={p.comprometido ? 'text-emerald-400' : 'text-slate-500'}>{p.comprometido ? '✅ Comprometido' : 'Por confirmar'}</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setMostrarAgregar(true)}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-base shadow-xl">
          + Agregar persona
        </button>
      </div>

      {mostrarAgregar && <ModalAgregar onCerrar={() => setMostrarAgregar(false)} onGuardado={() => { setMostrarAgregar(false); cargar(); }} />}
    </div>
  );
}

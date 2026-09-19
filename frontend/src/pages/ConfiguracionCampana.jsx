import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

/**
 * 🆕 NUEVO — "Configuración de campaña", dentro de Administración y
 * Cumplimiento → pestaña "⚙️ Configuración".
 *
 * Antes no existía NINGÚN lugar en la app para poner la meta de
 * votos para ganar ni la fecha de la elección — el Dashboard ya las
 * usaba (el medidor "Avance hacia la meta electoral", el ritmo
 * diario necesario en Priorización), pero solo se podían cambiar
 * directo en la base de datos. Aquí el propio candidato o jefe de
 * campaña las pone y las actualiza cuando quiera.
 */
export default function ConfiguracionCampana() {
  const usuario = useAuth((s) => s.usuario);
  const puedeEditar = ['candidato', 'jefe_campana'].includes(usuario?.rol);

  const [campana, setCampana] = useState(null);
  const [metaVotos, setMetaVotos] = useState('');
  const [fechaEleccion, setFechaEleccion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    api.get('/auth/mi-campana').then((r) => {
      const d = r.data.data;
      setCampana(d);
      setMetaVotos(d.meta_votos || '');
      setFechaEleccion(d.fecha_eleccion ? d.fecha_eleccion.slice(0, 10) : '');
    }).catch(() => {});
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const cuerpo = {};
      if (metaVotos !== '') cuerpo.meta_votos = parseInt(metaVotos);
      if (fechaEleccion !== '') cuerpo.fecha_eleccion = fechaEleccion;
      const r = await api.patch('/auth/mi-campana', cuerpo);
      setMensaje({ tipo: 'ok', texto: r.data.mensaje || '✅ Guardado' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  };

  if (!campana) {
    return <div className="text-sm text-slate-500 text-center py-8">⏳ Cargando configuración...</div>;
  }

  if (!puedeEditar) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-400">
        Solo el candidato o el jefe de campaña pueden cambiar la configuración de la campaña.
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">🎯 Meta de votos para ganar</label>
          <p className="text-[11px] text-slate-500 mb-1.5">Este número es el que se usa en el medidor "Avance hacia la meta electoral" del Dashboard y para calcular cuántos promovidos necesitas por día.</p>
          <input
            type="number"
            min="1"
            value={metaVotos}
            onChange={(e) => setMetaVotos(e.target.value)}
            placeholder="Ej. 15000"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm"
          />
          {!campana.meta_votos && (
            <p className="text-[10px] text-amber-400 mt-1">⚠️ Todavía no has puesto una meta — mientras tanto, el sistema está usando un cálculo automático (35% de la lista nominal de tu territorio) solo como referencia.</p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">📅 Fecha de la elección</label>
          <p className="text-[11px] text-slate-500 mb-1.5">Se usa para calcular los días restantes y el ritmo diario necesario.</p>
          <input
            type="date"
            value={fechaEleccion}
            onChange={(e) => setFechaEleccion(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm"
          />
        </div>

        {mensaje && (
          <div className={`text-xs rounded-lg px-3 py-2 ${mensaje.tipo === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
            {mensaje.texto}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

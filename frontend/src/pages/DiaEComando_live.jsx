import { Link } from 'react-router-dom';
import DiaEleccion from './DiaEleccion';

/**
 * 🆕 "Día E" — antes combinaba "Centro de Mando" + "Día de la
 * Elección" en pestañas. "Centro de Mando" se movió a Inteligencia
 * Electoral (misma jerarquía que Reportes/Priorización, y es lo
 * primero que se abre ahí) — aquí solo queda "Día de la Elección",
 * así que ya no hace falta la barra de pestañas (evitar pestañas
 * innecesarias cuando solo hay una vista).
 */
export default function DiaEComando() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🗳️ Día de la Elección</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <DiaEleccion />
      </div>
    </div>
  );
}

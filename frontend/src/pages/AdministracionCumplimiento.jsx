import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import Juridico from './Juridico';
import Administracion from './Administracion';
import Respaldos from './Respaldos';
import ConfiguracionCampana from './ConfiguracionCampana';
import DocumentosLegales from './DocumentosLegales';

/**
 * 🆕 "Administración y Cumplimiento" — antes eran 3 botones sueltos
 * en el menú (Jurídico, Administración, Respaldos); ahora es UNA
 * sola entrada que abre a pestañas.
 *
 * 🆕 NUEVO — 2 pestañas más:
 * - "⚙️ Configuración": meta de votos y fecha de elección (antes no
 *   existía ningún lugar en la app para ponerlas).
 * - "📜 Documentos legales": Mi contrato de servicio (antes vivía
 *   suelto en el Dashboard) + Términos y Condiciones + Aviso de
 *   Privacidad, todos juntos en un solo lugar.
 *
 * 🆕 IMPORTANTE — las pestañas se filtran por rol. Un
 * "encargado_juridico" o "encargado_finanzas" solo debe ver SU
 * área, nunca la del otro — combinar todo en una pantalla no debe
 * significar que de repente vean datos que antes no veían.
 */
export default function AdministracionCumplimiento() {
  const usuario = useAuth((s) => s.usuario);
  const TODAS_LAS_PESTAÑAS = [
    { id: 'juridico', ic: '⚖️', label: 'Jurídico', Comp: Juridico },
    { id: 'administrativo', ic: '💼', label: 'Administrativo', Comp: Administracion },
    { id: 'respaldos', ic: '📦', label: 'Respaldos', Comp: Respaldos },
    { id: 'configuracion', ic: '⚙️', label: 'Configuración', Comp: ConfiguracionCampana },
    { id: 'documentos-legales', ic: '📜', label: 'Documentos legales', Comp: DocumentosLegales },
  ];
  const soloEstasParaMiRol = {
    encargado_juridico: ['juridico'],
    encargado_finanzas: ['administrativo'],
  }[usuario?.rol];
  const TABS = soloEstasParaMiRol ? TODAS_LAS_PESTAÑAS.filter((t) => soloEstasParaMiRol.includes(t.id)) : TODAS_LAS_PESTAÑAS;

  const [tab, setTab] = useState(TABS[0]?.id);
  const ComponenteActivo = TABS.find((t) => t.id === tab)?.Comp;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">💼 Administración y Cumplimiento</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        {/* Si el rol solo tiene acceso a 1 pestaña, no hace falta
            mostrar el selector — se ve directo su único módulo. */}
        {TABS.length > 1 && (
          <div className="flex gap-2 border-b border-slate-800 pb-2 flex-wrap">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}>
                {t.ic} {t.label}
              </button>
            ))}
          </div>
        )}

        <div>
          {ComponenteActivo && <ComponenteActivo />}
        </div>
      </div>
    </div>
  );
}

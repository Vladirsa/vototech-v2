import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import { useTema } from '../lib/temaStore';

const MODULOS = [
  { ruta: '/dashboard', ic: '⚡', label: 'Dashboard' },
  { ruta: '/mapa', ic: '🗺️', label: 'Mapa' },
  { ruta: '/promovidos', ic: '🤝', label: 'Promovidos' },
  { ruta: '/priorizacion', ic: '🎯', label: 'Priorización' },
  { ruta: '/estructura', ic: '🗂️', label: 'Estructura' },
  { ruta: '/agenda', ic: '📅', label: 'Agenda' },
  { ruta: '/codigos', ic: '🎟️', label: 'Códigos' },
  { ruta: '/dia-eleccion', ic: '🗳️', label: 'Día D' },
  { ruta: '/incidencias', ic: '🚨', label: 'Incidencias' },
  { ruta: '/finanzas', ic: '💰', label: 'Finanzas' },
  { ruta: '/activos', ic: '📺', label: 'Activos' },
];

export default function NavBar() {
  const usuario = useAuth((s) => s.usuario);
  const cerrarSesion = useAuth((s) => s.cerrarSesion);
  const { tema, alternar } = useTema();
  const navigate = useNavigate();

  const salir = () => { cerrarSesion(); navigate('/login'); };

  return (
    <nav className="sticky top-0 z-[2000] bg-slate-950/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-800 light:bg-white/95 light:border-slate-200">
      <div className="max-w-6xl mx-auto px-3 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 pr-3 mr-2 border-r border-slate-800 flex-shrink-0 py-2.5">
          <span className="text-lg">🗳️</span>
          <span className="text-xs font-black text-white hidden sm:inline">VotoTech</span>
        </div>

        {MODULOS.map((m) => (
          <NavLink
            key={m.ruta}
            to={m.ruta}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                isActive ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`
            }
          >
            <span>{m.ic}</span>
            <span className="hidden md:inline">{m.label}</span>
          </NavLink>
        ))}

        <div className="ml-auto flex items-center gap-2 pl-3 flex-shrink-0">
          <button onClick={alternar} className="text-sm px-2 py-1 rounded-lg hover:bg-slate-800" title="Cambiar tema">
            {tema === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="text-[10px] text-slate-500 hidden sm:inline">{usuario?.nombre}</span>
          <button onClick={salir} className="text-xs text-slate-500 hover:text-red-400 px-2 py-1">🚪</button>
        </div>
      </div>
    </nav>
  );
}

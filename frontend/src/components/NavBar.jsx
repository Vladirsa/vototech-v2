import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import { useTema } from '../lib/temaStore';

const MODULOS = [
  { ruta: '/mi-avance', ic: '🗳️', label: 'Mi Avance', clave: 'mi-avance' },
  { ruta: '/dashboard', ic: '⚡', label: 'Dashboard', clave: 'dashboard' },
  { ruta: '/mapa', ic: '🗺️', label: 'Mapa', clave: 'mapa' },
  { ruta: '/promovidos', ic: '🤝', label: 'Promovidos', clave: 'promovidos' },
  { ruta: '/reportes', ic: '📊', label: 'Reportes', clave: 'reportes' },
  { ruta: '/marketing', ic: '📢', label: 'Marketing', clave: 'marketing' },
  { ruta: '/juridico', ic: '⚖️', label: 'Jurídico', clave: 'juridico' },
  { ruta: '/priorizacion', ic: '🎯', label: 'Priorización', clave: 'priorizacion' },
  { ruta: '/estructura', ic: '🗂️', label: 'Estructura', clave: 'estructura' },
  { ruta: '/agenda', ic: '📅', label: 'Agenda', clave: 'agenda' },
  { ruta: '/dia-eleccion', ic: '🗳️', label: 'Día D', clave: 'dia-eleccion' },
  { ruta: '/incidencias', ic: '🚨', label: 'Incidencias', clave: 'incidencias' },
  { ruta: '/finanzas', ic: '💰', label: 'Administración', clave: 'finanzas' },
  { ruta: '/activos', ic: '📺', label: 'Activos', clave: 'activos' },
];

// Qué módulos ve cada rol en el menú — candidato/jefe/coord_general ven
// todo; conforme se baja de nivel, se ocultan los módulos más
// estratégicos (Finanzas, Jurídico, Marketing, Reportes) para no
// saturar ni exponer información que no le toca a ese nivel.
const TODOS = MODULOS.map((m) => m.clave).filter((c) => c !== 'mi-avance'); // los roles con acceso completo no necesitan la pantalla simplificada
const MODULOS_POR_ROL = {
  candidato: TODOS,
  jefe_campana: TODOS,
  coord_general: TODOS,
  coord_distrital: TODOS.filter((c) => !['finanzas', 'juridico'].includes(c)),
  coord_municipal: TODOS.filter((c) => !['finanzas', 'juridico'].includes(c)),
  // Coordinador seccional: su gente (no toda la estructura — eso se
  // filtra solo en el backend, aquí solo se decide qué botones ve),
  // sus promovidos, Día D, e Incidencias (para reportar, no para ver todas).
  coord_seccional: ['dashboard', 'mapa', 'promovidos', 'estructura', 'dia-eleccion', 'incidencias'],
  // El promotor SOLO ve su pantalla de avance — nada de módulos
  // sueltos que no le sirven para su tarea del día a día. Día D e
  // Incidencias se quedan porque son necesarios en campo (reportar
  // un problema urgente, o capturar resultados si le tocó ser
  // representante de casilla).
  promotor: ['mi-avance', 'dia-eleccion', 'incidencias'],
  // Encargado de Jurídico: su área, más lo que necesita para
  // sustentar quejas/recursos.
  encargado_juridico: ['dashboard', 'juridico', 'activos', 'incidencias', 'promovidos'],
  // Encargado de Finanzas: su área, más contexto de promovidos/incidencias.
  encargado_finanzas: ['dashboard', 'finanzas', 'promovidos', 'incidencias'],
  // Voluntario: promovidos siempre; Marketing solo si su puesto
  // específico es de esa área (se valida en el backend, aquí se
  // muestra el botón de forma optimista).
  voluntario: ['dashboard', 'promovidos', 'marketing'],
};

export default function NavBar() {
  const usuario = useAuth((s) => s.usuario);
  const cerrarSesion = useAuth((s) => s.cerrarSesion);
  const { tema, alternar } = useTema();
  const navigate = useNavigate();

  const salir = () => { cerrarSesion(); navigate('/login'); };
  const modulosVisibles = MODULOS.filter((m) => (MODULOS_POR_ROL[usuario?.rol] || TODOS).includes(m.clave));

  return (
    <nav className="sticky top-0 z-[2000] bg-slate-950/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-800 light:bg-white/95 light:border-slate-200 relative">
      <div className="max-w-6xl mx-auto px-3 flex items-center gap-1 overflow-x-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#4f46e5 transparent' }}>
        <div className="flex items-center gap-2 pr-3 mr-2 border-r border-slate-800 flex-shrink-0 py-2.5">
          <span className="text-lg">🗳️</span>
          <span className="text-xs font-black text-white hidden sm:inline">VotoTech</span>
        </div>

        {modulosVisibles.map((m) => (
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
      {/* Degradado a los lados — pista visual de que el menú se puede deslizar */}
      <div className="absolute top-0 bottom-0 left-0 w-4 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-6 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
    </nav>
  );
}

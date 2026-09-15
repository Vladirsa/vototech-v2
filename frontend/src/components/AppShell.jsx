import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import { useTema } from '../lib/temaStore';
import { contarPendientesOffline } from '../lib/colaOffline';

// Mismo listado y misma lógica de permisos por rol que ya existía en
// NavBar.jsx — se traen tal cual, solo cambia CÓMO se pintan (antes
// pastillas horizontales arriba, ahora una lista vertical con nombre
// completo, del lado derecho).
// 🆕 Cada módulo ahora indica a qué CAPA pertenece — la arquitectura
// de 7 capas que organiza VotoTech por función real de campaña, no
// solo una lista plana de botones. "mi-avance" y "dashboard" quedan
// fuera de las capas — son pantallas de inicio, no una función
// operativa específica.
const CAPAS = [
  { id: 'territorio', label: '🗺️ Territorio' },
  { id: 'inteligencia', label: '🧠 Inteligencia Electoral' },
  { id: 'estructura', label: '🗂️ Estructura y Organización' },
  { id: 'operacion', label: '🚶 Movilización y Operación' },
  { id: 'comunicacion', label: '📢 Comunicación' },
  { id: 'administracion', label: '💼 Administración y Cumplimiento' },
  { id: 'dia_e', label: '🗳️ Día E y Centro de Comando' },
];

const MODULOS = [
  { ruta: '/mi-avance', ic: '🗳️', label: 'Mi Avance', clave: 'mi-avance' },
  { ruta: '/dashboard', ic: '⚡', label: 'Dashboard', clave: 'dashboard' },
  { ruta: '/mapa', ic: '🗺️', label: 'Mapa', clave: 'mapa', capa: 'territorio' },
  { ruta: '/marketing', ic: '📢', label: 'Comunicación y Marketing', clave: 'marketing', capa: 'comunicacion' },
  // 🆕 Los 3 se combinaron en 1 sola entrada — la pantalla misma
  // filtra qué pestañas ve cada rol (ver AdministracionCumplimiento.jsx).
  { ruta: '/inteligencia-electoral', ic: '🧠', label: 'Inteligencia Electoral', clave: 'inteligencia-electoral', capa: 'inteligencia' },
  { ruta: '/movilizacion-operacion', ic: '🚶', label: 'Movilización y Operación', clave: 'movilizacion-operacion', capa: 'operacion' },
  { ruta: '/dia-e-comando', ic: '🗳️', label: 'Día E y Centro de Comando', clave: 'dia-e-comando', capa: 'dia_e' },
  { ruta: '/administracion', ic: '💼', label: 'Administración y Cumplimiento', clave: 'administracion', capa: 'administracion' },
  { ruta: '/estructura', ic: '🗂️', label: 'Estructura', clave: 'estructura', capa: 'estructura' },
  // 🆕 "Activos" ya no es un botón propio — su contenido vive ahora
  // como una pestaña MÁS dentro de Administración (junto a Gastos,
  // Ingresos, Bodega, Tope y Exportar), un solo lugar para todo lo
  // administrativo de la campaña.
];

const TODOS = MODULOS.map((m) => m.clave).filter((c) => c !== 'mi-avance');
const MODULOS_POR_ROL = {
  candidato: TODOS,
  jefe_campana: TODOS,
  coord_general: TODOS, // el default sin puesto reconocido — ver modulosDeCoordGeneral abajo
  // 🆕 Coordinador Regional — supervisa varios municipios como
  // bloque en campañas grandes (Gobernador, Dip. Federal), por eso
  // sí ve el Centro de Mando, a diferencia de un coordinador de un
  // solo municipio/distrito.
  coord_regional: TODOS.filter((c) => !['administracion'].includes(c)),
  coord_distrital: TODOS.filter((c) => !['administracion', 'dia-e-comando'].includes(c)),
  coord_municipal: TODOS.filter((c) => !['administracion', 'dia-e-comando'].includes(c)),
  coord_seccional: ['dashboard', 'mapa', 'movilizacion-operacion', 'estructura', 'dia-e-comando'],
  promotor: ['mi-avance', 'dia-e-comando', 'movilizacion-operacion'],
  // Encargado de Jurídico: su área, más lo que necesita para sustentar
  // quejas/recursos — Activos ahora vive dentro de Administración.
  encargado_juridico: ['dashboard', 'administracion', 'movilizacion-operacion'], // 🆕 'administracion' internamente solo le muestra la pestaña Jurídico a este rol
  encargado_finanzas: ['dashboard', 'administracion', 'movilizacion-operacion'], // 🆕 'administracion' internamente solo le muestra la pestaña Administrativo a este rol
};
const MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO = [
  { patron: /marketing|redes sociales|whatsapp|difusi[oó]n/i, modulos: ['marketing'] },
  { patron: /evento/i, modulos: ['movilizacion-operacion'] },
];
function modulosDeVoluntario(puesto) {
  const extra = new Set();
  MODULOS_EXTRA_POR_PUESTO_VOLUNTARIO.forEach((regla) => {
    if (regla.patron.test(puesto || '')) regla.modulos.forEach((m) => extra.add(m));
  });
  return ['dashboard', 'movilizacion-operacion', ...extra];
}

/**
 * 🆕 MÓDULOS POR PUESTO DE COORDINADOR GENERAL — mismo criterio que
 * ya aplica el backend (permisos.js) — deben mantenerse sincronizados,
 * es la misma regla de negocio en 2 lugares. Si el puesto no coincide
 * con nada de esta lista, se usa acceso completo (comportamiento de
 * siempre, para no romper coordinadores ya existentes).
 */
const MODULOS_POR_PUESTO_COORD_GENERAL = [
  { patron: /secretari[oa] particular/i, modulos: ['movilizacion-operacion'] },
  { patron: /log[íi]stica|avanzada|seguridad/i, modulos: ['movilizacion-operacion', 'administracion'] },
  { patron: /movilizaci[oó]n/i, modulos: ['dia-e-comando', 'movilizacion-operacion'] },
  { patron: /comunicaci[oó]n|prensa/i, modulos: ['marketing', 'administracion'] },
  { patron: /digital|redes sociales/i, modulos: ['marketing', 'inteligencia-electoral'] },
  { patron: /contenido|discurso/i, modulos: ['marketing'] },
  { patron: /representantes? de casilla/i, modulos: ['dia-e-comando', 'estructura'] },
  { patron: /estrategia/i, modulos: ['inteligencia-electoral'] },
  { patron: /finanzas|administraci[oó]n/i, modulos: ['administracion'] },
  { patron: /jur[íi]dico/i, modulos: ['administracion'] },
];
function modulosDeCoordGeneral(puesto) {
  if (!puesto) return TODOS;
  const regla = MODULOS_POR_PUESTO_COORD_GENERAL.find((r) => r.patron.test(puesto));
  return regla ? ['dashboard', 'mapa', ...regla.modulos] : TODOS;
}

/** Contenido de navegación compartido entre el riel de escritorio y el cajón móvil. */
function ListaModulos({ modulos, onNavegar }) {
  const enlaceModulo = (m) => (
    <NavLink key={m.ruta} to={m.ruta} onClick={onNavegar}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
          isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`
      }>
      <span className="text-base flex-shrink-0">{m.ic}</span>
      <span>{m.label}</span>
    </NavLink>
  );

  // 🆕 Dashboard y Mi Avance no pertenecen a ninguna capa — son
  // pantallas de inicio, siempre arriba de todo sin agrupar.
  const sinCapa = modulos.filter((m) => !m.capa);
  const conCapa = modulos.filter((m) => m.capa);

  return (
    <div className="space-y-3">
      {sinCapa.length > 0 && (
        <div className="space-y-0.5">{sinCapa.map(enlaceModulo)}</div>
      )}
      {CAPAS.map((capa) => {
        const modulosDeEstaCapa = conCapa.filter((m) => m.capa === capa.id);
        if (modulosDeEstaCapa.length === 0) return null; // no mostrar capas vacías para este rol
        // 🆕 Se quitó la etiqueta de la capa — cuando una capa solo
        // tiene 1 módulo (la mayoría de los casos hoy), la etiqueta
        // repetía casi el mismo texto que el botón de abajo. Se
        // mantiene el agrupamiento por capa (el orden), solo sin el
        // texto visible.
        return (
          <div key={capa.id} className="space-y-0.5">{modulosDeEstaCapa.map(enlaceModulo)}</div>
        );
      })}
    </div>
  );
}

/**
 * 🆕 AppShell — reemplaza a NavBar como estructura de navegación de
 * toda la app. Antes: una sola barra horizontal arriba con pastillas
 * compactas. Ahora: una franja superior delgada (marca + usuario) y
 * la navegación principal como una lista vertical del lado DERECHO,
 * con el nombre completo de cada módulo — no solo el ícono.
 *
 * Las pestañas que ya existían DENTRO de cada módulo (ej. Finanzas:
 * Gastos/Ingresos; Estructura: Organigrama/Lista/Ranking...) NO se
 * tocan — siguen viviendo arriba del contenido de cada página, ahora
 * con más aire porque ya no comparten esa franja con la navegación
 * principal.
 */
export default function AppShell({ children }) {
  const usuario = useAuth((s) => s.usuario);
  const cerrarSesion = useAuth((s) => s.cerrarSesion);
  const { tema, alternar } = useTema();
  const navigate = useNavigate();
  const location = useLocation();
  const [cajonAbierto, setCajonAbierto] = useState(false);
  // 🆕 Indicador de registros esperando conexión — antes no había
  // ninguna forma de saber si algo se quedó guardado localmente sin
  // enviarse todavía. Se revisa cada 8 segundos, y también apenas
  // cambia el estado de conexión del navegador.
  const [pendientesOffline, setPendientesOffline] = useState(0);
  useEffect(() => {
    const revisar = () => contarPendientesOffline().then(setPendientesOffline).catch(() => {});
    revisar();
    const intervalo = setInterval(revisar, 8000);
    window.addEventListener('online', revisar);
    window.addEventListener('offline', revisar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('online', revisar);
      window.removeEventListener('offline', revisar);
    };
  }, []);

  const salir = () => { cerrarSesion(); navigate('/login'); };
  const modulosPermitidos = usuario?.rol === 'voluntario' ? modulosDeVoluntario(usuario.puesto)
    : usuario?.rol === 'coord_general' ? modulosDeCoordGeneral(usuario.puesto)
    : (MODULOS_POR_ROL[usuario?.rol] || TODOS);
  const modulosVisibles = MODULOS.filter((m) => modulosPermitidos.includes(m.clave));
  const moduloActual = modulosVisibles.find((m) => location.pathname.startsWith(m.ruta));

  return (
    <div className="flex flex-col h-screen">
      {/* ── Franja superior delgada — SIEMPRE de 45px, en escritorio y
          celular, para que el mapa (que resta exactamente 45px con
          calc(100vh-45px)) no necesite ningún cambio. ── */}
      <div className="h-[45px] flex-shrink-0 flex items-center justify-between px-3 border-b border-slate-800 bg-slate-950/95 backdrop-blur z-[100]">
        <div className="flex items-center gap-2">
          {/* Botón de menú — solo visible en celular, abre el cajón con la lista completa */}
          <button onClick={() => setCajonAbierto(true)} className="lg:hidden text-white text-xl leading-none px-1" aria-label="Abrir menú">
            ☰
          </button>
          <span className="text-lg">🗳️</span>
          <span className="text-xs font-black text-white hidden sm:inline">VotoTech</span>
          {moduloActual && <span className="text-xs text-slate-500 hidden md:inline">· {moduloActual.label}</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* 🆕 Aviso de registros esperando conexión — solo aparece
              si de verdad hay algo pendiente, para no estorbar en el
              uso normal del día a día. */}
          {pendientesOffline > 0 && (
            <span title="Registros guardados en este celular, esperando conexión para enviarse" className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
              📡 {pendientesOffline}
            </span>
          )}
          <button onClick={alternar} className="text-sm px-2 py-1 rounded-lg hover:bg-slate-800" title="Cambiar tema">
            {tema === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="text-[10px] text-slate-500 hidden sm:inline">{usuario?.nombre}</span>
          <button onClick={salir} className="text-xs text-slate-500 hover:text-red-400 px-2 py-1">🚪</button>
        </div>
      </div>

      {/* ── Cuerpo: contenido a la izquierda, navegación a la derecha ── */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </div>

        {/* Riel de navegación — SOLO escritorio (lg+), del lado derecho, con nombre completo */}
        <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-l border-slate-800 bg-slate-950 p-3 overflow-y-auto">
          <ListaModulos modulos={modulosVisibles} />
        </aside>
      </div>

      {/* Cajón móvil — mismo listado, se desliza desde la derecha */}
      {cajonAbierto && (
        <div className="fixed inset-0 z-[3000] lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setCajonAbierto(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-72 max-w-[85%] bg-slate-950 border-l border-slate-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-black text-white">Módulos</span>
              <button onClick={() => setCajonAbierto(false)} className="text-slate-400 text-xl leading-none">✕</button>
            </div>
            <ListaModulos modulos={modulosVisibles} onNavegar={() => setCajonAbierto(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import RutaProtegida from './components/RutaProtegida';
import AvisoOffline from './components/AvisoOffline';
import ErrorBoundary, { ErrorBoundarySilencioso } from './components/ErrorBoundary';
import { useSuscripcionPush } from './lib/useSuscripcionPush';

// Carga diferida: cada módulo se descarga SOLO cuando alguien lo
// visita, en vez de mandar 1MB completo desde el primer segundo —
// importante para promotores en campo con internet lento/celular.
const RegistroCampana = lazy(() => import('./pages/RegistroCampana'));
const RegistroInvitacion = lazy(() => import('./pages/RegistroInvitacion'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
// 🆕 Auditoria.jsx ya no se enlaza en ninguna ruta — el módulo se consideró poco útil en la práctica
const Estructura = lazy(() => import('./pages/Estructura'));
// 🆕 Finanzas.jsx y Activos.jsx se combinaron en una sola pantalla —
// Administración, con todo por pestañas (Gastos, Ingresos, Activos,
// Bodega, Tope, Exportar).
const Administracion = lazy(() => import('./pages/Administracion'));
// 🆕 "Administración y Cumplimiento" ahora es una sola pantalla con
// pestañas — Jurídico, Administración y Respaldos dejaron de ser
// 3 entradas sueltas del menú.
// 🆕 8 módulos combinados en 3 pantallas con pestañas.
const InteligenciaElectoral = lazy(() => import('./pages/InteligenciaElectoral'));
const MovilizacionOperacion = lazy(() => import('./pages/MovilizacionOperacion'));
const DiaEComando = lazy(() => import('./pages/DiaEComando'));
const AdministracionCumplimiento = lazy(() => import('./pages/AdministracionCumplimiento'));
const Marketing = lazy(() => import('./pages/Marketing'));
// 🆕 Ya no se importan directamente aquí — ahora viven como pestañas
// dentro de AdministracionCumplimiento.jsx.
const EncuestaPublica = lazy(() => import('./pages/EncuestaPublica'));
const AfiliacionPublica = lazy(() => import('./pages/AfiliacionPublica'));
const Cotizador = lazy(() => import('./pages/Cotizador'));
const Landing = lazy(() => import('./pages/Landing'));
const TerminosPublico = lazy(() => import('./pages/TerminosPublico'));
const ContratoPublico = lazy(() => import('./pages/ContratoPublico'));
const PosturaLegal = lazy(() => import('./pages/PosturaLegal'));
const RecuperarPassword = lazy(() => import('./pages/RecuperarPassword'));
const PromotorHome = lazy(() => import('./pages/PromotorHome'));
const AdminPlataforma = lazy(() => import('./pages/AdminPlataforma'));
const MapaConCampana = lazy(() => import('./components/MapaConCampana'));
const ConfirmarVoto = lazy(() => import('./pages/ConfirmarVoto'));
const ConfirmarEvento = lazy(() => import('./pages/ConfirmarEvento'));

/** Se ve un instante mientras baja el módulo — mismo estilo que el
 * resto de la app, para que no se sienta como un salto raro. */
function CargandoModulo() {
  return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">⏳ Cargando...</div>;
}

/**
 * 🆕 LA CORRECCIÓN REAL — antes, ErrorBoundary envolvía TODO el
 * BrowserRouter, así que se montaba una sola vez en toda la vida de
 * la app. Si tronaba en una pantalla, se quedaba "pegado" mostrando
 * el error en TODAS las pantallas siguientes, aunque esas otras
 * funcionaran perfecto — porque React Router solo cambia lo de
 * adentro al navegar, sin volver a montar el ErrorBoundary.
 *
 * Con esto: el ErrorBoundary vive DENTRO del Router, y usa la ruta
 * actual (pathname) como "key". Cada vez que cambias de página, la
 * key cambia, y React trata eso como un componente nuevo — lo que
 * lo obliga a reiniciar su estado desde cero. Así, un error en una
 * pantalla ya no contamina a las demás.
 */
function ErrorBoundaryConReinicio({ children }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  useSuscripcionPush();
  // Si llegamos aquí es que la app cargó bien — se limpia la bandera
  // de "ya intenté recargar por un error de chunk", para que un
  // futuro error genuino (otro despliegue más adelante) sí dispare
  // el auto-recargado de nuevo, en vez de quedar bloqueado para siempre.
  useEffect(() => { sessionStorage.removeItem('vototech_recarga_por_chunk'); }, []);

  return (
    <BrowserRouter>
      <ErrorBoundaryConReinicio>
        <Suspense fallback={<CargandoModulo />}>
          <Routes>
            <Route path="/votar/:id" element={<ConfirmarVoto />} />
            <Route path="/evento/:agendaId/:promovidoId" element={<ConfirmarEvento />} />
            <Route path="/encuesta/:id" element={<EncuestaPublica />} />
            <Route path="/afiliate/:subdominio" element={<AfiliacionPublica />} />
            <Route path="/cotizar" element={<Cotizador />} />
            <Route path="/terminos" element={<TerminosPublico />} />
            <Route path="/contrato" element={<ContratoPublico />} />
            <Route path="/postura-legal" element={<PosturaLegal />} />
            <Route path="/recuperar-password" element={<RecuperarPassword />} />
            <Route
              path="/mi-avance"
              element={
                <RutaProtegida>
                  <PromotorHome />
                </RutaProtegida>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Landing />} />
            <Route path="/registro" element={<RegistroCampana />} />
            <Route path="/registro-invitacion" element={<RegistroInvitacion />} />
            <Route path="/vt-admin-plataforma" element={<AdminPlataforma />} />
            <Route path="/dashboard" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
            {/* 🆕 Ruta de Auditoría eliminada — el módulo se consideró poco funcional en la práctica */}
            <Route path="/estructura" element={<RutaProtegida><Estructura /></RutaProtegida>} />
            <Route path="/administracion" element={<RutaProtegida><AdministracionCumplimiento /></RutaProtegida>} />
            {/* 🆕 Centro de Decisiones dejó de ser una ruta/módulo aparte
                — ahora es una pestaña dentro de Inteligencia Electoral,
                así que cualquier enlace viejo a /centro-decisiones
                redirige para allá en vez de a una pantalla propia. */}
            <Route path="/centro-decisiones" element={<Navigate to="/inteligencia-electoral" replace />} />
            {/* 🆕 Redirecciones — por si algún enlace viejo o marcador
                todavía apunta a las rutas separadas de antes. */}
            <Route path="/finanzas" element={<Navigate to="/administracion" replace />} />
            {/* Por si alguien tiene guardado el link viejo de /activos */}
            <Route path="/activos" element={<Navigate to="/finanzas" replace />} />
            <Route path="/marketing" element={<RutaProtegida><Marketing /></RutaProtegida>} />
            <Route path="/juridico" element={<Navigate to="/administracion" replace />} />
            <Route path="/respaldos" element={<Navigate to="/administracion" replace />} />
            <Route
              path="/mapa"
              element={
                // 🆕 El promotor ya no tiene acceso al Mapa — si intenta
                // entrar directo por la URL, RutaProtegida lo regresa a
                // su pantalla (/mi-avance) en vez de mostrárselo.
                <RutaProtegida bloquearRoles={['promotor']}>
                  <MapaConCampana />
                </RutaProtegida>
              }
            />
            <Route path="/inteligencia-electoral" element={<RutaProtegida><InteligenciaElectoral /></RutaProtegida>} />
            <Route path="/movilizacion-operacion" element={<RutaProtegida><MovilizacionOperacion /></RutaProtegida>} />
            <Route path="/dia-e-comando" element={<RutaProtegida><DiaEComando /></RutaProtegida>} />
            {/* 🆕 Redirecciones — enlaces viejos siguen funcionando */}
            <Route path="/reportes" element={<Navigate to="/inteligencia-electoral" replace />} />
            <Route path="/priorizacion" element={<Navigate to="/inteligencia-electoral" replace />} />
            <Route path="/promovidos" element={<Navigate to="/movilizacion-operacion" replace />} />
            <Route path="/agenda" element={<Navigate to="/movilizacion-operacion" replace />} />
            <Route path="/logistica" element={<Navigate to="/movilizacion-operacion" replace />} />
            <Route path="/incidencias" element={<Navigate to="/movilizacion-operacion" replace />} />
            <Route path="/centro-mando" element={<Navigate to="/dia-e-comando" replace />} />
            <Route path="/dia-eleccion" element={<Navigate to="/dia-e-comando" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundaryConReinicio>
      <ErrorBoundarySilencioso><AvisoOffline /></ErrorBoundarySilencioso>
    </BrowserRouter>
  );
}

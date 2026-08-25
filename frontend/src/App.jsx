import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const CentroMando = lazy(() => import('./pages/CentroMando'));
const Promovidos = lazy(() => import('./pages/Promovidos'));
const Priorizacion = lazy(() => import('./pages/Priorizacion'));
const Estructura = lazy(() => import('./pages/Estructura'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Logistica = lazy(() => import('./pages/Logistica'));
const DiaEleccion = lazy(() => import('./pages/DiaEleccion'));
const Incidencias = lazy(() => import('./pages/Incidencias'));
// 🆕 Finanzas.jsx y Activos.jsx se combinaron en una sola pantalla —
// Administración, con todo por pestañas (Gastos, Ingresos, Activos,
// Bodega, Tope, Exportar).
const Administracion = lazy(() => import('./pages/Administracion'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Juridico = lazy(() => import('./pages/Juridico'));
const Respaldos = lazy(() => import('./pages/Respaldos'));
const EncuestaPublica = lazy(() => import('./pages/EncuestaPublica'));
const TerminosPublico = lazy(() => import('./pages/TerminosPublico'));
const ContratoPublico = lazy(() => import('./pages/ContratoPublico'));
const PosturaLegal = lazy(() => import('./pages/PosturaLegal'));
const RecuperarPassword = lazy(() => import('./pages/RecuperarPassword'));
const PromotorHome = lazy(() => import('./pages/PromotorHome'));
const AdminPlataforma = lazy(() => import('./pages/AdminPlataforma'));
const MapaConCampana = lazy(() => import('./components/MapaConCampana'));
const ConfirmarVoto = lazy(() => import('./pages/ConfirmarVoto'));

/** Se ve un instante mientras baja el módulo — mismo estilo que el
 * resto de la app, para que no se sienta como un salto raro. */
function CargandoModulo() {
  return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">⏳ Cargando...</div>;
}

export default function App() {
  useSuscripcionPush();
  // Si llegamos aquí es que la app cargó bien — se limpia la bandera
  // de "ya intenté recargar por un error de chunk", para que un
  // futuro error genuino (otro despliegue más adelante) sí dispare
  // el auto-recargado de nuevo, en vez de quedar bloqueado para siempre.
  useEffect(() => { sessionStorage.removeItem('vototech_recarga_por_chunk'); }, []);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={<CargandoModulo />}>
        <Routes>
          <Route path="/votar/:id" element={<ConfirmarVoto />} />
          <Route path="/encuesta/:id" element={<EncuestaPublica />} />
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
          <Route path="/registro" element={<RegistroCampana />} />
          <Route path="/registro-invitacion" element={<RegistroInvitacion />} />
          <Route path="/vt-admin-plataforma" element={<AdminPlataforma />} />
          <Route path="/dashboard" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
          <Route path="/centro-mando" element={<RutaProtegida><CentroMando /></RutaProtegida>} />
          <Route path="/promovidos" element={<RutaProtegida><Promovidos /></RutaProtegida>} />
          <Route path="/priorizacion" element={<RutaProtegida><Priorizacion /></RutaProtegida>} />
          <Route path="/estructura" element={<RutaProtegida><Estructura /></RutaProtegida>} />
          <Route path="/agenda" element={<RutaProtegida><Agenda /></RutaProtegida>} />
          <Route path="/logistica" element={<RutaProtegida><Logistica /></RutaProtegida>} />
          <Route path="/dia-eleccion" element={<RutaProtegida><DiaEleccion /></RutaProtegida>} />
          <Route path="/incidencias" element={<RutaProtegida><Incidencias /></RutaProtegida>} />
          <Route path="/finanzas" element={<RutaProtegida><Administracion /></RutaProtegida>} />
          {/* Por si alguien tiene guardado el link viejo de /activos */}
          <Route path="/activos" element={<Navigate to="/finanzas" replace />} />
          <Route path="/reportes" element={<RutaProtegida><Reportes /></RutaProtegida>} />
          <Route path="/marketing" element={<RutaProtegida><Marketing /></RutaProtegida>} />
          <Route path="/juridico" element={<RutaProtegida><Juridico /></RutaProtegida>} />
          <Route path="/respaldos" element={<RutaProtegida><Respaldos /></RutaProtegida>} />
          <Route
            path="/mapa"
            element={
              <RutaProtegida>
                <MapaConCampana />
              </RutaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <ErrorBoundarySilencioso><AvisoOffline /></ErrorBoundarySilencioso>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

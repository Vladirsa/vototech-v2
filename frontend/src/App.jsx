import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import RegistroCampana from './pages/RegistroCampana';
import RegistroInvitacion from './pages/RegistroInvitacion';
import Dashboard from './pages/Dashboard';
import Promovidos from './pages/Promovidos';
import Priorizacion from './pages/Priorizacion';
import Estructura from './pages/Estructura';
import Agenda from './pages/Agenda';
import Codigos from './pages/Codigos';
import DiaEleccion from './pages/DiaEleccion';
import Incidencias from './pages/Incidencias';
import Finanzas from './pages/Finanzas';
import Activos from './pages/Activos';
import AdminPlataforma from './pages/AdminPlataforma';
import MapaElectoral from './components/MapaElectoral';
import RutaProtegida from './components/RutaProtegida';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<RegistroCampana />} />
        <Route path="/registro-invitacion" element={<RegistroInvitacion />} />
        <Route path="/vt-admin-plataforma" element={<AdminPlataforma />} />
        <Route path="/dashboard" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
        <Route path="/promovidos" element={<RutaProtegida><Promovidos /></RutaProtegida>} />
        <Route path="/priorizacion" element={<RutaProtegida><Priorizacion /></RutaProtegida>} />
        <Route path="/estructura" element={<RutaProtegida><Estructura /></RutaProtegida>} />
        <Route path="/agenda" element={<RutaProtegida><Agenda /></RutaProtegida>} />
        <Route path="/codigos" element={<RutaProtegida><Codigos /></RutaProtegida>} />
        <Route path="/dia-eleccion" element={<RutaProtegida><DiaEleccion /></RutaProtegida>} />
        <Route path="/incidencias" element={<RutaProtegida><Incidencias /></RutaProtegida>} />
        <Route path="/finanzas" element={<RutaProtegida><Finanzas /></RutaProtegida>} />
        <Route path="/activos" element={<RutaProtegida><Activos /></RutaProtegida>} />
        <Route
          path="/mapa"
          element={
            <RutaProtegida>
              <MapaElectoral territorioTipo="municipio" territorioId={3} tipoEleccion="ayuntamiento" anio={2024} />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

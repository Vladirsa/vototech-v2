import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import NavBar from './NavBar';
import AvisoVencimiento from './AvisoVencimiento';
import { ErrorBoundarySilencioso } from './ErrorBoundary';

export default function RutaProtegida({ children }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    // 🆕 Antes era un fragmento <>, sin altura definida — eso hacía
    // que apareciera una barra de scroll extra en toda la pantalla,
    // encima del mapa (que ya calcula su propia altura con
    // calc(100vh-45px)). Con este contenedor de altura fija, el mapa
    // ocupa exactamente el espacio que le corresponde, sin scroll de más.
    <div className="flex flex-col h-screen">
      <NavBar />
      <ErrorBoundarySilencioso><AvisoVencimiento /></ErrorBoundarySilencioso>
      {children}
    </div>
  );
}

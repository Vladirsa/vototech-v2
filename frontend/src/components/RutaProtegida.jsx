import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import NavBar from './NavBar';
import AvisoVencimiento from './AvisoVencimiento';
import { ErrorBoundarySilencioso } from './ErrorBoundary';

export default function RutaProtegida({ children }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    // Antes el mapa asumía que el menú siempre mide 45px exactos —
    // en cuanto el menú creció (aviso de demo, aviso de vencimiento,
    // etc.) esa diferencia empujaba a TODA la página a hacer scroll,
    // tapando botones flotantes. Con flex-col + h-screen, el
    // contenido de abajo siempre llena justo lo que sobra, sin
    // importar cuánto mida el menú en cada momento.
    <div className="h-screen flex flex-col overflow-hidden">
      <NavBar />
      <ErrorBoundarySilencioso><AvisoVencimiento /></ErrorBoundarySilencioso>
      <div className="flex-1 overflow-y-auto min-h-0">
        {children}
      </div>
    </div>
  );
}

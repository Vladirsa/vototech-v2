import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import AppShell from './AppShell';
import AvisoVencimiento from './AvisoVencimiento';
import { ErrorBoundarySilencioso } from './ErrorBoundary';

// 🆕 bloquearRoles (opcional) — lista de roles a los que esta ruta
// NO debe dejar entrar, ni aunque escriban la URL directamente en el
// navegador. Si el rol del usuario está en la lista, lo mandamos de
// regreso a su pantalla propia (/mi-avance) en vez de mostrarle la
// página bloqueada. Sin este prop, el comportamiento es exactamente
// el mismo de antes (solo revisa que haya sesión iniciada).
export default function RutaProtegida({ children, bloquearRoles }) {
  const token = useAuth((s) => s.token);
  const usuario = useAuth((s) => s.usuario);
  if (!token) return <Navigate to="/login" replace />;
  if (bloquearRoles && usuario?.rol && bloquearRoles.includes(usuario.rol)) {
    return <Navigate to="/mi-avance" replace />;
  }
  return (
    <AppShell>
      <ErrorBoundarySilencioso><AvisoVencimiento /></ErrorBoundarySilencioso>
      {children}
    </AppShell>
  );
}

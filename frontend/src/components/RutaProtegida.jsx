import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import AppShell from './AppShell';
import AvisoVencimiento from './AvisoVencimiento';
import { ErrorBoundarySilencioso } from './ErrorBoundary';

export default function RutaProtegida({ children }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <ErrorBoundarySilencioso><AvisoVencimiento /></ErrorBoundarySilencioso>
      {children}
    </AppShell>
  );
}

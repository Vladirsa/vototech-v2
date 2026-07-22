import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import NavBar from './NavBar';
import AvisoVencimiento from './AvisoVencimiento';
import { ErrorBoundarySilencioso } from './ErrorBoundary';

export default function RutaProtegida({ children }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <>
      <NavBar />
      <ErrorBoundarySilencioso><AvisoVencimiento /></ErrorBoundarySilencioso>
      {children}
    </>
  );
}

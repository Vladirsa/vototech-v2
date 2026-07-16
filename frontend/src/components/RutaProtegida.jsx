import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/authStore';
import NavBar from './NavBar';

export default function RutaProtegida({ children }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}

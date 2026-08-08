import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

/**
 * Página PÚBLICA — nadie necesita cuenta ni contraseña. Es el
 * enlace que le llega al promovido por WhatsApp. Solo confirma
 * ASISTENCIA (dato público de la fila) — nunca pregunta por quién
 * votó, eso es secreto por ley y nunca se le pide a nadie aquí.
 */
export default function ConfirmarVoto() {
  const { id } = useParams();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | confirmado | error
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/publico/confirmar-voto/${id}`)
      .then((r) => {
        setNombre(r.data.data.nombre);
        setEstado(r.data.data.ya_voto ? 'confirmado' : 'listo');
      })
      .catch(() => setEstado('error'));
  }, [id]);

  const confirmar = async () => {
    try {
      await axios.post(`${API_URL}/publico/confirmar-voto/${id}`);
      setEstado('confirmado');
    } catch {
      setEstado('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 to-purple-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
        <div className="text-4xl">🗳️</div>

        {estado === 'cargando' && <p className="text-slate-400 text-sm">Cargando...</p>}

        {estado === 'listo' && (
          <>
            <h1 className="text-lg font-black text-white">¡Hola, {nombre}!</h1>
            <p className="text-sm text-slate-400">¿Ya fuiste a votar hoy?</p>
            <button onClick={confirmar} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold">✅ Sí, ya voté</button>
            <p className="text-[10px] text-slate-600">Esto solo confirma que fuiste a la casilla — nunca preguntamos ni registramos por quién votaste, eso es secreto.</p>
          </>
        )}

        {estado === 'confirmado' && (
          <>
            <h1 className="text-lg font-black text-emerald-400">¡Gracias, {nombre}!</h1>
            <p className="text-sm text-slate-400">Tu participación quedó registrada. 🎉</p>
          </>
        )}

        {estado === 'error' && (
          <p className="text-sm text-red-400">Este enlace no es válido o ya expiró.</p>
        )}
      </div>
    </div>
  );
}

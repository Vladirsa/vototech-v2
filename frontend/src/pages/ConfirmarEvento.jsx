import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

/**
 * Página PÚBLICA — nadie necesita cuenta ni contraseña. Es el enlace
 * que le llega al promovido por WhatsApp para confirmar si va a un
 * evento (mitin, reunión) o no — mismo patrón que ConfirmarVoto.jsx.
 */
export default function ConfirmarEvento() {
  const { agendaId, promovidoId } = useParams();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | confirmado | error
  const [nombre, setNombre] = useState('');
  const [evento, setEvento] = useState(null);
  const [respuestaDada, setRespuestaDada] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/publico/confirmar-evento/${agendaId}/${promovidoId}`)
      .then((r) => {
        setNombre(r.data.data.nombre);
        setEvento(r.data.data.evento);
        if (r.data.data.va !== null) { setRespuestaDada(r.data.data.va); setEstado('confirmado'); }
        else setEstado('listo');
      })
      .catch(() => setEstado('error'));
  }, [agendaId, promovidoId]);

  const confirmar = async (va) => {
    try {
      await axios.post(`${API_URL}/publico/confirmar-evento/${agendaId}/${promovidoId}`, { va });
      setRespuestaDada(va);
      setEstado('confirmado');
    } catch {
      setEstado('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 to-purple-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
        <div className="text-4xl">📅</div>

        {estado === 'cargando' && <p className="text-slate-400 text-sm">Cargando...</p>}

        {estado === 'listo' && evento && (
          <>
            <h1 className="text-lg font-black text-white">¡Hola, {nombre}!</h1>
            <div className="bg-slate-800/60 rounded-xl p-3 text-left">
              <div className="text-sm font-bold text-white">{evento.titulo}</div>
              <div className="text-xs text-slate-400 mt-1">
                📆 {new Date(evento.fecha_inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {evento.lugar && <div className="text-xs text-slate-400">📍 {evento.lugar}</div>}
            </div>
            <p className="text-sm text-slate-400">¿Vas a poder venir?</p>
            <div className="flex gap-2">
              <button onClick={() => confirmar(true)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold">✅ Sí, ahí estaré</button>
              <button onClick={() => confirmar(false)} className="flex-1 py-3 rounded-xl bg-slate-700 text-slate-300 font-bold">No podré ir</button>
            </div>
          </>
        )}

        {estado === 'confirmado' && (
          <>
            <h1 className={`text-lg font-black ${respuestaDada ? 'text-emerald-400' : 'text-slate-300'}`}>
              {respuestaDada ? `¡Gracias, ${nombre}!` : `Gracias por avisar, ${nombre}`}
            </h1>
            <p className="text-sm text-slate-400">
              {respuestaDada ? 'Te esperamos en el evento. 🎉' : 'Esperamos verte en la próxima.'}
            </p>
          </>
        )}

        {estado === 'error' && (
          <p className="text-sm text-red-400">Este enlace no es válido o ya expiró.</p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export default function EncuestaPublica() {
  const { id } = useParams();
  const [encuesta, setEncuesta] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/publico/encuesta/${id}`)
      .then((r) => { setEncuesta(r.data.data); setEstado('listo'); })
      .catch((e) => { setError(e.response?.data?.error || 'Enlace inválido'); setEstado('error'); });
  }, [id]);

  const enviar = async () => {
    // Ubicación OPCIONAL — si la persona da permiso, ayuda a ubicar de
    // dónde vienen las respuestas en el mapa. Si no da permiso o falla,
    // se manda la respuesta igual, sin bloquear nada.
    const obtenerUbicacion = () => new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 4000 }
      );
    });

    const ubicacion = await obtenerUbicacion();
    try {
      await axios.post(`${API_URL}/publico/encuesta/${id}/responder`, { respuestas, ...ubicacion });
      setEstado('enviado');
    } catch (e) {
      setError(e.response?.data?.error || 'Error al enviar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 to-purple-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
        {estado === 'cargando' && <p className="text-slate-400 text-sm text-center">Cargando...</p>}
        {estado === 'error' && <p className="text-red-400 text-sm text-center">⚠️ {error}</p>}

        {estado === 'listo' && encuesta && (
          <>
            <div className="text-center">
              <div className="text-3xl mb-2">📋</div>
              <h1 className="text-lg font-black text-white">{encuesta.titulo}</h1>
              {encuesta.descripcion && <p className="text-xs text-slate-400 mt-1">{encuesta.descripcion}</p>}
            </div>

            {encuesta.preguntas.map((p) => (
              <div key={p.id}>
                <label className="text-sm text-slate-200 font-bold block mb-2">{p.texto}</label>
                {p.tipo === 'opcion_multiple' ? (
                  <div className="space-y-2">
                    {p.opciones.map((op) => (
                      <button key={op} onClick={() => setRespuestas({ ...respuestas, [p.id]: op })}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition ${respuestas[p.id] === op ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                        {op}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea value={respuestas[p.id] || ''} onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
                    placeholder="Escribe tu respuesta..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
                )}
              </div>
            ))}

            <button onClick={enviar} className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold">Enviar respuestas</button>
          </>
        )}

        {estado === 'enviado' && (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">🎉</div>
            <h1 className="text-lg font-black text-emerald-400">¡Gracias por tu opinión!</h1>
            <p className="text-sm text-slate-400 mt-1">Tu respuesta quedó registrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

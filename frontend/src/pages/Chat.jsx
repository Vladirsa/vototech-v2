import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';

const ROL_ICONO = { candidato: '👑', jefe_campana: '👑', coord_general: '⭐', coord_distrital: '🗺️', coord_municipal: '🏘️', coord_seccional: '📍', promotor: '🤝' };

export default function Chat() {
  const usuario = useAuth((s) => s.usuario);
  const esPromotor = usuario?.rol === 'promotor';
  const [canal, setCanal] = useState('general');
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const finRef = useRef(null);

  const cargar = (c) => {
    setCargando(true);
    api.get(`/chat/${c}`).then((r) => { setMensajes(r.data.data); setCargando(false); });
  };
  useEffect(() => { cargar(canal); }, [canal]);

  useSocket({
    chat_mensaje: (m) => {
      if (m.canal === canal) setMensajes((prev) => [...prev, m]);
    },
  });

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

  const enviar = async () => {
    if (!texto.trim()) return;
    const textoEnviado = texto;
    setTexto('');
    try {
      await api.post(`/chat/${canal}`, { texto: textoEnviado });
    } catch (e) {
      alert(e.response?.data?.error || 'Error al enviar');
      setTexto(textoEnviado);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col" style={{ height: '100vh' }}>
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 p-4 md:p-8 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black text-white">💬 Chat Interno</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <button onClick={() => setCanal('general')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${canal === 'general' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            🌐 General
          </button>
          {!esPromotor && (
            <button onClick={() => setCanal('coordinadores')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${canal === 'coordinadores' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              ⭐ Coordinadores
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-900/40 border border-slate-800 rounded-t-xl p-3 space-y-2 min-h-[50vh]">
          {cargando ? (
            <div className="text-center text-slate-500 text-xs py-10">⏳ Cargando mensajes...</div>
          ) : mensajes.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-10">Sin mensajes todavía — sé el primero en escribir</div>
          ) : mensajes.map((m) => {
            const esPropio = m.autor_nombre === usuario?.nombre;
            return (
              <div key={m.id} className={`flex ${esPropio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 ${esPropio ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                  {!esPropio && (
                    <div className="text-[10px] font-bold text-indigo-300 mb-0.5">{ROL_ICONO[m.autor_rol] || '👤'} {m.autor_nombre}{m.autor_puesto && ` · ${m.autor_puesto}`}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.texto}</div>
                  <div className={`text-[9px] mt-0.5 ${esPropio ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {new Date(m.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={finRef} />
        </div>

        <div className="flex gap-2 p-3 bg-slate-900/60 border border-t-0 border-slate-800 rounded-b-xl mb-4">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder="Escribe un mensaje..."
            className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
          />
          <button onClick={enviar} disabled={!texto.trim()} className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

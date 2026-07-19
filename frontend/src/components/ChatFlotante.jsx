import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';

const ROL_ICONO = { candidato: '👑', jefe_campana: '👑', coord_general: '⭐', coord_distrital: '🗺️', coord_municipal: '🏘️', coord_seccional: '📍', promotor: '🤝' };
const ROL_LABEL_CORTO = { candidato: 'Candidato', jefe_campana: 'Jefe Campaña', coord_general: 'Coord. General', coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional', promotor: 'Promotor' };

function nombreCanalDM(idA, idB) {
  return `dm-${[idA, idB].sort().join('-')}`;
}

/**
 * Chat flotante — vive montado UNA vez en App.jsx, fuera de las
 * rutas, para que aparezca en TODOS los módulos sin perder la
 * conversación al cambiar de pantalla. Burbuja abajo a la derecha,
 * con contador de mensajes nuevos mientras está cerrado.
 */
export default function ChatFlotante() {
  const usuario = useAuth((s) => s.usuario);
  const [abierto, setAbierto] = useState(false);
  const [conversacionActiva, setConversacionActiva] = useState('general');
  const [contactos, setContactos] = useState([]);
  const [enLinea, setEnLinea] = useState(new Set());
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [noLeidos, setNoLeidos] = useState(0);
  const [noLeidosPorConversacion, setNoLeidosPorConversacion] = useState({});
  const finRef = useRef(null);
  const esPromotor = usuario?.rol === 'promotor';

  useEffect(() => {
    if (!usuario) return;
    api.get('/chat/contactos/lista').then((r) => setContactos(r.data.data)).catch(() => {});
  }, [usuario]);

  useEffect(() => {
    if (!abierto) return;
    api.get(`/chat/${conversacionActiva}`).then((r) => setMensajes(r.data.data)).catch(() => setMensajes([]));
    setNoLeidosPorConversacion((prev) => ({ ...prev, [conversacionActiva]: 0 }));
  }, [conversacionActiva, abierto]);

  useSocket({
    usuarios_en_linea: (ids) => setEnLinea(new Set(ids)),
    chat_mensaje: (m) => {
      const esMio = m.autor_id === usuario?.id;
      const estaViendoEstaConversacion = abierto && m.canal === conversacionActiva;

      if (estaViendoEstaConversacion) {
        setMensajes((prev) => [...prev, m]);
      } else if (!esMio) {
        setNoLeidos((n) => n + 1);
        setNoLeidosPorConversacion((prev) => ({ ...prev, [m.canal]: (prev[m.canal] || 0) + 1 }));
      }
    },
  });

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

  const abrir = () => { setAbierto(true); setNoLeidos(0); };

  const enviar = async () => {
    if (!texto.trim()) return;
    const t = texto;
    setTexto('');
    try {
      await api.post(`/chat/${conversacionActiva}`, { texto: t });
    } catch (e) {
      alert(e.response?.data?.error || 'Error al enviar');
      setTexto(t);
    }
  };

  if (!usuario) return null;

  const contactoActivo = conversacionActiva.startsWith('dm-') ? contactos.find((c) => conversacionActiva === nombreCanalDM(usuario.id, c.id)) : null;
  const tituloConversacion = conversacionActiva === 'general' ? '🌐 General' : conversacionActiva === 'coordinadores' ? '⭐ Coordinadores' : contactoActivo ? `${ROL_ICONO[contactoActivo.rol] || '👤'} ${contactoActivo.nombre}` : '...';

  return (
    <>
      {!abierto && (
        <button onClick={abrir} className="fixed bottom-5 right-5 z-[3000] w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-2xl shadow-2xl flex items-center justify-center transition-transform hover:scale-105">
          💬
          {noLeidos > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-slate-950">
              {noLeidos > 9 ? '9+' : noLeidos}
            </span>
          )}
        </button>
      )}

      {abierto && (
        <div className="fixed bottom-5 right-5 z-[3000] w-[380px] max-w-[95vw] h-[560px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex overflow-hidden">
          <div className="w-28 flex-shrink-0 bg-slate-950/60 border-r border-slate-800 overflow-y-auto">
            <div className="p-1.5 space-y-1">
              <button onClick={() => setConversacionActiva('general')}
                className={`w-full flex flex-col items-center gap-0.5 p-1.5 rounded-lg relative ${conversacionActiva === 'general' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}>
                <span className="text-base">🌐</span>
                <span className="text-[8px] text-slate-300 leading-tight">General</span>
                {noLeidosPorConversacion['general'] > 0 && <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-red-500" />}
              </button>
              {!esPromotor && (
                <button onClick={() => setConversacionActiva('coordinadores')}
                  className={`w-full flex flex-col items-center gap-0.5 p-1.5 rounded-lg relative ${conversacionActiva === 'coordinadores' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}>
                  <span className="text-base">⭐</span>
                  <span className="text-[8px] text-slate-300 leading-tight">Coords.</span>
                  {noLeidosPorConversacion['coordinadores'] > 0 && <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-red-500" />}
                </button>
              )}
            </div>
            <div className="border-t border-slate-800 mt-1 pt-1 px-1.5 space-y-1">
              <div className="text-[8px] font-bold text-slate-600 uppercase px-1">Personas</div>
              {contactos.map((c) => {
                const canalDM = nombreCanalDM(usuario.id, c.id);
                const activo = conversacionActiva === canalDM;
                const conectado = enLinea.has(c.id);
                return (
                  <button key={c.id} onClick={() => setConversacionActiva(canalDM)}
                    className={`w-full flex flex-col items-center gap-0.5 p-1.5 rounded-lg relative ${activo ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}
                    title={c.nombre}>
                    <div className="relative">
                      <span className="text-base">{ROL_ICONO[c.rol] || '👤'}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${conectado ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    </div>
                    <span className="text-[7px] text-slate-400 leading-tight truncate w-full text-center">{c.nombre.split(' ')[0]}</span>
                    {noLeidosPorConversacion[canalDM] > 0 && <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-red-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-950/40">
              <div>
                <div className="text-xs font-bold text-white truncate">{tituloConversacion}</div>
                {contactoActivo && (
                  <div className="text-[9px] text-slate-500">
                    {enLinea.has(contactoActivo.id) ? <span className="text-emerald-400">● En línea</span> : '○ Desconectado'} · {contactoActivo.puesto || ROL_LABEL_CORTO[contactoActivo.rol]}
                  </div>
                )}
              </div>
              <button onClick={() => setAbierto(false)} className="text-slate-500 hover:text-white text-lg leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {mensajes.length === 0 ? (
                <div className="text-center text-slate-600 text-[11px] py-8">Sin mensajes todavía</div>
              ) : mensajes.map((m) => {
                const esPropio = m.autor_id === usuario.id;
                return (
                  <div key={m.id} className={`flex ${esPropio ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-2.5 py-1.5 ${esPropio ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                      {!esPropio && !conversacionActiva.startsWith('dm-') && (
                        <div className="text-[9px] font-bold text-indigo-300">{m.autor_nombre}</div>
                      )}
                      <div className="text-xs whitespace-pre-wrap break-words">{m.texto}</div>
                      <div className={`text-[8px] mt-0.5 ${esPropio ? 'text-indigo-200' : 'text-slate-500'}`}>
                        {new Date(m.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={finRef} />
            </div>

            <div className="flex gap-1.5 p-2 border-t border-slate-800">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                placeholder="Escribe..."
                className="flex-1 px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
              />
              <button onClick={enviar} disabled={!texto.trim()} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">➤</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

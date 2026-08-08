import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';

const ROL_ICONO = { candidato: '👑', jefe_campana: '👑', coord_general: '⭐', coord_distrital: '🗺️', coord_municipal: '🏘️', coord_seccional: '📍', promotor: '🤝', encargado_juridico: '⚖️', encargado_finanzas: '💰', voluntario: '🙋' };
const ROL_LABEL_CORTO = { candidato: 'Candidato', jefe_campana: 'Jefe Campaña', coord_general: 'Coord. General', coord_distrital: 'Coord. Distrital', coord_municipal: 'Coord. Municipal', coord_seccional: 'Coord. Seccional', promotor: 'Promotor', encargado_juridico: 'Jurídico', encargado_finanzas: 'Finanzas', voluntario: 'Voluntario' };

function nombreCanalDM(idA, idB) {
  // Si falta cualquiera de los dos IDs, no se debe ni intentar — es
  // preferible que el botón no haga nada a que mande "dm-...-undefined"
  // al servidor y salga "canal inválido" sin explicación.
  if (!idA || !idB) return null;
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
  const [busquedaContacto, setBusquedaContacto] = useState('');
  const [filtroJerarquia, setFiltroJerarquia] = useState('todos');
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [noLeidos, setNoLeidos] = useState(0);
  const [noLeidosPorConversacion, setNoLeidosPorConversacion] = useState({});
  const finRef = useRef(null);
  const esPromotor = usuario?.rol === 'promotor';

  useEffect(() => {
    if (!usuario) return;
    api.get('/chat/contactos/lista').then((r) => setContactos(r.data.data)).catch(() => {});
    // Pide permiso de notificaciones del navegador una sola vez, sin
    // ser invasivo — si la persona lo niega, simplemente no insistimos.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
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
      const conversacionEstaAbierta = abierto && m.canal === conversacionActiva;

      // El mensaje se agrega a la lista SIEMPRE que la conversación
      // esté abierta, sin importar si la pestaña tiene el foco —
      // si no, al volver se vería como si faltara ese mensaje.
      if (conversacionEstaAbierta) {
        setMensajes((prev) => [...prev, m]);
      }

      if (!esMio && !(conversacionEstaAbierta && document.hasFocus())) {
        setNoLeidos((n) => n + 1);
        setNoLeidosPorConversacion((prev) => ({ ...prev, [m.canal]: (prev[m.canal] || 0) + 1 }));

        // Notificación real del sistema si la pestaña está en segundo
        // plano o el chat cerrado — no hace falta tener VotoTech en
        // primer plano para enterarse de un mensaje nuevo.
        if ((document.hidden || !abierto) && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(`💬 ${m.autor_nombre}`, { body: m.texto, icon: '/pwa-192x192.png', tag: 'vototech-chat' });
        }
      }
    },
  });

  // Título de la pestaña parpadea con el conteo de no leídos —
  // visible aunque el navegador esté minimizado o en otra ventana.
  useEffect(() => {
    const original = 'VotoTech';
    if (noLeidos === 0) { document.title = original; return; }
    let visible = true;
    const intervalo = setInterval(() => {
      if (document.hasFocus()) { document.title = original; return; } // ya volviste, deja de parpadear
      document.title = visible ? `(${noLeidos > 9 ? '9+' : noLeidos}) 💬 Nuevo mensaje` : original;
      visible = !visible;
    }, 1200);
    return () => { clearInterval(intervalo); document.title = original; };
  }, [noLeidos]);

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

  const NIVELES_JERARQUIA = [
    { id: 'todos', label: 'Todos' },
    { id: 'direccion', label: 'Dirección', roles: ['candidato', 'jefe_campana', 'coord_general'] },
    { id: 'coordinacion', label: 'Coordinadores', roles: ['coord_distrital', 'coord_municipal', 'coord_seccional'] },
    { id: 'promotor', label: 'Promotores', roles: ['promotor'] },
  ];
  const contactosFiltrados = contactos
    .filter((c) => filtroJerarquia === 'todos' || NIVELES_JERARQUIA.find((n) => n.id === filtroJerarquia)?.roles.includes(c.rol))
    .filter((c) => !busquedaContacto || c.nombre.toLowerCase().includes(busquedaContacto.toLowerCase()));

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
        <div className="fixed bottom-5 right-5 z-[3000] w-[440px] max-w-[95vw] h-[580px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex overflow-hidden">
          <div className="w-40 flex-shrink-0 bg-slate-950/60 border-r border-slate-800 flex flex-col">
            <div className="p-1.5 flex gap-1">
              <button onClick={() => setConversacionActiva('general')}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-bold relative ${conversacionActiva === 'general' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
                🌐 General
                {noLeidosPorConversacion['general'] > 0 && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />}
              </button>
              {!esPromotor && (
                <button onClick={() => setConversacionActiva('coordinadores')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-bold relative ${conversacionActiva === 'coordinadores' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
                  ⭐ Coords.
                  {noLeidosPorConversacion['coordinadores'] > 0 && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />}
                </button>
              )}
            </div>

            {/* Buscador y filtro por jerarquía — antes era una lista larga
                imposible de recorrer, ahora se puede acotar de un jalón */}
            <div className="px-1.5 pb-1.5 space-y-1 border-b border-slate-800">
              <input value={busquedaContacto} onChange={(e) => setBusquedaContacto(e.target.value)} placeholder="🔍 Buscar..."
                className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-[10px]" />
              <select value={filtroJerarquia} onChange={(e) => setFiltroJerarquia(e.target.value)}
                className="w-full px-1.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-[9px]">
                {NIVELES_JERARQUIA.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
              {contactosFiltrados.length === 0 ? (
                <div className="text-[9px] text-slate-600 text-center py-4">Sin resultados</div>
              ) : contactosFiltrados.map((c) => {
                const canalDM = nombreCanalDM(usuario.id, c.id);
                const activo = conversacionActiva === canalDM;
                const conectado = enLinea.has(c.id);
                return (
                  <button key={c.id} disabled={!canalDM} onClick={() => canalDM && setConversacionActiva(canalDM)}
                    className={`w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg relative text-left ${activo ? 'bg-indigo-600' : 'hover:bg-slate-800'} disabled:opacity-40`}>
                    <div className="relative flex-shrink-0">
                      <span className="text-sm">{ROL_ICONO[c.rol] || '👤'}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${conectado ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    </div>
                    <span className={`text-[9px] leading-tight truncate flex-1 ${activo ? 'text-white font-bold' : 'text-slate-300'}`}>{c.nombre}</span>
                    {noLeidosPorConversacion[canalDM] > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
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
                    {enLinea.has(contactoActivo.id) ? <span className="text-emerald-400">● En línea</span> : '○ Desconectado'} · {contactoActivo.puesto || ROL_LABEL_CORTO[contactoActivo.rol] || contactoActivo.rol}
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

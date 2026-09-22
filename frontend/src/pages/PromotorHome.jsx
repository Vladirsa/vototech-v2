import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';
import { ModalAgregar } from './Promovidos';

// 🆕 Modal "Recordar el voto" — la lista de ESTE promotor (solo su
// propia gente comprometida, con teléfono) y un botón de WhatsApp por
// persona. Nunca manda nada solo: abre WhatsApp del celular del
// promotor con el mensaje ya escrito, listo para revisar y tocar
// enviar — cero costo, cero servidor de mensajería de por medio.
// 🆕 Modal genérico "mandar algo a mi gente por WhatsApp" — lo usan
// tanto "Recordar el voto" (mensaje fijo, solo comprometidos) como el
// banner de contenido nuevo del equipo de redes (mensaje = lo que
// subieron, a TODOS sus contactos con teléfono). Nunca manda nada
// solo: abre WhatsApp del celular del promotor, con el mensaje ya
// escrito, listo para revisar y tocar enviar.
function ModalEnviarAMiGente({ titulo, endpoint, armarMensaje, onCerrar }) {
  const [lista, setLista] = useState(null);
  const [enviados, setEnviados] = useState({}); // solo visual, no se guarda

  useEffect(() => {
    api.get(endpoint).then((r) => setLista(r.data.data)).catch(() => setLista([]));
  }, [endpoint]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-500 text-xl leading-none">✕</button>
        </div>
        <p className="text-[11px] text-slate-500">
          Tu propia lista, con teléfono registrado. Cada botón abre TU WhatsApp con el mensaje ya escrito — tú lo revisas y lo mandas.
        </p>

        {!lista ? (
          <div className="text-center text-slate-500 py-10 text-sm">⏳ Cargando...</div>
        ) : lista.length === 0 ? (
          <div className="text-center text-slate-500 py-10 text-sm">Todavía no tienes a nadie con teléfono registrado para esto.</div>
        ) : (
          <div className="space-y-1.5">
            {lista.map((p) => (
              <div key={p.id} className={`flex items-center justify-between rounded-xl p-3 border ${enviados[p.id] ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                <div>
                  <div className="text-sm font-bold text-white">{p.nombre}</div>
                  <div className="text-[10px] text-slate-500">{p.seccion_numero ? `Sección ${p.seccion_numero}` : 'Sin sección'}</div>
                </div>
                <a href={`https://wa.me/52${String(p.telefono).replace(/\D/g, '')}?text=${encodeURIComponent(armarMensaje(p.nombre))}`}
                  target="_blank" rel="noreferrer"
                  onClick={() => setEnviados((e) => ({ ...e, [p.id]: true }))}
                  className={`px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0 ${enviados[p.id] ? 'bg-emerald-700/60 text-emerald-200' : 'bg-green-600 text-white'}`}>
                  {enviados[p.id] ? '✓ Enviado' : '📲 WhatsApp'}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 🆕 Banner de "tienes contenido nuevo" — aparece cuando el equipo
 * de redes subió una pieza (Marketing → Redes Sociales → "Enviar a
 * mis promotores"). Se recuerda en ESTE celular cuál fue la última
 * que ya viste, para que no te siga apareciendo la misma. */
function BannerPiezaNueva({ pieza, onCompartir, onEnviarWhatsApp, onDescartar }) {
  return (
    <div className="bg-gradient-to-br from-fuchsia-900 to-purple-900 rounded-2xl p-4 space-y-2 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-fuchsia-200 uppercase">📣 Contenido nuevo del equipo</span>
        <button onClick={onDescartar} className="text-fuchsia-300 text-lg leading-none">✕</button>
      </div>
      {pieza.imagen_url && <img src={pieza.imagen_url} alt="" className="w-full max-h-40 object-cover rounded-xl" />}
      <p className="text-sm text-white whitespace-pre-wrap">{pieza.texto}</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCompartir} className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">📤 Subir a mis redes</button>
        <button onClick={onEnviarWhatsApp} className="py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold">📲 Mandar a mi gente</button>
      </div>
    </div>
  );
}

/**
 * La ÚNICA pantalla que ve un promotor — nada de módulos sueltos,
 * nada de menús con cosas que no le tocan. Solo su propio avance y
 * el botón para seguir agregando gente. Todo lo demás (Día D si le
 * toca ser representante de casilla, Incidencias si necesita
 * reportar algo urgente) sigue accesible desde el menú, pero esta
 * es su pantalla de inicio.
 */
export default function PromotorHome() {
  const usuario = useAuth((s) => s.usuario);
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [mostrarRecordatorios, setMostrarRecordatorios] = useState(false);
  // 🆕 Pieza de contenido más reciente que subió el equipo de redes,
  // y si ya se descartó en ESTE celular (localStorage, por-persona,
  // nunca se manda al servidor).
  const [piezaPendiente, setPiezaPendiente] = useState(null);
  const [mostrarEnvioPieza, setMostrarEnvioPieza] = useState(false);
  useEffect(() => {
    api.get('/marketing/piezas/ultima').then((r) => {
      const pieza = r.data.data;
      if (!pieza) return;
      let vistaId = null;
      try { vistaId = localStorage.getItem('vototech_ultima_pieza_vista'); } catch (e) { /* modo privado / sin storage — no pasa nada, solo no se recuerda */ }
      if (String(pieza.id) !== vistaId) setPiezaPendiente(pieza);
    }).catch(() => {});
  }, []);
  const descartarPieza = () => {
    try { localStorage.setItem('vototech_ultima_pieza_vista', String(piezaPendiente.id)); } catch (e) { /* sin storage disponible, se ignora */ }
    setPiezaPendiente(null);
  };
  const compartirPieza = async () => {
    if (!navigator.share) { alert('Tu navegador no soporta el menú de compartir — copia el texto a mano.'); return; }
    try {
      const datos = { text: piezaPendiente.texto };
      if (piezaPendiente.imagen_url) {
        try {
          const resp = await fetch(piezaPendiente.imagen_url);
          const blob = await resp.blob();
          const archivo = new File([blob], 'contenido.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [archivo] })) datos.files = [archivo];
        } catch (e) { /* si no se puede traer la imagen, se comparte solo el texto */ }
      }
      await navigator.share(datos);
    } catch (e) { /* la persona canceló el menú de compartir */ }
  };
  // 🆕 "¿Qué necesitas hacer?" — antes solo había un botón grande de
  // "Agregar persona"; el resto de acciones (reportar algo, ver el
  // mapa, hablarle a tu coordinador) requerían salir a buscar el
  // módulo correcto en el menú, algo que un promotor sin experiencia
  // técnica no siempre encuentra solo.
  const [coordinador, setCoordinador] = useState(null);
  useEffect(() => { api.get('/estructura/mi-coordinador').then((r) => setCoordinador(r.data.data)).catch(() => {}); }, []);

  const cargar = () => api.get('/promovidos/mi-resumen').then((r) => setResumen(r.data.data)).catch(() => {});
  useEffect(cargar, []);

  if (!resumen) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-5 pt-4">
        <div className="text-center space-y-1">
          <div className="text-3xl">🗳️</div>
          <h1 className="text-xl font-black text-white">¡Vota por tu candidato!</h1>
          <p className="text-xs text-slate-500">Hola, {usuario?.nombre?.split(' ')[0]} — este es tu avance</p>
        </div>

        {piezaPendiente && (
          <BannerPiezaNueva
            pieza={piezaPendiente}
            onCompartir={compartirPieza}
            onEnviarWhatsApp={() => setMostrarEnvioPieza(true)}
            onDescartar={descartarPieza}
          />
        )}

        {/* 🆕 "¿Qué necesitas hacer?" — 4 botones grandes, directo a
            la acción, sin tener que navegar ningún menú. */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMostrarAgregar(true)}
            className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-4 text-center shadow-lg active:scale-95 transition-transform">
            <div className="text-3xl mb-1">➕</div>
            <div className="text-xs font-black text-white">Agregar persona</div>
          </button>
          <button onClick={() => navigate('/incidencias')}
            className="bg-gradient-to-br from-red-600 to-orange-600 rounded-2xl p-4 text-center shadow-lg active:scale-95 transition-transform">
            <div className="text-3xl mb-1">🚨</div>
            <div className="text-xs font-black text-white">Reportar algo</div>
          </button>
          {/* 🆕 Botón "Ver el mapa" quitado — el promotor ya no tiene
              acceso al Mapa (ver también RutaProtegida en App.jsx,
              que ahora bloquea /mapa para este rol aunque alguien
              intente entrar escribiendo la URL a mano). */}
          {/* 🆕 Recordatorio de voto — abre la lista propia de gente
              comprometida, con un botón de WhatsApp por persona. */}
          <button onClick={() => setMostrarRecordatorios(true)}
            className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-4 text-center shadow-lg active:scale-95 transition-transform">
            <div className="text-3xl mb-1">📲</div>
            <div className="text-xs font-black text-white">Recordar el voto</div>
          </button>
          {coordinador?.telefono ? (
            <a href={`https://wa.me/52${coordinador.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              className="bg-gradient-to-br from-sky-600 to-blue-600 rounded-2xl p-4 text-center shadow-lg active:scale-95 transition-transform">
              <div className="text-3xl mb-1">📞</div>
              <div className="text-xs font-black text-white">Hablarle a {coordinador.nombre?.split(' ')[0]}</div>
            </a>
          ) : (
            <div className="bg-slate-800/60 rounded-2xl p-4 text-center opacity-50">
              <div className="text-3xl mb-1">📞</div>
              <div className="text-xs font-black text-slate-400">Sin coordinador asignado</div>
            </div>
          )}
        </div>

        {/* Medidor grande hacia la meta mínima */}
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 text-center shadow-xl">
          <div className="text-5xl font-black text-white">{resumen.comprometidos}</div>
          <div className="text-xs text-indigo-200 mt-1">de tu meta mínima de {resumen.meta} personas que llevarás a votar</div>
          <div className="h-3 bg-black/30 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${resumen.porcentaje_meta}%` }} />
          </div>
          <div className="text-lg font-bold text-emerald-300 mt-2">{resumen.porcentaje_meta}%</div>
          {resumen.porcentaje_meta >= 100 && <div className="text-xs text-emerald-300 mt-1">🎉 ¡Ya cumpliste tu meta! Sigue sumando gente.</div>}
        </div>

        {/* Totales */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-white">{resumen.total}</div>
            <div className="text-[10px] text-slate-500">Personas registradas en total</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-400">{resumen.comprometidos}</div>
            <div className="text-[10px] text-slate-500">Comprometidas a votar</div>
          </div>
        </div>

        {/* Por sección */}
        {resumen.por_seccion.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Tu gente, por sección</div>
            {resumen.por_seccion.map((s) => (
              <div key={s.seccion} className="flex justify-between text-sm py-1">
                <span className="text-slate-300">{s.seccion !== 'sin sección' ? `Sección ${s.seccion}` : 'Sin sección'}</span>
                <span className="text-white font-bold">{s.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* Últimos registrados */}
        {resumen.ultimos.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Últimos que registraste</div>
            {resumen.ultimos.map((p) => (
              <div key={p.id} className="flex justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                <span className="text-slate-300">{p.nombre}</span>
                <span className={p.comprometido ? 'text-emerald-400' : 'text-slate-500'}>{p.comprometido ? '✅ Comprometido' : 'Por confirmar'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {mostrarAgregar && <ModalAgregar onCerrar={() => setMostrarAgregar(false)} onGuardado={() => { setMostrarAgregar(false); cargar(); }} />}
      {mostrarRecordatorios && (
        <ModalEnviarAMiGente
          titulo="📲 Recordar el voto"
          endpoint="/promovidos/mis-comprometidos"
          armarMensaje={(nombre) => `Hola ${nombre.split(' ')[0]} 👋 Te escribe ${usuario?.nombre?.split(' ')[0] || ''}. Te recuerdo que este es el día de la elección — ¡tu voto cuenta mucho! No olvides ir a votar hoy. ¡Contamos contigo! 🗳️💪`}
          onCerrar={() => setMostrarRecordatorios(false)}
        />
      )}
      {mostrarEnvioPieza && piezaPendiente && (
        <ModalEnviarAMiGente
          titulo="📲 Mandar a mi gente"
          endpoint="/promovidos/mis-contactos"
          armarMensaje={(nombre) => `Hola ${nombre.split(' ')[0]} 👋\n\n${piezaPendiente.texto}${piezaPendiente.imagen_url ? `\n\n${piezaPendiente.imagen_url}` : ''}`}
          onCerrar={() => setMostrarEnvioPieza(false)}
        />
      )}
    </div>
  );
}

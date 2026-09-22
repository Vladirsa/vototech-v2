import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';
import { guardarEnColaOffline } from '../lib/colaOffline';
import SubidaFotos from '../components/SubidaFotos';

const PARTIDOS = ['morena', 'pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac'];
// 🆕 Nombres completos de los partidos grandes — para "Avance en
// vivo" no basta con las siglas, se necesita que el candidato
// reconozca de un vistazo a quién le está viendo el número.
const PARTIDOS_NOMBRE = {
  morena: 'MORENA', pan: 'PAN — Acción Nacional', pri: 'PRI — Revolucionario Institucional',
  prd: 'PRD — Revolución Democrática', mc: 'Movimiento Ciudadano', pvem: 'Partido Verde (PVEM)',
  pt: 'PT — Partido del Trabajo', pac: 'PAC', rsp: 'RSP', fxm: 'Fuerza x México', panalt: 'Panal',
  somos: 'SOMOS', paz: 'Partido PAZ',
};
const nombrePartido = (codigo) => PARTIDOS_NOMBRE[codigo] || codigo.toUpperCase();
// Roles que pueden ver "Avance en vivo" — el conteo agregado de TODA
// la campaña en tiempo real es lo más sensible que existe en Día D.
const ROLES_AVANCE_EN_VIVO = ['candidato', 'jefe_campana', 'coord_general'];
const ROLES_ALTOS = ['candidato', 'jefe_campana', 'coord_general'];
// Quien va a su propia casilla a capturar no necesita ver el avance
// de TODA la campaña — eso lo distrae y no le sirve para su tarea.
// Prep y Conteo rápido son vistas de mando, no de campo.
const ROLES_VISTA_SIMPLE = ['promotor', 'coord_seccional'];

/** Captura rápida: foto primero, números mientras se sube en segundo plano. */
function FormularioCaptura({ onGuardado, bloqueada }) {
  const [seccion, setSeccion] = useState('');
  const [casilla, setCasilla] = useState('B');
  const [votos, setVotos] = useState({});
  const [nulos, setNulos] = useState(0);
  const [resultadoId, setResultadoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [leyendoActa, setLeyendoActa] = useState(false);
  const [avisoOCR, setAvisoOCR] = useState(null);
  const inputOCR = useRef(null);

  const leerActaConIA = async (archivo) => {
    if (!archivo) return;
    setLeyendoActa(true);
    setAvisoOCR(null);
    try {
      const formData = new FormData();
      formData.append('foto', archivo);
      const { data } = await api.post('/ia/leer-acta', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      // SOLO se sugiere — nunca se guarda automático. La persona ve
      // los números pre-llenados y debe revisarlos antes de guardar,
      // exactamente como si los hubiera tecleado ella misma.
      setVotos((v) => ({ ...v, ...data.data.votos }));
      setNulos(data.data.nulos || 0);
      setAvisoOCR({ confianza: data.data.confianza, advertencia: data.data.advertencia });
    } catch (e) {
      setAvisoOCR({ confianza: 'baja', advertencia: e.response?.data?.error || 'No se pudo leer el acta, captúralo a mano.' });
    }
    setLeyendoActa(false);
    if (inputOCR.current) inputOCR.current.value = '';
  };

  const guardar = async (soloIniciar = false) => {
    if (!seccion) return;
    setGuardando(true); setError('');
    const datos = { seccion_numero: parseInt(seccion), casilla, votos, nulos };
    try {
      const { data } = await api.post('/dia-eleccion/resultados', datos);
      setResultadoId(data.data.id);
      if (!soloIniciar) {
        setSeccion(''); setCasilla('B'); setVotos({}); setNulos(0); setResultadoId(null);
        onGuardado();
      }
    } catch (e) {
      if (!e.response) {
        // Esto es EXACTAMENTE el caso que más importa proteger: un
        // representante en una comunidad sin señal, con el resultado
        // de su casilla ya capturado. No se pierde — se guarda local
        // y se manda solo en cuanto haya conexión.
        await guardarEnColaOffline('resultado_casilla', '/dia-eleccion/resultados', datos);
        setError('');
        alert('📡 Sin señal — el resultado se guardó en este celular y se transmitirá automáticamente en cuanto haya conexión. No lo pierdas de vista hasta confirmar que se envió.');
        if (!soloIniciar) { setSeccion(''); setCasilla('B'); setVotos({}); setNulos(0); setResultadoId(null); onGuardado(); }
      } else {
        setError(e.response?.data?.error || 'Error al guardar');
      }
    }
    setGuardando(false);
  };

  if (bloqueada) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center text-sm text-red-300">
        🔒 La captura está cerrada. Solo el candidato o jefe de campaña pueden seguir editando resultados.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-bold text-white">📝 Capturar resultado de casilla</h2>
      {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <input type="number" placeholder="Sección" value={seccion} onChange={(e) => setSeccion(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Casilla" value={casilla} onChange={(e) => setCasilla(e.target.value)}
          className="w-24 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      </div>

      {/* Foto primero — lo más rápido posible, se sube mientras se llenan los números */}
      {!resultadoId ? (
        <button onClick={() => guardar(true)} disabled={!seccion || guardando}
          className="w-full py-3 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
          📷 Iniciar captura y tomar foto del acta
        </button>
      ) : (
        <SubidaFotos contexto="acta" referenciaId={resultadoId} maximo={3} />
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => inputOCR.current?.click()} disabled={leyendoActa}
          className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-3 py-2 rounded-lg disabled:opacity-50 flex-1">
          {leyendoActa ? '🔍 Leyendo el acta...' : '📸 Leer números con IA (solo sugerencia, tú confirmas)'}
        </button>
        <input ref={inputOCR} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => leerActaConIA(e.target.files[0])} />
      </div>
      {avisoOCR && (
        <div className={`text-[10px] rounded-lg px-3 py-2 ${avisoOCR.confianza === 'alta' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {avisoOCR.confianza === 'alta' ? '✅ Lectura clara' : `⚠️ Confianza ${avisoOCR.confianza}`} — revisa los números abajo antes de guardar, la IA se puede equivocar.
          {avisoOCR.advertencia && <div className="mt-1">{avisoOCR.advertencia}</div>}
        </div>
      )}

      {/* 🆕 Nombres de partido más grandes y con más contraste — antes
          eran solo siglas en texto diminuto (9px) y gris apagado,
          difíciles de distinguir de un vistazo mientras se captura
          rápido en la casilla. Ahora son más grandes, en blanco y
          negritas, del mismo tamaño que usa "Avance en vivo". */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {PARTIDOS.map((p) => (
          <div key={p}>
            <label className="text-xs text-white uppercase font-extrabold block mb-0.5">{p}</label>
            <input type="number" min={0} value={votos[p] || ''} onChange={(e) => setVotos({ ...votos, [p]: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-700 text-white text-base font-bold" />
          </div>
        ))}
      </div>
      <div>
        <label className="text-[9px] text-slate-500 uppercase font-bold">Nulos</label>
        <input type="number" min={0} value={nulos} onChange={(e) => setNulos(parseInt(e.target.value) || 0)}
          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-sm" />
      </div>
      <button onClick={() => guardar(false)} disabled={guardando || !seccion}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold disabled:opacity-40">
        {guardando ? '⏳ Enviando...' : '📡 Transmitir resultado en vivo'}
      </button>
    </div>
  );
}

function PanelPrep({ prep }) {
  if (!prep) return null;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-bold text-white">✅ Preparación para el día D</h2>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center bg-slate-800/50 rounded-lg p-2">
          <div className="text-lg font-black text-white">{prep.total_casillas}</div>
          <div className="text-[9px] text-slate-500">Casillas registradas</div>
        </div>
        <div className={`text-center rounded-lg p-2 ${prep.sin_representante > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <div className={`text-lg font-black ${prep.sin_representante > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{prep.con_representante}/{prep.total_casillas}</div>
          <div className="text-[9px] text-slate-500">Con representante</div>
        </div>
        <div className={`text-center rounded-lg p-2 ${prep.confirmadas_asistencia < prep.total_casillas ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
          <div className={`text-lg font-black ${prep.confirmadas_asistencia < prep.total_casillas ? 'text-amber-400' : 'text-emerald-400'}`}>{prep.confirmadas_asistencia}/{prep.total_casillas}</div>
          <div className="text-[9px] text-slate-500">Confirmaron asistencia</div>
        </div>
      </div>
      {prep.listo ? (
        <div className="text-xs text-emerald-400 text-center">🎉 Todo listo para el día de la elección</div>
      ) : (
        <div className="text-xs text-amber-400 text-center">⚠️ Aún faltan cosas por cerrar antes del día D</div>
      )}
    </div>
  );
}

export default function DiaEleccion() {
  const usuario = useAuth((s) => s.usuario);
  const esAltoMando = ROLES_ALTOS.includes(usuario?.rol);
  // 🆕 "Avance en vivo" solo lo puede ver el Candidato y "el
  // coordinador" (Jefe de Campaña o Coordinador General) — es el
  // conteo agregado de TODA la campaña en tiempo real, el dato más
  // sensible del día de la elección.
  const puedeVerAvanceEnVivo = ROLES_AVANCE_EN_VIVO.includes(usuario?.rol);
  const vistaSimple = ROLES_VISTA_SIMPLE.includes(usuario?.rol);
  const [tab, setTab] = useState('captura');
  const [resultados, setResultados] = useState([]);
  const [caceria, setCaceria] = useState([]);
  const [prep, setPrep] = useState(null);
  const [conteoRapido, setConteoRapido] = useState(null);
  const [avanceEstructura, setAvanceEstructura] = useState(null);
  const [avancePorSeccion, setAvancePorSeccion] = useState(null);
  const [alertasSinReportar, setAlertasSinReportar] = useState([]);
  const [capturaCerrada, setCapturaCerrada] = useState(false);
  const [esDemo, setEsDemo] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [mensajeSimulacion, setMensajeSimulacion] = useState('');
  // 🆕 Notificaciones de "qué casilla acaba de subir" — se llenan al
  // cargar (últimos reportes reales) y se van empujando en vivo cada
  // que llega un resultado nuevo por socket.
  const [notificaciones, setNotificaciones] = useState([]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  // 🆕 "hace Xs" que se recalcula solo, sin esperar a que llegue un
  // resultado nuevo — así "🔴 EN VIVO" se ve realmente vivo.
  const [, forzarTick] = useState(0);

  const cargarConteo = () => {
    api.get('/dia-eleccion/conteo-rapido').then((r) => { setConteoRapido(r.data.data); setUltimaActualizacion(new Date()); });
  };

  const cargarTodo = () => {
    api.get('/dia-eleccion/resultados').then((r) => setResultados(r.data.data));
    api.get('/dia-eleccion/caceria').then((r) => setCaceria(r.data.data));
    api.get('/dia-eleccion/prep').then((r) => { setPrep(r.data.data); setCapturaCerrada(r.data.data.captura_cerrada); });
    cargarConteo();
    api.get('/dia-eleccion/alertas-sin-reportar').then((r) => setAlertasSinReportar(r.data.data));
    if (puedeVerAvanceEnVivo) api.get('/dia-eleccion/ultimos-reportes').then((r) => setNotificaciones(r.data.data)).catch(() => {});
    if (!vistaSimple) api.get('/dia-eleccion/avance-estructura').then((r) => setAvanceEstructura(r.data.data)).catch(() => {});
    if (!vistaSimple) api.get('/dia-eleccion/avance-por-seccion').then((r) => setAvancePorSeccion(r.data.data)).catch(() => {});
    api.get('/auth/mi-campana').then((r) => setEsDemo(r.data.data.es_demo)).catch(() => {});
  };
  useEffect(cargarTodo, []);

  // 🆕 Llenado minuto a minuto — de respaldo, por si algún evento del
  // socket no llegó (red inestable en una casilla real). El socket
  // sigue siendo lo primero (instantáneo); esto es la red de
  // seguridad para que "Avance en vivo" nunca se quede pasmado.
  useEffect(() => {
    if (tab !== 'conteo' || !puedeVerAvanceEnVivo) return;
    const intervalo = setInterval(cargarConteo, 60000);
    return () => clearInterval(intervalo);
  }, [tab, puedeVerAvanceEnVivo]);

  // 🆕 Refresca el "hace Xs" cada 5 segundos, sin volver a pedir nada
  // al servidor — solo para que el reloj de "🔴 EN VIVO" se sienta vivo.
  useEffect(() => {
    if (tab !== 'conteo') return;
    const t = setInterval(() => forzarTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [tab]);

  const iniciarSimulacion = async () => {
    setSimulando(true);
    try {
      const { data } = await api.post('/dia-eleccion/simular-eleccion');
      setMensajeSimulacion(data.mensaje);
    } catch (e) { setMensajeSimulacion(e.response?.data?.error || 'Error al iniciar la simulación'); }
    setSimulando(false);
  };

  const reiniciarSimulacion = async () => {
    if (!confirm('¿Borrar todos los resultados capturados y empezar de cero?')) return;
    await api.post('/dia-eleccion/reiniciar-simulacion');
    setMensajeSimulacion('Resultados borrados — listo para simular de nuevo.');
    cargarTodo();
  };

  // Si por lo que sea el tab queda apuntando a 'prep' o 'conteo' para
  // alguien con vista simple (ej. cambió de rol sin recargar), lo
  // regresa a Captura — nunca debe quedarse mostrando una pantalla
  // que ya no le toca ver.
  useEffect(() => {
    if (!esAltoMando && tab === 'prep') setTab('captura');
    if (!puedeVerAvanceEnVivo && tab === 'conteo') setTab('captura');
  }, [esAltoMando, puedeVerAvanceEnVivo, tab]);

  useSocket({
    resultado_actualizado: (p) => {
      cargarTodo();
      // 🆕 Notificación en vivo de qué casilla acaba de reportar —
      // solo para quien puede ver Avance en Vivo (mismo dato sensible).
      if (puedeVerAvanceEnVivo && p && !p.reinicio) {
        setNotificaciones((prev) => [
          { id: p.id, seccion_numero: p.seccion_numero, casilla: p.casilla, capturado_por_nombre: p.capturado_por_nombre, capturado_en: p.capturado_en || new Date().toISOString() },
          ...prev.filter((n) => n.id !== p.id),
        ].slice(0, 10));
      }
    },
    voto_confirmado: (p) => {
      setCaceria((prev) => prev.filter((c) => c.id !== p.id));
      // 🆕 Antes solo se actualizaba la lista de Cacería — el panel
      // de "avance por sección" se quedaba desactualizado hasta la
      // siguiente vez que se recargara toda la página.
      if (!vistaSimple) api.get('/dia-eleccion/avance-por-seccion').then((r) => setAvancePorSeccion(r.data.data)).catch(() => {});
    },
    captura_estado_cambio: (d) => setCapturaCerrada(d.cerrada),
  });

  const marcarVoto = async (id) => {
    // 🆕 Se quita de la lista al momento, sin esperar respuesta del
    // servidor — así el promotor ve el efecto de inmediato incluso
    // sin señal, en vez de seguir viendo a alguien que ya marcó.
    setCaceria((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.patch(`/dia-eleccion/caceria/${id}/voto`);
    } catch (e) {
      if (!e.response) {
        // 🆕 Sin señal real — se guarda para mandarlo solo después,
        // igual que ya protege a Día D (resultados) e Incidencias.
        await guardarEnColaOffline('voto_confirmado', `/dia-eleccion/caceria/${id}/voto`, {}, 'patch');
      }
      // Si el error SÍ tiene respuesta del servidor (raro para esta
      // acción tan simple), no se hace nada más — ya se quitó de la
      // lista local, y no vale la pena estorbar con un aviso aquí.
    }
  };

  const toggleCierre = async () => {
    const { data } = await api.post('/dia-eleccion/cerrar-captura', { cerrar: !capturaCerrada });
    setCapturaCerrada(data.cerrada);
  };

  const reportarPanico = async () => {
    const descripcion = prompt('¿Qué está pasando? (se reporta como urgente de inmediato)');
    if (!descripcion) return;
    await api.post('/incidencias', { tipo: 'irregularidad', urgencia: 'urgente', descripcion: `🚨 BOTÓN DE PÁNICO: ${descripcion}` });
    alert('✅ Reportado como urgente — tu equipo ya lo está viendo');
  };

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-end">
          <button onClick={reportarPanico} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold animate-pulse">🚨 Pánico</button>
        </div>

        {esAltoMando && (
          <button onClick={toggleCierre} className={`w-full py-2 rounded-lg text-xs font-bold ${capturaCerrada ? 'bg-red-600/80 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {capturaCerrada ? '🔒 Captura CERRADA — toca para reabrir' : '🔓 Captura abierta — toca para cerrar'}
          </button>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('captura')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'captura' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📝 Captura</button>
          <button onClick={() => setTab('caceria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'caceria' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Cacería ({caceria.length})</button>
          {/* 🆕 Prep y Avance en vivo — antes visibles para casi
              cualquier rol con acceso a Día D (incluido un
              representante de una sola casilla). Esos paneles
              muestran quién está asignado en TODAS las casillas —
              información sensible de estructura — así que ahora solo
              se ven para Candidato/Jefe de Campaña/Coord. General. */}
          {esAltoMando && (
            <button onClick={() => setTab('prep')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'prep' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Prep</button>
          )}
          {puedeVerAvanceEnVivo && (
            <button onClick={() => setTab('conteo')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'conteo' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📊 Avance en vivo</button>
          )}
        </div>

        {tab === 'captura' && (
          <div className="space-y-3">
            <FormularioCaptura onGuardado={cargarTodo} bloqueada={capturaCerrada && !esAltoMando} />
            <div className="space-y-2">
              {resultados.map((r) => (
                <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-white">Sección {r.seccion_numero} · Casilla {r.casilla}</span>
                    <span className="text-slate-500">{r.capturado_por_nombre}</span>
                  </div>
                  <div className="text-slate-400 mt-1">{Object.entries(r.votos).map(([p, v]) => `${p.toUpperCase()}: ${v}`).join(' · ')}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'prep' && esAltoMando && (
          <div className="space-y-3">
            {esDemo && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold text-purple-300">🤖 Simulador de elección (solo demo)</div>
                <p className="text-[10px] text-slate-400">
                  Genera resultados realistas para todas las casillas pendientes, con 53% de participación del padrón,
                  basados en el histórico real de cada sección — y los va transmitiendo poco a poco (como una noche
                  de elección real), para que veas la pantalla de "Avance en vivo" funcionando de verdad.
                </p>
                {mensajeSimulacion && <div className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded-lg px-2 py-1.5">{mensajeSimulacion}</div>}
                <div className="flex gap-2">
                  <button onClick={iniciarSimulacion} disabled={simulando}
                    className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white text-xs font-bold disabled:opacity-50">
                    {simulando ? '⏳ Iniciando...' : '▶️ Simular elección completa'}
                  </button>
                  <button onClick={reiniciarSimulacion} className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">↻ Reiniciar</button>
                </div>
              </div>
            )}
            <PanelPrep prep={prep} />
            <p className="text-[10px] text-slate-500">🗳️ La gestión de casillas (representantes, suplentes, ubicación) se movió a <strong>Estructura</strong> — es información sensible del equipo, y ahí solo la ven Candidato, Jefe de Campaña y Coord. General.</p>
          </div>
        )}

        {tab === 'caceria' && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500">Comprometidos que aún no confirman haber votado. Márcalos si los ves pasar por la fila, o mándales el enlace de confirmación por WhatsApp.</p>
            {caceria.length === 0 ? (
              <div className="text-center text-emerald-400 text-sm py-8">🎉 Todos tus comprometidos ya votaron</div>
            ) : caceria.map((c) => (
              <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{c.nombre}</div>
                  <div className="text-[10px] text-slate-500">Sección {c.seccion_numero}{c.telefono && ` · ${c.telefono}`}</div>
                </div>
                <div className="flex gap-1.5">
                  {c.telefono && (
                    <a href={`https://wa.me/52${c.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola ${c.nombre}! ¿Ya fuiste a votar hoy? Confírmanos aquí: ${window.location.origin}/votar/${c.id}`)}`}
                      target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg bg-emerald-700/50 text-emerald-300 text-xs font-bold">📲</a>
                  )}
                  <button onClick={() => marcarVoto(c.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">✅ Ya votó</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'conteo' && puedeVerAvanceEnVivo && conteoRapido && (
          <div className="space-y-3">
            {/* 🆕 Indicador "EN VIVO" — se actualiza solo cada minuto
                (respaldo del socket), y el reloj de "hace Xs" corre
                aunque no llegue ningún resultado nuevo. */}
            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-bold text-red-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> EN VIVO — se actualiza solo
              </span>
              <span className="text-[9px] text-slate-500">
                {ultimaActualizacion ? `Hace ${Math.max(0, Math.round((Date.now() - ultimaActualizacion.getTime()) / 1000))}s` : '—'}
              </span>
            </div>

            {/* Medidor grande de avance — lo primero que se ve */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-800/30 rounded-2xl p-5 text-center">
              <div className="text-4xl font-black text-white">{conteoRapido.porcentaje_reportado}%</div>
              <div className="text-xs text-slate-400 mt-1">{conteoRapido.casillas_reportadas} de {conteoRapido.casillas_esperadas} casillas han reportado</div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden mt-3">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${conteoRapido.porcentaje_reportado}%` }} />
              </div>
              {conteoRapido.participacion_pct != null && (
                <div className="text-[10px] text-slate-500 mt-2">Participación estimada: {conteoRapido.participacion_pct}%</div>
              )}
            </div>

            {/* 🆕 Estadísticos del conteo — ritmo, margen y proyección.
                Todo calculado sobre casillas YA capturadas, nunca una
                encuesta ni una suposición de quién va ganando. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">{conteoRapido.ritmo_casillas_por_hora ?? '—'}</div>
                <div className="text-[9px] text-slate-500">Casillas/hora (ritmo real)</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">
                  {conteoRapido.proyeccion_minutos_restantes != null ? `~${conteoRapido.proyeccion_minutos_restantes} min` : '—'}
                </div>
                <div className="text-[9px] text-slate-500">Para terminar de reportar</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">{conteoRapido.promedio_votos_por_casilla ?? '—'}</div>
                <div className="text-[9px] text-slate-500">Votos promedio por casilla</div>
              </div>
              {conteoRapido.margen_1_2 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-emerald-400">{conteoRapido.margen_1_2.diferencia_pct}%</div>
                  <div className="text-[9px] text-slate-500">Margen {nombrePartido(conteoRapido.margen_1_2.partido_1)} vs {nombrePartido(conteoRapido.margen_1_2.partido_2)}</div>
                </div>
              )}
            </div>

            {/* 🆕 Notificaciones — qué casilla acaba de subir, en vivo */}
            {notificaciones.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2">📡 Últimas casillas en transmitir</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {notificaciones.map((n) => (
                    <div key={n.id} className="flex items-center justify-between text-[11px] bg-slate-800/40 rounded-lg px-2.5 py-1.5">
                      <span className="text-slate-300">📥 Sección {n.seccion_numero} ({n.casilla}) <span className="text-slate-500">— {n.capturado_por_nombre}</span></span>
                      <span className="text-slate-500 flex-shrink-0 ml-2">{new Date(n.capturado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Votos por partido — barras horizontales, el líder resaltado */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">🗳️ Suma de votos en vivo</div>
              {Object.entries(conteoRapido.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, v], i) => {
                const pct = conteoRapido.total_votos > 0 ? Math.round(v / conteoRapido.total_votos * 100) : 0;
                return (
                  <div key={p}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className={`font-extrabold ${i === 0 ? 'text-white' : 'text-slate-200'}`}>{i === 0 && '👑 '}{nombrePartido(p)}</span>
                      <span className="text-slate-300 font-bold">{v.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${i === 0 ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Avance por representante — QUIÉN falta, no solo cuánto falta */}
            {avanceEstructura && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-3">👥 Avance por tu estructura ({avanceEstructura.reportaron}/{avanceEstructura.total})</div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {avanceEstructura.casillas.map((c, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${c.ya_reporto ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <div>
                        <span className="font-bold text-white">Sección {c.seccion_numero}</span>
                        <span className="text-slate-500"> ({c.casilla_letra}) — {c.representante_nombre || 'sin asignar'}</span>
                      </div>
                      {c.ya_reporto ? (
                        <span className="text-emerald-400 font-bold flex-shrink-0">✅ {new Date(c.hora_reporte).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                      ) : c.representante_telefono ? (
                        <a href={`https://wa.me/52${c.representante_telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-amber-400 font-bold flex-shrink-0">⏳ Recordar 📲</a>
                      ) : (
                        <span className="text-amber-400 font-bold flex-shrink-0">⏳ Pendiente</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 🆕 Avance por sección — cuántos de tus comprometidos ya
                confirmaron su voto, y si ya hay acta capturada ahí,
                si tu partido va ganando en ESA sección. Nunca infiere
                por quién votó nadie — "ya votaron" es solo asistencia
                confirmada de tu propia gente, y "va ganando" viene
                solo de actas reales ya capturadas. */}
            {avancePorSeccion && avancePorSeccion.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">🗳️ Avance de voto por sección</div>
                <p className="text-[9px] text-slate-500 mb-3">"Ya votaron" = comprometidos tuyos que confirmaron asistencia. "Ganando/perdiendo" solo aparece cuando ya hay un acta real capturada de esa sección — nunca es una suposición.</p>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {avancePorSeccion.map((s) => (
                    <div key={s.seccion_numero} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs bg-slate-800/40">
                      <div className="flex-1">
                        <span className="font-bold text-white">Sección {s.seccion_numero}</span>
                        <span className="text-slate-500"> — {s.ya_votaron}/{s.comprometidos_base} comprometidos ya votaron ({s.porcentaje_asistencia}%)</span>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1 w-full max-w-[200px]">
                          <div className="h-full bg-indigo-500" style={{ width: `${s.porcentaje_asistencia}%` }} />
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        {s.va_ganando === null && <span className="text-[9px] text-slate-500">Sin acta todavía</span>}
                        {s.va_ganando === true && <span className="text-emerald-400 font-bold text-[10px]">📈 Vamos ganando</span>}
                        {s.va_ganando === false && <span className="text-red-400 font-bold text-[10px]">📉 Vamos perdiendo</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🆕 Movido hasta abajo — antes aparecía arriba de todo,
            empujando hacia abajo lo que la mayoría de la gente
            necesita ver primero (Captura, Cacería). Sigue siendo
            visible, solo que ya no interrumpe lo principal. */}
        {alertasSinReportar.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="text-[10px] font-bold text-amber-300 mb-1">⚠️ Casillas confirmadas sin reportar todavía</div>
            {alertasSinReportar.map((a) => (
              <div key={a.id} className="text-[10px] text-slate-300">Sección {a.seccion_numero} ({a.casilla_numero}) — {a.representante_nombre || 'sin asignar'}</div>
            ))}
          </div>
        )}
    </div>
  );
}

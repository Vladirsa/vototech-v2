import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';
import { guardarEnColaOffline } from '../lib/colaOffline';
import SubidaFotos from '../components/SubidaFotos';

const PARTIDOS = ['morena', 'pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac'];
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

      <div className="grid grid-cols-4 gap-2">
        {PARTIDOS.map((p) => (
          <div key={p}>
            <label className="text-[9px] text-slate-500 uppercase font-bold">{p}</label>
            <input type="number" min={0} value={votos[p] || ''} onChange={(e) => setVotos({ ...votos, [p]: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-sm" />
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

/**
 * 🆕 Panel de casillas sugeridas — cuántas le tocan a cada sección
 * según la regla oficial del INE (1 por cada 750 electores o
 * fracción), comparado contra las que ya diste de alta. Con un botón
 * genera las que faltan, listas para asignarles representante.
 */
function PanelCasillasSugeridas() {
  const [datos, setDatos] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [generando, setGenerando] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [casillasReales, setCasillasReales] = useState([]);
  const [seccionExpandida, setSeccionExpandida] = useState(null);

  const cargar = () => {
    api.get('/dia-eleccion/casillas-sugeridas').then((r) => { setDatos(r.data.data); setResumen(r.data.resumen); });
    api.get('/dia-eleccion/casillas').then((r) => setCasillasReales(r.data.data));
  };
  useEffect(() => {
    cargar();
    api.get('/estructura').then((r) => setEquipo(r.data.data)).catch(() => setEquipo([]));
  }, []);

  const generarCasillas = async (seccion) => {
    setGenerando(seccion);
    try {
      const { data } = await api.post(`/dia-eleccion/casillas-sugeridas/${seccion}/generar`);
      cargar();
      setSeccionExpandida(seccion);
    } catch (e) { alert(e.response?.data?.error || 'No se pudo generar'); }
    setGenerando(null);
  };

  const asignarRepresentante = async (seccion, numeroCasilla, representanteId) => {
    // 🆕 null expl\u00edcito para poder QUITAR al representante también,
    // no solo asignarlo (antes, elegir "Sin representante" no
    // guardaba nada porque mandaba undefined, que el backend ignora).
    await api.post('/dia-eleccion/casillas', { seccion_numero: seccion, numero: numeroCasilla, representante_id: representanteId || null });
    cargar();
  };
  const asignarSuplente = async (seccion, numeroCasilla, suplenteId) => {
    await api.post('/dia-eleccion/casillas', { seccion_numero: seccion, numero: numeroCasilla, suplente_id: suplenteId || null });
    cargar();
  };

  if (!datos) return <div className="text-center text-slate-500 text-xs py-6">⏳ Calculando casillas por sección...</div>;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-white">🗳️ Casillas por sección (según regla del INE)</h2>
        <p className="text-[9px] text-slate-500 mt-0.5">1 casilla por cada 750 electores o fracción (Art. 253, 258 y 284 LGIPE) — así puedes ir asignando representantes antes de que el INE publique su listado oficial.</p>
      </div>
      {resumen && (
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-slate-800/50 rounded-lg p-2">
            <div className="text-lg font-black text-white">{resumen.total_casillas_sugeridas}</div>
            <div className="text-[9px] text-slate-500">Casillas que te tocan</div>
          </div>
          <div className="text-center bg-emerald-500/10 rounded-lg p-2">
            <div className="text-lg font-black text-emerald-400">{resumen.total_casillas_registradas}</div>
            <div className="text-[9px] text-slate-500">Ya registradas</div>
          </div>
          <div className={`text-center rounded-lg p-2 ${resumen.total_faltantes > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            <div className={`text-lg font-black ${resumen.total_faltantes > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{resumen.total_faltantes}</div>
            <div className="text-[9px] text-slate-500">Faltan por dar de alta</div>
          </div>
        </div>
      )}
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {datos.map((s) => {
          const casillasDeEstaSeccion = casillasReales.filter((c) => c.seccion_numero === s.seccion);
          return (
            <div key={s.seccion} className="bg-slate-800/40 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <button onClick={() => setSeccionExpandida(seccionExpandida === s.seccion ? null : s.seccion)} className="flex-1 text-left">
                  <div className="text-xs font-bold text-white">Sección {String(s.seccion).padStart(3, '0')} <span className="text-slate-500 font-normal">· {s.municipio}</span></div>
                  <div className="text-[9px] text-slate-500">{s.lista_nominal.toLocaleString()} electores · {s.casillas_sugeridas} casilla(s) necesaria(s)</div>
                </button>
                {s.faltantes > 0 ? (
                  <button onClick={() => generarCasillas(s.seccion)} disabled={generando === s.seccion}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-50 flex-shrink-0">
                    {generando === s.seccion ? '⏳' : `+ Generar ${s.faltantes}`}
                  </button>
                ) : (
                  <span className="text-[9px] text-emerald-400 font-bold flex-shrink-0">✅ Completo</span>
                )}
              </div>
              {seccionExpandida === s.seccion && casillasDeEstaSeccion.length > 0 && (
                <div className="px-3 pb-2 space-y-2 border-t border-slate-700/50 pt-2">
                  {casillasDeEstaSeccion.map((c) => (
                    <div key={c.id} className="bg-slate-900/40 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-300 font-bold">Casilla {c.numero}</span>
                        {c.personas_esperadas && <span className="text-[9px] text-slate-500">👥 ~{c.personas_esperadas.toLocaleString()} personas</span>}
                        {c.confirmado_asistencia && <span className="text-[9px] text-emerald-400">✅ Confirmado</span>}
                      </div>
                      <select value={c.representante_id || ''} onChange={(e) => asignarRepresentante(s.seccion, c.numero, e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[10px]">
                        <option value="">👤 Sin representante asignado</option>
                        {equipo.map((u) => <option key={u.id} value={u.id}>👤 {u.nombre}</option>)}
                      </select>
                      {/* 🆕 Suplente — igual de importante, para que la
                          casilla no se quede sin cubrir si el
                          representante titular no puede llegar. */}
                      <select value={c.suplente_id || ''} onChange={(e) => asignarSuplente(s.seccion, c.numero, e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[10px]">
                        <option value="">🔁 Sin suplente asignado</option>
                        {equipo.map((u) => <option key={u.id} value={u.id}>🔁 {u.nombre}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  const vistaSimple = ROLES_VISTA_SIMPLE.includes(usuario?.rol);
  const [tab, setTab] = useState('captura');
  const [resultados, setResultados] = useState([]);
  const [caceria, setCaceria] = useState([]);
  const [prep, setPrep] = useState(null);
  const [conteoRapido, setConteoRapido] = useState(null);
  const [avanceEstructura, setAvanceEstructura] = useState(null);
  const [alertasSinReportar, setAlertasSinReportar] = useState([]);
  const [capturaCerrada, setCapturaCerrada] = useState(false);
  const [esDemo, setEsDemo] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [mensajeSimulacion, setMensajeSimulacion] = useState('');

  const cargarTodo = () => {
    api.get('/dia-eleccion/resultados').then((r) => setResultados(r.data.data));
    api.get('/dia-eleccion/caceria').then((r) => setCaceria(r.data.data));
    api.get('/dia-eleccion/prep').then((r) => { setPrep(r.data.data); setCapturaCerrada(r.data.data.captura_cerrada); });
    api.get('/dia-eleccion/conteo-rapido').then((r) => setConteoRapido(r.data.data));
    api.get('/dia-eleccion/alertas-sin-reportar').then((r) => setAlertasSinReportar(r.data.data));
    if (!vistaSimple) api.get('/dia-eleccion/avance-estructura').then((r) => setAvanceEstructura(r.data.data)).catch(() => {});
    api.get('/auth/mi-campana').then((r) => setEsDemo(r.data.data.es_demo)).catch(() => {});
  };
  useEffect(cargarTodo, []);

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
    if (vistaSimple && (tab === 'prep' || tab === 'conteo')) setTab('captura');
  }, [vistaSimple, tab]);

  useSocket({
    resultado_actualizado: () => cargarTodo(),
    voto_confirmado: (p) => setCaceria((prev) => prev.filter((c) => c.id !== p.id)),
    captura_estado_cambio: (d) => setCapturaCerrada(d.cerrada),
  });

  const marcarVoto = async (id) => { await api.patch(`/dia-eleccion/caceria/${id}/voto`); };

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
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🗳️ Día de la Elección</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={reportarPanico} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold animate-pulse">🚨 Pánico</button>
        </div>

        {esAltoMando && (
          <button onClick={toggleCierre} className={`w-full py-2 rounded-lg text-xs font-bold ${capturaCerrada ? 'bg-red-600/80 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {capturaCerrada ? '🔒 Captura CERRADA — toca para reabrir' : '🔓 Captura abierta — toca para cerrar'}
          </button>
        )}

        {alertasSinReportar.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="text-[10px] font-bold text-amber-300 mb-1">⚠️ Casillas confirmadas sin reportar todavía</div>
            {alertasSinReportar.map((a) => (
              <div key={a.id} className="text-[10px] text-slate-300">Sección {a.seccion_numero} ({a.casilla_numero}) — {a.representante_nombre || 'sin asignar'}</div>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('captura')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'captura' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📝 Captura</button>
          <button onClick={() => setTab('caceria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'caceria' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Cacería ({caceria.length})</button>
          {!vistaSimple && (
            <>
              <button onClick={() => setTab('prep')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'prep' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Prep</button>
              <button onClick={() => setTab('conteo')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'conteo' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📊 Avance en vivo</button>
            </>
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

        {tab === 'prep' && (
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
            <PanelCasillasSugeridas />
            <p className="text-[10px] text-slate-500">¿Necesitas moverla de lugar en el mapa? Usa el botón ➕ en el Mapa Electoral (tipo "Ubicación de casilla") para marcar su punto exacto.</p>
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

        {tab === 'conteo' && conteoRapido && (
          <div className="space-y-3">
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

            {/* Votos por partido — barras horizontales, el líder resaltado */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">🗳️ Suma de votos en vivo</div>
              {Object.entries(conteoRapido.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, v], i) => {
                const pct = conteoRapido.total_votos > 0 ? Math.round(v / conteoRapido.total_votos * 100) : 0;
                return (
                  <div key={p}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={`font-bold ${i === 0 ? 'text-white' : 'text-slate-400'}`}>{i === 0 && '👑 '}{p.toUpperCase()}</span>
                      <span className="text-slate-300">{v.toLocaleString()} ({pct}%)</span>
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
          </div>
        )}
      </div>
    </div>
  );
}

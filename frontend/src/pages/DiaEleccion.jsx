import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useAuth } from '../lib/authStore';
import SubidaFotos from '../components/SubidaFotos';

const PARTIDOS = ['morena', 'pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac'];
const ROLES_ALTOS = ['candidato', 'jefe_campana', 'coord_general'];

/** Captura rápida: foto primero, números mientras se sube en segundo plano. */
function FormularioCaptura({ onGuardado, bloqueada }) {
  const [seccion, setSeccion] = useState('');
  const [casilla, setCasilla] = useState('B');
  const [votos, setVotos] = useState({});
  const [nulos, setNulos] = useState(0);
  const [resultadoId, setResultadoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (soloIniciar = false) => {
    if (!seccion) return;
    setGuardando(true); setError('');
    try {
      const { data } = await api.post('/dia-eleccion/resultados', {
        seccion_numero: parseInt(seccion), casilla, votos, nulos,
      });
      setResultadoId(data.data.id);
      if (!soloIniciar) {
        setSeccion(''); setCasilla('B'); setVotos({}); setNulos(0); setResultadoId(null);
        onGuardado();
      }
    } catch (e) { setError(e.response?.data?.error || 'Error al guardar'); }
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
  const [tab, setTab] = useState('captura');
  const [resultados, setResultados] = useState([]);
  const [caceria, setCaceria] = useState([]);
  const [prep, setPrep] = useState(null);
  const [conteoRapido, setConteoRapido] = useState(null);
  const [alertasSinReportar, setAlertasSinReportar] = useState([]);
  const [capturaCerrada, setCapturaCerrada] = useState(false);

  const cargarTodo = () => {
    api.get('/dia-eleccion/resultados').then((r) => setResultados(r.data.data));
    api.get('/dia-eleccion/caceria').then((r) => setCaceria(r.data.data));
    api.get('/dia-eleccion/prep').then((r) => { setPrep(r.data.data); setCapturaCerrada(r.data.data.captura_cerrada); });
    api.get('/dia-eleccion/conteo-rapido').then((r) => setConteoRapido(r.data.data));
    api.get('/dia-eleccion/alertas-sin-reportar').then((r) => setAlertasSinReportar(r.data.data));
  };
  useEffect(cargarTodo, []);

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
      <div className="max-w-2xl mx-auto space-y-4">
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
          <button onClick={() => setTab('prep')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'prep' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>✅ Prep</button>
          <button onClick={() => setTab('caceria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'caceria' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Cacería ({caceria.length})</button>
          <button onClick={() => setTab('conteo')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'conteo' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📊 Conteo rápido</button>
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
            <PanelPrep prep={prep} />
            <p className="text-[10px] text-slate-500">Registra la ubicación de tus casillas y asigna representantes desde el botón ➕ en el mapa (tipo "Representante INE"), o dile a tu equipo que confirme asistencia desde aquí unos días antes.</p>
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
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase">Avance de reporte</span>
                <span className="text-sm font-black text-white">{conteoRapido.casillas_reportadas}/{conteoRapido.casillas_esperadas} ({conteoRapido.porcentaje_reportado}%)</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${conteoRapido.porcentaje_reportado}%` }} />
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">Suma de votos en vivo</div>
              {Object.entries(conteoRapido.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
                <div key={p} className="flex justify-between text-sm">
                  <span className="font-bold text-white">{p.toUpperCase()}</span>
                  <span className="text-slate-300">{v.toLocaleString()} ({conteoRapido.total_votos > 0 ? Math.round(v / conteoRapido.total_votos * 100) : 0}%)</span>
                </div>
              ))}
              {conteoRapido.participacion_pct != null && (
                <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">Participación estimada: {conteoRapido.participacion_pct}%</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

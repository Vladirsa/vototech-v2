import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../lib/useSocket';

const PARTIDOS = ['morena', 'pan', 'pri', 'prd', 'mc', 'pvem', 'pt', 'pac'];

function FormularioCaptura({ onGuardado }) {
  const [seccion, setSeccion] = useState('');
  const [casilla, setCasilla] = useState('B');
  const [votos, setVotos] = useState({});
  const [nulos, setNulos] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.post('/dia-eleccion/resultados', {
        seccion_numero: parseInt(seccion), casilla, votos, nulos,
      });
      setSeccion(''); setVotos({}); setNulos(0);
      onGuardado();
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar'); }
    setGuardando(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-bold text-white">📝 Capturar resultado de casilla</h2>
      <div className="flex gap-2">
        <input type="number" placeholder="Sección" value={seccion} onChange={(e) => setSeccion(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Casilla" value={casilla} onChange={(e) => setCasilla(e.target.value)}
          className="w-24 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      </div>
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
      <button onClick={guardar} disabled={guardando || !seccion}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold disabled:opacity-40">
        {guardando ? '⏳ Enviando...' : '📡 Transmitir resultado en vivo'}
      </button>
    </div>
  );
}

export default function DiaEleccion() {
  const [resultados, setResultados] = useState([]);
  const [caceria, setCaceria] = useState([]);
  const [tab, setTab] = useState('captura');
  const [conectado, setConectado] = useState(false);
  const [ultimaNotificacion, setUltimaNotificacion] = useState(null);

  const cargar = () => {
    api.get('/dia-eleccion/resultados').then((r) => setResultados(r.data.data));
    api.get('/dia-eleccion/caceria').then((r) => setCaceria(r.data.data));
  };
  useEffect(cargar, []);

  // 📡 Suscripción en vivo — sin esto tendríamos que refrescar la
  // página cada rato como hacíamos con polling en la v1.
  useSocket({
    resultado_actualizado: (nuevo) => {
      setResultados((prev) => [nuevo, ...prev.filter((r) => r.id !== nuevo.id)]);
      setUltimaNotificacion(`📡 Sección ${nuevo.seccion_numero} capturada por ${nuevo.capturado_por_nombre}`);
      setTimeout(() => setUltimaNotificacion(null), 4000);
      setConectado(true);
    },
    voto_confirmado: (v) => {
      setCaceria((prev) => prev.filter((p) => p.id !== v.id));
    },
  });

  const confirmarVoto = async (id) => {
    await api.patch(`/dia-eleccion/caceria/${id}/voto`);
  };

  // Sumar totales por partido de todos los resultados capturados
  const totales = {};
  resultados.forEach((r) => {
    Object.entries(r.votos).forEach(([p, v]) => { totales[p] = (totales[p] || 0) + v; });
  });
  const totalGeneral = Object.values(totales).reduce((s, v) => s + v, 0);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              🗳️ Día de la Elección
              <span className={`w-2 h-2 rounded-full ${conectado ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            </h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
        </div>

        {ultimaNotificacion && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300 animate-pulse">
            {ultimaNotificacion}
          </div>
        )}

        {/* Totales en vivo */}
        <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-700/30 rounded-2xl p-4">
          <div className="text-xs text-purple-300 font-bold mb-2">RESULTADOS ACUMULADOS ({resultados.length} casillas)</div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(totales).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
              <div key={p} className="text-center">
                <div className="text-lg font-black text-white">{v}</div>
                <div className="text-[9px] text-slate-400 uppercase">{p}</div>
                <div className="text-[9px] text-purple-400">{totalGeneral ? Math.round(v / totalGeneral * 100) : 0}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('captura')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'captura' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Capturar</button>
          <button onClick={() => setTab('caceria')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'caceria' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Cacería ({caceria.length})</button>
        </div>

        {tab === 'captura' && <FormularioCaptura onGuardado={cargar} />}

        {tab === 'caceria' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Base confirmados que AÚN no han votado — mándale a alguien por ellos.</p>
            {caceria.map((p) => (
              <div key={p.id} className="rounded-xl border border-red-800/40 bg-red-500/5 p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{p.nombre}</div>
                  <div className="text-[10px] text-slate-500">Sección {p.seccion_numero} {p.telefono && `· ${p.telefono}`}</div>
                </div>
                <button onClick={() => confirmarVoto(p.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold">✅ Ya votó</button>
              </div>
            ))}
            {caceria.length === 0 && <div className="text-center text-slate-500 py-6">🎉 Todos tus confirmados ya votaron</div>}
          </div>
        )}
      </div>
    </div>
  );
}

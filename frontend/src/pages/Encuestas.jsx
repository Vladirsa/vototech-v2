import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

function ModalCrearEncuesta({ onCerrar, onCreada }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [preguntas, setPreguntas] = useState([{ tipo: 'opcion_multiple', texto: '', opciones: ['', ''] }]);

  const agregarPregunta = () => setPreguntas([...preguntas, { tipo: 'opcion_multiple', texto: '', opciones: ['', ''] }]);
  const quitarPregunta = (i) => setPreguntas(preguntas.filter((_, idx) => idx !== i));
  const actualizarPregunta = (i, campo, valor) => {
    const nuevas = [...preguntas];
    nuevas[i] = { ...nuevas[i], [campo]: valor };
    setPreguntas(nuevas);
  };
  const actualizarOpcion = (i, j, valor) => {
    const nuevas = [...preguntas];
    nuevas[i].opciones[j] = valor;
    setPreguntas(nuevas);
  };
  const agregarOpcion = (i) => { const nuevas = [...preguntas]; nuevas[i].opciones.push(''); setPreguntas(nuevas); };

  const guardar = async () => {
    const preguntasLimpias = preguntas.map((p) => ({ ...p, opciones: p.tipo === 'opcion_multiple' ? p.opciones.filter(Boolean) : [] }));
    await api.post('/encuestas', { titulo, descripcion, preguntas: preguntasLimpias });
    onCreada();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">📋 Nueva Encuesta</h2>
        <input placeholder="Título de la encuesta" value={titulo} onChange={(e) => setTitulo(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <textarea placeholder="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        <div className="space-y-3">
          {preguntas.map((p, i) => (
            <div key={i} className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">Pregunta {i + 1}</span>
                {preguntas.length > 1 && <button onClick={() => quitarPregunta(i)} className="text-red-500 text-xs">🗑️</button>}
              </div>
              <input placeholder="Texto de la pregunta" value={p.texto} onChange={(e) => actualizarPregunta(i, 'texto', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              <div className="flex gap-1.5">
                <button onClick={() => actualizarPregunta(i, 'tipo', 'opcion_multiple')} className={`flex-1 py-1.5 rounded text-[10px] font-bold ${p.tipo === 'opcion_multiple' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'}`}>☑️ Opción múltiple</button>
                <button onClick={() => actualizarPregunta(i, 'tipo', 'abierta')} className={`flex-1 py-1.5 rounded text-[10px] font-bold ${p.tipo === 'abierta' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'}`}>✏️ Respuesta abierta</button>
              </div>
              {p.tipo === 'opcion_multiple' && (
                <div className="space-y-1.5">
                  {p.opciones.map((op, j) => (
                    <input key={j} placeholder={`Opción ${j + 1}`} value={op} onChange={(e) => actualizarOpcion(i, j, e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                  ))}
                  <button onClick={() => agregarOpcion(i)} className="text-[10px] font-bold text-indigo-400">+ Agregar opción</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={agregarPregunta} className="w-full py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">+ Agregar otra pregunta</button>

        <div className="flex gap-2 pt-2">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={!titulo || preguntas.some((p) => !p.texto)} className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Crear encuesta</button>
        </div>
      </div>
    </div>
  );
}

function ModalResultados({ encuestaId, onCerrar }) {
  const [resultados, setResultados] = useState(null);
  useEffect(() => { api.get(`/encuestas/${encuestaId}/resultados`).then((r) => setResultados(r.data.data)); }, [encuestaId]);

  const enlace = `${window.location.origin}/encuesta/${encuestaId}`;

  if (!resultados) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-black text-white">📊 Resultados</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>
        <div className="text-xs text-slate-400">{resultados.total_respuestas} respuestas totales</div>

        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2 flex items-center justify-between">
          <span className="text-[10px] text-indigo-300 truncate">{enlace}</span>
          <button onClick={() => navigator.clipboard.writeText(enlace)} className="text-[10px] font-bold text-indigo-400 flex-shrink-0 ml-2">Copiar</button>
        </div>

        {resultados.resultados.map((r, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs font-bold text-white mb-2">{r.pregunta}</div>
            {r.tipo === 'opcion_multiple' ? (
              <div className="space-y-1.5">
                {Object.entries(r.conteo).map(([op, n]) => {
                  const total = Object.values(r.conteo).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                  return (
                    <div key={op}>
                      <div className="flex justify-between text-[10px] text-slate-300 mb-0.5"><span>{op}</span><span>{n} ({pct}%)</span></div>
                      <div className="h-2 bg-slate-900 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {r.textos.length === 0 ? <span className="text-[10px] text-slate-500">Sin respuestas todavía</span> :
                  r.textos.map((t, j) => <div key={j} className="text-[10px] text-slate-300 bg-slate-900/50 rounded px-2 py-1">"{t}"</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalResponderCampo({ encuesta, onCerrar }) {
  const [respuestas, setRespuestas] = useState({});

  const guardar = async () => {
    await api.post(`/encuestas/${encuesta.id}/responder`, { respuestas });
    onCerrar();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-white">📋 {encuesta.titulo}</h2>
        {encuesta.preguntas.map((p) => (
          <div key={p.id}>
            <label className="text-xs text-slate-300 font-bold block mb-1.5">{p.texto}</label>
            {p.tipo === 'opcion_multiple' ? (
              <div className="space-y-1.5">
                {p.opciones.map((op) => (
                  <button key={op} onClick={() => setRespuestas({ ...respuestas, [p.id]: op })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs border ${respuestas[p.id] === op ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                    {op}
                  </button>
                ))}
              </div>
            ) : (
              <textarea value={respuestas[p.id] || ''} onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs min-h-16" />
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} className="flex-[2] py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold">Guardar respuesta</button>
        </div>
      </div>
    </div>
  );
}

export default function Encuestas() {
  const [encuestas, setEncuestas] = useState([]);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [verResultados, setVerResultados] = useState(null);
  const [responderCampo, setResponderCampo] = useState(null);

  const cargar = () => api.get('/encuestas').then((r) => setEncuestas(r.data.data));
  useEffect(cargar, []);

  const toggleActiva = async (id, activa) => { await api.patch(`/encuestas/${id}/activa`, { activa: !activa }); cargar(); };
  const eliminar = async (id) => { if (confirm('¿Eliminar esta encuesta y todas sus respuestas?')) { await api.delete(`/encuestas/${id}`); cargar(); } };

  const abrirCampo = async (id) => {
    const { data } = await api.get(`/encuestas/${id}`);
    setResponderCampo(data.data);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📋 Encuestas</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarCrear(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Nueva</button>
        </div>

        <div className="space-y-2">
          {encuestas.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Sin encuestas todavía</div>
          ) : encuestas.map((e) => (
            <div key={e.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-bold text-white">{e.titulo}</div>
                  <div className="text-[10px] text-slate-500">{e.total_respuestas} respuestas</div>
                </div>
                <button onClick={() => toggleActiva(e.id, e.activa)} className={`text-[9px] font-bold px-2 py-1 rounded-full ${e.activa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {e.activa ? '✅ Activa' : '⏸️ Pausada'}
                </button>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => abrirCampo(e.id)} className="text-[10px] font-bold text-emerald-400">📋 Capturar en campo</button>
                <button onClick={() => setVerResultados(e.id)} className="text-[10px] font-bold text-indigo-400">📊 Resultados</button>
                <button onClick={() => eliminar(e.id)} className="text-[10px] font-bold text-red-400 ml-auto">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mostrarCrear && <ModalCrearEncuesta onCerrar={() => setMostrarCrear(false)} onCreada={() => { setMostrarCrear(false); cargar(); }} />}
      {verResultados && <ModalResultados encuestaId={verResultados} onCerrar={() => setVerResultados(null)} />}
      {responderCampo && <ModalResponderCampo encuesta={responderCampo} onCerrar={() => setResponderCampo(null)} />}
    </div>
  );
}

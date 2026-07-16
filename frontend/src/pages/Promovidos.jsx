import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import AsistenteIA from '../components/AsistenteIA';

const CLASIFICACION_ESTILO = {
  base:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '✅ Base' },
  persuadible: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: '🎯 Persuadible' },
  adversario:  { color: 'text-slate-500', bg: 'bg-slate-500/10', label: '⛔ Adversario' },
};

function ModalAgregar({ onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    nombre: '', telefono: '', seccion_numero: '', partido: '',
    comprometido: false, temperatura: 'tibio', consentimiento: false,
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const actualizar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!form.consentimiento) { setError('Se requiere el consentimiento del ciudadano (LFPDPPP)'); return; }
    setGuardando(true);
    try {
      await api.post('/promovidos', {
        ...form,
        seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined,
      });
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">🤝 Nuevo Promovido</h2>
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}

        <input placeholder="Nombre completo *" value={form.nombre} onChange={(e) => actualizar('nombre', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Teléfono" value={form.telefono} onChange={(e) => actualizar('telefono', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Sección electoral" type="number" value={form.seccion_numero} onChange={(e) => actualizar('seccion_numero', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        <select value={form.partido} onChange={(e) => actualizar('partido', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          <option value="">Partido de preferencia (opcional)</option>
          {['morena','pan','pri','prd','mc','pvem','pt','pac','independiente'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>

        <div className="flex gap-2">
          {['frio','tibio','caliente'].map(t => (
            <button key={t} onClick={() => actualizar('temperatura', t)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.temperatura===t ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400'}`}>
              {t==='frio'?'❄️':t==='tibio'?'🌡️':'🔥'} {t}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={form.comprometido} onChange={(e) => actualizar('comprometido', e.target.checked)} />
          Está comprometido a votar por nosotros
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/50 p-2 rounded-lg">
          <input type="checkbox" checked={form.consentimiento} onChange={(e) => actualizar('consentimiento', e.target.checked)} className="mt-0.5" />
          <span>Cuento con el consentimiento de esta persona para registrar sus datos, conforme a la LFPDPPP *</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !form.nombre}
            className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            {guardando ? 'Guardando...' : '✅ Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelWhatsAppMasivo({ persuadibles }) {
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    const destinatarios = persuadibles.filter((p) => p.telefono).map((p) => ({ telefono: p.telefono, mensaje }));
    try {
      const { data } = await api.post('/whatsapp/enviar', { destinatarios });
      setResultado(`✅ ${data.enviados} enviados, ${data.fallidos} fallidos`);
    } catch (e) {
      setResultado('⚠️ ' + (e.response?.data?.error || 'Error al enviar'));
    }
    setEnviando(false);
  };

  return (
    <div className="bg-slate-900/60 border border-purple-800/30 rounded-xl p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">📲 WhatsApp masivo a Persuadibles</h3>
        <AsistenteIA contexto="mensaje_persuasion" onTextoGenerado={setMensaje} />
      </div>
      <p className="text-[10px] text-slate-500">{persuadibles.filter((p) => p.telefono).length} de {persuadibles.length} tienen teléfono registrado</p>
      <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escribe tu mensaje o usa el asistente de arriba..."
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
      <button onClick={enviar} disabled={enviando || !mensaje} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold disabled:opacity-40">
        {enviando ? '⏳ Enviando...' : '📤 Enviar a todos'}
      </button>
      {resultado && <div className="text-xs text-center text-slate-300">{resultado}</div>}
    </div>
  );
}

export default function Promovidos() {
  const [params] = useSearchParams();
  const [lista, setLista] = useState([]);
  const [modoSeguimiento, setModoSeguimiento] = useState(params.get('filtro') === 'seguimiento');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('lista');

  const cargar = () => {
    setCargando(true);
    const ep = modoSeguimiento ? '/promovidos/seguimiento-prioritario' : '/promovidos';
    api.get(ep).then((r) => { setLista(r.data.data); setCargando(false); });
  };

  useEffect(() => { cargar(); }, [modoSeguimiento]);

  const registrarContacto = async (id, resultado) => {
    await api.post(`/promovidos/${id}/contacto`, { tipo: 'visita', resultado });
    cargar();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🤝 Promovidos</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
            + Agregar
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { setModoSeguimiento(false); setTab('lista'); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${!modoSeguimiento && tab === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            Todos
          </button>
          <button onClick={() => { setModoSeguimiento(true); setTab('lista'); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${modoSeguimiento && tab === 'lista' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            🎯 Seguimiento prioritario
          </button>
          <button onClick={() => setTab('whatsapp')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'whatsapp' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📲 WhatsApp masivo
          </button>
        </div>

        {tab === 'whatsapp' && <PanelWhatsAppMasivo persuadibles={lista.filter((p) => p.clasificacion === 'persuadible')} />}

        {tab === 'lista' && (cargando ? (
          <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>
        ) : lista.length === 0 ? (
          <div className="text-center text-slate-500 py-10">Sin registros todavía</div>
        ) : (
          <div className="space-y-2">
            {lista.map((p) => {
              const est = CLASIFICACION_ESTILO[p.clasificacion] || CLASIFICACION_ESTILO.persuadible;
              return (
                <div key={p.id} className={`rounded-xl border border-slate-800 ${est.bg} p-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{p.nombre}</div>
                      <div className="text-[10px] text-slate-500">
                        {p.seccion_numero ? `Sección ${String(p.seccion_numero).padStart(3,'0')}` : 'Sin sección'} · {p.partido?.toUpperCase() || 'Sin partido'}
                        {p.dias_sin_contacto != null && ` · ${p.dias_sin_contacto} días sin contacto`}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold ${est.color}`}>{est.label}</span>
                  </div>
                  {modoSeguimiento && (
                    <div className="flex gap-1.5 mt-3">
                      <button onClick={() => registrarContacto(p.id, 'positivo')} className="flex-1 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-[10px] font-bold">👍 Positivo</button>
                      <button onClick={() => registrarContacto(p.id, 'neutral')} className="flex-1 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 text-[10px] font-bold">😐 Neutral</button>
                      <button onClick={() => registrarContacto(p.id, 'sin_respuesta')} className="flex-1 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 text-[10px] font-bold">📵 Sin resp.</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {mostrarModal && <ModalAgregar onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
    </div>
  );
}

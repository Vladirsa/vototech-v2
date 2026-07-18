import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const CATEGORIA_ESTILO = {
  motivacional: { ic: '💪', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  informativo: { ic: 'ℹ️', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  recordatorio: { ic: '⏰', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  urgente: { ic: '🚨', color: 'text-red-400', bg: 'bg-red-500/10' },
};

function PanelNumeros() {
  const [numeros, setNumeros] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ alias: '', numero_whatsapp: '', account_sid: '', auth_token: '', limite_diario: 250 });

  const cargar = () => api.get('/marketing/numeros').then((r) => setNumeros(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/marketing/numeros', form);
    setForm({ alias: '', numero_whatsapp: '', account_sid: '', auth_token: '', limite_diario: 250 });
    setMostrarForm(false);
    cargar();
  };
  const toggleActivo = async (id, activo) => { await api.patch(`/marketing/numeros/${id}`, { activo: !activo }); cargar(); };
  const eliminar = async (id) => { if (confirm('¿Quitar este número?')) { await api.delete(`/marketing/numeros/${id}`); cargar(); } };

  return (
    <div className="space-y-3">
      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 text-[11px] text-indigo-300">
        💡 Cada número necesita estar dado de alta como WhatsApp Business en tu cuenta de Twilio antes de agregarlo aquí — este panel solo los conecta, no los crea.
      </div>

      {numeros.map((n) => {
        const pct = Math.min(100, (n.usados_hoy / n.limite_diario) * 100);
        return (
          <div key={n.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-sm font-bold text-white">{n.alias}</span>
                <span className="text-[10px] text-slate-500 ml-2">{n.numero_whatsapp}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActivo(n.id, n.activo)} className={`text-[9px] font-bold px-2 py-1 rounded-full ${n.activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {n.activo ? '✅ Activo' : '⏸️ Pausado'}
                </button>
                <button onClick={() => eliminar(n.id)} className="text-red-500 text-xs">🗑️</button>
              </div>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[9px] text-slate-500 mt-1">{n.usados_hoy} de {n.limite_diario} mensajes usados hoy</div>
          </div>
        );
      })}

      {!mostrarForm ? (
        <button onClick={() => setMostrarForm(true)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar número</button>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Alias (ej: Línea Voluntarios)" value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Número (+521234567890)" value={form.numero_whatsapp} onChange={(e) => setForm({ ...form, numero_whatsapp: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Account SID de Twilio" value={form.account_sid} onChange={(e) => setForm({ ...form, account_sid: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Auth Token de Twilio" type="password" value={form.auth_token} onChange={(e) => setForm({ ...form, auth_token: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Límite de mensajes por día" type="number" value={form.limite_diario} onChange={(e) => setForm({ ...form, limite_diario: parseInt(e.target.value) || 250 })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setMostrarForm(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
            <button onClick={guardar} disabled={!form.alias || !form.numero_whatsapp} className="flex-[2] py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelPlantillas({ onUsar }) {
  const [plantillas, setPlantillas] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ categoria: 'informativo', titulo: '', mensaje: '' });

  const cargar = () => api.get('/marketing/plantillas').then((r) => setPlantillas(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/marketing/plantillas', form);
    setForm({ categoria: 'informativo', titulo: '', mensaje: '' });
    setMostrarForm(false);
    cargar();
  };
  const eliminar = async (id) => { await api.delete(`/marketing/plantillas/${id}`); cargar(); };

  return (
    <div className="space-y-3">
      {plantillas.map((p) => {
        const est = CATEGORIA_ESTILO[p.categoria];
        return (
          <div key={p.id} className={`rounded-xl border border-slate-800 ${est.bg} p-3`}>
            <div className="flex justify-between items-start mb-1">
              <span className={`text-xs font-bold ${est.color}`}>{est.ic} {p.titulo}</span>
              <button onClick={() => eliminar(p.id)} className="text-red-500 text-xs">🗑️</button>
            </div>
            <p className="text-xs text-slate-300">{p.mensaje}</p>
            {onUsar && <button onClick={() => onUsar(p)} className="mt-2 text-[10px] font-bold text-indigo-400">Usar esta plantilla →</button>}
          </div>
        );
      })}

      {!mostrarForm ? (
        <button onClick={() => setMostrarForm(true)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Nueva plantilla</button>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            {Object.entries(CATEGORIA_ESTILO).map(([k, v]) => <option key={k} value={k}>{v.ic} {k}</option>)}
          </select>
          <input placeholder="Título (solo para identificarla)" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <textarea placeholder="Mensaje — usa {nombre} para personalizar" value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-24" />
          <div className="flex gap-2">
            <button onClick={() => setMostrarForm(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
            <button onClick={guardar} disabled={!form.titulo || !form.mensaje} className="flex-[2] py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelNuevoEnvio({ onEnviado }) {
  const [modo, setModo] = useState('enlace');
  const [audienciaTipo, setAudienciaTipo] = useState('promovidos');
  const [filtros, setFiltros] = useState({});
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [previa, setPrevia] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const previsualizar = async () => {
    const { data } = await api.post('/marketing/audiencia/previsualizar', { tipo: audienciaTipo, filtros });
    setPrevia(data);
  };
  useEffect(() => { previsualizar(); }, [audienciaTipo, JSON.stringify(filtros)]);

  const enviar = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post('/marketing/envios', {
        titulo, modo, mensaje_base: mensaje, audiencia_tipo: audienciaTipo, audiencia_filtro: filtros,
      });
      setResultado(data.data);
      onEnviado();
    } catch (e) { alert(e.response?.data?.error || 'Error al crear el envío'); }
    setEnviando(false);
  };

  if (resultado) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
        <div className="text-2xl">✅</div>
        <p className="text-sm text-emerald-300 font-bold">
          {modo === 'enlace' ? `Cola lista con ${resultado.total} personas` : `${resultado.enviados} enviados, ${resultado.fallidos} fallidos`}
        </p>
        <button onClick={() => setResultado(null)} className="text-xs font-bold text-indigo-400">Hacer otro envío</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input placeholder="Título del envío (interno, para identificarlo)" value={titulo} onChange={(e) => setTitulo(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

      <div className="flex gap-2">
        <button onClick={() => setModo('enlace')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${modo === 'enlace' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🆓 Modo gratis (enlaces)</button>
        <button onClick={() => setModo('twilio')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold ${modo === 'twilio' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>⚡ Automático (Twilio)</button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setAudienciaTipo('promovidos')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${audienciaTipo === 'promovidos' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🤝 Promovidos</button>
        <button onClick={() => setAudienciaTipo('estructura')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${audienciaTipo === 'estructura' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗂️ Estructura</button>
      </div>

      {audienciaTipo === 'promovidos' ? (
        <div className="grid grid-cols-2 gap-2">
          <select onChange={(e) => setFiltros({ ...filtros, clasificacion: e.target.value || undefined })} className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
            <option value="">Toda clasificación</option>
            <option value="base">✅ Base</option>
            <option value="persuadible">🎯 Persuadible</option>
            <option value="adversario">⛔ Adversario</option>
          </select>
          <input placeholder="Sección (opcional)" type="number" onChange={(e) => setFiltros({ ...filtros, seccion_numero: e.target.value ? parseInt(e.target.value) : undefined })}
            className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>
      ) : (
        <select onChange={(e) => setFiltros({ ...filtros, rol: e.target.value || undefined })} className="w-full px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
          <option value="">Toda la estructura</option>
          <option value="promotor">Solo promotores</option>
          <option value="coord_seccional">Solo coordinadores seccionales</option>
        </select>
      )}

      {previa && (
        <div className="text-xs text-indigo-300 bg-indigo-500/10 rounded-lg px-3 py-2">
          📊 Este mensaje llegará a <strong>{previa.total}</strong> personas con teléfono registrado
        </div>
      )}

      <textarea placeholder="Mensaje — usa {nombre} para personalizar" value={mensaje} onChange={(e) => setMensaje(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-24" />

      <button onClick={enviar} disabled={enviando || !titulo || !mensaje || !previa?.total}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold disabled:opacity-40">
        {enviando ? '⏳ Procesando...' : modo === 'enlace' ? `📋 Armar cola para ${previa?.total || 0} personas` : `⚡ Enviar a ${previa?.total || 0} personas ahora`}
      </button>
    </div>
  );
}

function DetalleEnvio({ envioId, onCerrar }) {
  const [envio, setEnvio] = useState(null);

  const cargar = () => api.get(`/marketing/envios/${envioId}`).then((r) => setEnvio(r.data.data));
  useEffect(cargar, [envioId]);

  const marcarEnviado = async (destId) => { await api.patch(`/marketing/envios/${envioId}/marcar/${destId}`); cargar(); };

  if (!envio) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-black text-white">{envio.titulo}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>
        <div className="text-xs text-slate-400">{envio.enviados} de {envio.total} enviados{envio.modo === 'enlace' ? ' — toca cada uno tras mandarlo de verdad' : ''}</div>

        <div className="space-y-1.5">
          {envio.destinatarios.map((d) => (
            <div key={d.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
              <div>
                <div className="text-xs font-bold text-white">{d.nombre}</div>
                <div className="text-[9px] text-slate-500">{d.telefono}</div>
              </div>
              {d.estado === 'enviado' ? (
                <span className="text-[10px] text-emerald-400 font-bold">✅ Enviado</span>
              ) : d.estado === 'fallido' ? (
                <span className="text-[10px] text-red-400 font-bold">⚠️ Falló</span>
              ) : envio.modo === 'enlace' ? (
                <div className="flex gap-1">
                  <a href={`https://wa.me/52${d.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(d.mensaje)}`} target="_blank" rel="noreferrer"
                    className="px-2 py-1 rounded-lg bg-emerald-700/50 text-emerald-300 text-[10px] font-bold">📲 Abrir</a>
                  <button onClick={() => marcarEnviado(d.id)} className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[10px] font-bold">✅ Ya mandé</button>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500">Pendiente</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Marketing() {
  const [tab, setTab] = useState('nuevo');
  const [envios, setEnvios] = useState([]);
  const [envioDetalle, setEnvioDetalle] = useState(null);

  const cargarEnvios = () => api.get('/marketing/envios').then((r) => setEnvios(r.data.data));
  useEffect(cargarEnvios, []);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">📢 Marketing</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('nuevo')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'nuevo' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>+ Nuevo envío</button>
          <button onClick={() => setTab('historial')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'historial' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📜 Historial</button>
          <button onClick={() => setTab('plantillas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'plantillas' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📝 Plantillas</button>
          <button onClick={() => setTab('numeros')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'numeros' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📱 Números</button>
        </div>

        {tab === 'nuevo' && <PanelNuevoEnvio onEnviado={cargarEnvios} />}
        {tab === 'numeros' && <PanelNumeros />}
        {tab === 'plantillas' && <PanelPlantillas />}

        {tab === 'historial' && (
          <div className="space-y-2">
            {envios.length === 0 ? (
              <div className="text-center text-slate-500 py-10">Sin envíos todavía</div>
            ) : envios.map((e) => (
              <button key={e.id} onClick={() => setEnvioDetalle(e.id)} className="w-full text-left bg-slate-900/60 border border-slate-800 rounded-xl p-3 hover:bg-slate-800/60">
                <div className="flex justify-between">
                  <span className="text-sm font-bold text-white">{e.titulo}</span>
                  <span className="text-[9px] text-slate-500">{e.modo === 'enlace' ? '🆓' : '⚡'}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{e.enviados}/{e.total} enviados · {new Date(e.creado_en).toLocaleDateString('es-MX')}</div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full bg-indigo-500" style={{ width: `${(e.enviados / e.total) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {envioDetalle && <DetalleEnvio envioId={envioDetalle} onCerrar={() => { setEnvioDetalle(null); cargarEnvios(); }} />}
    </div>
  );
}

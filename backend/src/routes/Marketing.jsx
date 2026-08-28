import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import Ayuda from '../components/Ayuda';

const CATEGORIA_ESTILO = {
  motivacional: { ic: '💪', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  informativo: { ic: 'ℹ️', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  recordatorio: { ic: '⏰', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  urgente: { ic: '🚨', color: 'text-red-400', bg: 'bg-red-500/10' },
};

const TIPO_MEDIO_LABEL = { prensa: '📰 Prensa escrita', radio: '📻 Radio', tv: '📺 TV', digital: '💻 Digital' };
const TIPO_CONTENIDO_LABEL = {
  discurso: { ic: '🎤', label: 'Discurso' },
  argumentario: { ic: '📋', label: 'Argumentario' },
  pregunta_dificil: { ic: '❓', label: 'Preguntas difíciles' },
  mensaje_dia: { ic: '💬', label: 'Mensaje del día' },
  storytelling: { ic: '📖', label: 'Storytelling ciudadano' },
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
        <Ayuda posicion="abajo" texto="Gratis: arma la lista y tu equipo toca 'enviar' uno por uno desde su propio WhatsApp, sin costo. Automático: se manda solo desde números configurados en la pestaña Números, sin que nadie toque nada, pero tiene costo por mensaje." />
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

/** 🆕 Base de periodistas — CRM chico de contactos de prensa. */
function PanelPeriodistas({ onSeleccionMultiple, seleccionados }) {
  const [periodistas, setPeriodistas] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', medio: '', tipo_medio: 'digital', telefono: '', email: '', notas: '' });

  const cargar = () => api.get('/marketing/periodistas').then((r) => setPeriodistas(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/marketing/periodistas', form);
    setForm({ nombre: '', medio: '', tipo_medio: 'digital', telefono: '', email: '', notas: '' });
    setMostrarForm(false);
    cargar();
  };
  const eliminar = async (id) => { if (confirm('¿Eliminar este periodista?')) { await api.delete(`/marketing/periodistas/${id}`); cargar(); } };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Nuevo periodista'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <input placeholder="Medio (ej: El Sol de Tlaxcala)" value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <select value={form.tipo_medio} onChange={(e) => setForm({ ...form, tipo_medio: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            {Object.entries(TIPO_MEDIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="flex gap-2">
            <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <button onClick={guardar} disabled={!form.nombre} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar</button>
        </div>
      )}
      {periodistas.length === 0 ? (
        <div className="text-center text-slate-500 py-8">Sin periodistas registrados todavía</div>
      ) : periodistas.map((p) => (
        <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onSeleccionMultiple && (
              <input type="checkbox" checked={seleccionados?.includes(p.id)} onChange={() => onSeleccionMultiple(p.id)} />
            )}
            <div>
              <div className="text-sm font-bold text-white">{p.nombre}</div>
              <div className="text-[10px] text-slate-500">{TIPO_MEDIO_LABEL[p.tipo_medio]} {p.medio && `· ${p.medio}`}{p.telefono && ` · ${p.telefono}`}</div>
            </div>
          </div>
          {!onSeleccionMultiple && <button onClick={() => eliminar(p.id)} className="text-red-500 text-xs">🗑️</button>}
        </div>
      ))}
    </div>
  );
}

/** 🆕 Boletines de prensa */
function PanelBoletines() {
  const [boletines, setBoletines] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', contenido: '' });
  const [enviandoId, setEnviandoId] = useState(null);
  const [seleccionEnvio, setSeleccionEnvio] = useState(null);
  const [periodistasSeleccionados, setPeriodistasSeleccionados] = useState([]);

  const cargar = () => api.get('/marketing/boletines').then((r) => setBoletines(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    await api.post('/marketing/boletines', form);
    setForm({ titulo: '', contenido: '' });
    setMostrarForm(false);
    cargar();
  };
  const eliminar = async (id) => { if (confirm('¿Eliminar este boletín?')) { await api.delete(`/marketing/boletines/${id}`); cargar(); } };

  const enviarATodos = async (id) => {
    if (!confirm('¿Enviar este boletín a TODA tu base de periodistas?')) return;
    const { data } = await api.post(`/marketing/boletines/${id}/enviar`, {});
    alert(`✅ Marcado como enviado a ${data.data.total} periodistas`);
    cargar();
  };

  const togglePeriodista = (id) => {
    setPeriodistasSeleccionados((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };
  const enviarASeleccionados = async () => {
    await api.post(`/marketing/boletines/${seleccionEnvio}/enviar`, { periodista_ids: periodistasSeleccionados });
    alert(`✅ Marcado como enviado a ${periodistasSeleccionados.length} periodistas`);
    setSeleccionEnvio(null);
    setPeriodistasSeleccionados([]);
    cargar();
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Nuevo boletín'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <input placeholder="Título del boletín" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <textarea placeholder="Contenido completo del boletín" value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-40" />
          <button onClick={guardar} disabled={!form.titulo || !form.contenido} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar borrador</button>
        </div>
      )}
      {boletines.length === 0 ? (
        <div className="text-center text-slate-500 py-8">Sin boletines todavía</div>
      ) : boletines.map((b) => (
        <div key={b.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-bold text-white">{b.titulo}</div>
              <div className="text-[10px] text-slate-500">{b.estado === 'enviado' ? `✅ Enviado a ${b.total_enviados} periodistas` : '📝 Borrador'} · {new Date(b.creado_en).toLocaleDateString('es-MX')}</div>
            </div>
            <button onClick={() => eliminar(b.id)} className="text-red-500 text-xs">🗑️</button>
          </div>
          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{b.contenido}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => enviarATodos(b.id)} className="flex-1 py-1.5 rounded-lg bg-emerald-700/50 text-emerald-300 text-[10px] font-bold">📤 Enviar a todos</button>
            <button onClick={() => { setSeleccionEnvio(b.id); setPeriodistasSeleccionados([]); }} className="flex-1 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-[10px] font-bold">✅ Elegir a quién</button>
          </div>
        </div>
      ))}

      {seleccionEnvio && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={() => setSeleccionEnvio(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-white">Elegir periodistas</h2>
            <PanelPeriodistas onSeleccionMultiple={togglePeriodista} seleccionados={periodistasSeleccionados} />
            <button onClick={enviarASeleccionados} disabled={periodistasSeleccionados.length === 0}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
              Enviar a {periodistasSeleccionados.length} seleccionados
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 🆕 Biblioteca de contenido — fotos, videos, textos y documentos reutilizables. */
/**
 * 🆕 Monitoreo de Redes Sociales — reporte MANUAL de tus encargados de
 * redes (no es escucha automática con IA). Alguien ve algo — una
 * mención negativa, una nota falsa, una tendencia — y lo registra con
 * evidencia, para que quede un historial consultable en vez de
 * perderse entre conversaciones sueltas de WhatsApp.
 */
const TIPO_MONITOREO = {
  mencion_negativa: { ic: '⚠️', label: 'Mención negativa', color: 'text-red-400 bg-red-500/10' },
  nota_falsa: { ic: '🚫', label: 'Nota falsa', color: 'text-orange-400 bg-orange-500/10' },
  tendencia: { ic: '📈', label: 'Tendencia', color: 'text-purple-400 bg-purple-500/10' },
  mencion_positiva: { ic: '✅', label: 'Mención positiva', color: 'text-emerald-400 bg-emerald-500/10' },
  otro: { ic: '📌', label: 'Otro', color: 'text-slate-400 bg-slate-500/10' },
};
const PLATAFORMA_ICONO = { x: '𝕏', facebook: '📘', tiktok: '🎵', instagram: '📷', whatsapp: '💬', otra: '🌐' };
const URGENCIA_COLOR = { alta: 'border-red-500/40 bg-red-500/5', media: 'border-amber-500/40 bg-amber-500/5', baja: 'border-slate-700 bg-slate-800/30' };

function PanelMonitoreoRedes() {
  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState({});
  const [filtroTipo, setFiltroTipo] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'mencion_negativa', plataforma: 'x', descripcion: '', url_post: '', urgencia: 'media' });
  const [captura, setCaptura] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    const params = filtroTipo ? `?tipo=${filtroTipo}` : '';
    api.get(`/marketing/monitoreo-redes${params}`).then((r) => { setItems(r.data.data); setResumen(r.data.resumen); });
  };
  useEffect(cargar, [filtroTipo]);

  const guardar = async () => {
    if (form.descripcion.trim().length < 3) return;
    setGuardando(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (captura) fd.append('captura', captura);
    try {
      await api.post('/marketing/monitoreo-redes', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({ tipo: 'mencion_negativa', plataforma: 'x', descripcion: '', url_post: '', urgencia: 'media' });
      setCaptura(null);
      setMostrarForm(false);
      cargar();
    } catch (e) { alert(e.response?.data?.error || 'No se pudo guardar'); }
    setGuardando(false);
  };

  const marcarAtendida = async (id) => { await api.patch(`/marketing/monitoreo-redes/${id}/atender`); cargar(); };
  const eliminar = async (id) => { if (confirm('¿Borrar este reporte?')) { await api.delete(`/marketing/monitoreo-redes/${id}`); cargar(); } };

  return (
    <div className="space-y-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-bold text-white">📱 Monitoreo de Redes Sociales</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Reporte manual de tu equipo — no es un rastreo automático. Cualquiera que vea algo relevante (una mención negativa, una nota falsa, una tendencia) lo registra aquí, con evidencia si es posible.</p>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {Object.entries(TIPO_MONITOREO).map(([k, v]) => (
          <button key={k} onClick={() => setFiltroTipo(filtroTipo === k ? '' : k)}
            className={`rounded-lg p-2 text-center ${filtroTipo === k ? v.color + ' ring-1 ring-current' : 'bg-slate-900/60 border border-slate-800'}`}>
            <div className="text-lg font-black text-white">{resumen[k] || 0}</div>
            <div className="text-[8px] text-slate-500">{v.ic} {v.label}</div>
          </button>
        ))}
      </div>

      {!mostrarForm ? (
        <button onClick={() => setMostrarForm(true)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Reportar algo</button>
      ) : (
        <div className="bg-slate-900/60 border border-indigo-500/30 rounded-xl p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(TIPO_MONITOREO).map(([k, v]) => <option key={k} value={k}>{v.ic} {v.label}</option>)}
            </select>
            <select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(PLATAFORMA_ICONO).map(([k, ic]) => <option key={k} value={k}>{ic} {k === 'x' ? 'X (Twitter)' : k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
            </select>
          </div>
          <textarea placeholder="Describe qué viste — quién lo publicó, qué dice, contexto..." value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-20" />
          <input placeholder="Liga al post original (opcional)" value={form.url_post} onChange={(e) => setForm({ ...form, url_post: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <div className="flex gap-2">
            {['baja', 'media', 'alta'].map((u) => (
              <button key={u} onClick={() => setForm({ ...form, urgencia: u })}
                className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize ${form.urgencia === u ? (u === 'alta' ? 'bg-red-600 text-white' : u === 'media' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-white') : 'bg-slate-800 text-slate-400'}`}>
                {u}
              </button>
            ))}
          </div>
          <label className="block">
            <input type="file" accept="image/*" onChange={(e) => setCaptura(e.target.files[0])} className="hidden" id="input-captura-redes" />
            <span className="block text-center py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer" onClick={() => document.getElementById('input-captura-redes').click()}>
              {captura ? `📎 ${captura.name}` : '📷 Adjuntar captura de pantalla (opcional)'}
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setMostrarForm(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
            <button onClick={guardar} disabled={guardando || form.descripcion.trim().length < 3} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
              {guardando ? '⏳ Guardando...' : 'Reportar'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">Sin reportes todavía</div>
        ) : items.map((it) => (
          <div key={it.id} className={`rounded-xl border p-3 ${URGENCIA_COLOR[it.urgencia]} ${it.estado === 'atendida' ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  {TIPO_MONITOREO[it.tipo].ic} {TIPO_MONITOREO[it.tipo].label}
                  <span className="text-slate-500 font-normal">· {PLATAFORMA_ICONO[it.plataforma]} · {it.creado_por_nombre}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{it.descripcion}</p>
                {it.url_post && <a href={it.url_post} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 block mt-1">🔗 Ver post original</a>}
                {it.captura_url && <a href={it.captura_url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 block">📎 Ver captura</a>}
                <p className="text-[9px] text-slate-600 mt-1">{new Date(it.creado_en).toLocaleString('es-MX')}</p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {it.estado !== 'atendida' && (
                  <button onClick={() => marcarAtendida(it.id)} className="text-[9px] font-bold text-emerald-400">✓ Atendida</button>
                )}
                <button onClick={() => eliminar(it.id)} className="text-[9px] font-bold text-red-400">Borrar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelBiblioteca() {
  const [items, setItems] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'foto', titulo: '', texto: '', etiquetas: [] });
  const [archivo, setArchivo] = useState(null);
  const [etiquetaNueva, setEtiquetaNueva] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const cargar = () => api.get('/marketing/biblioteca').then((r) => setItems(r.data.data));
  useEffect(cargar, []);

  const guardar = async () => {
    setSubiendo(true);
    const fd = new FormData();
    fd.append('tipo', form.tipo);
    fd.append('titulo', form.titulo);
    if (form.texto) fd.append('texto', form.texto);
    fd.append('etiquetas', JSON.stringify(form.etiquetas));
    if (archivo) fd.append('archivo', archivo);
    try {
      await api.post('/marketing/biblioteca', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({ tipo: 'foto', titulo: '', texto: '', etiquetas: [] });
      setArchivo(null);
      setMostrarForm(false);
      cargar();
    } catch (e) { alert('No se pudo guardar'); }
    setSubiendo(false);
  };
  const eliminar = async (id) => { if (confirm('¿Eliminar este contenido?')) { await api.delete(`/marketing/biblioteca/${id}`); cargar(); } };
  const agregarEtiqueta = () => { if (etiquetaNueva.trim()) { setForm({ ...form, etiquetas: [...form.etiquetas, etiquetaNueva.trim()] }); setEtiquetaNueva(''); } };

  const ICONO_TIPO = { foto: '🖼️', video: '🎬', texto: '📝', documento: '📄' };

  return (
    <div className="space-y-3">
      <button onClick={() => setMostrarForm(!mostrarForm)} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
        {mostrarForm ? 'Cancelar' : '+ Agregar contenido'}
      </button>
      {mostrarForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            {Object.entries(ICONO_TIPO).map(([k, ic]) => <option key={k} value={k}>{ic} {k}</option>)}
          </select>
          <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          {form.tipo === 'texto' ? (
            <textarea placeholder="Texto" value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-24" />
          ) : (
            <input type="file" onChange={(e) => setArchivo(e.target.files[0])}
              className="w-full text-xs text-slate-400" />
          )}
          <div className="flex gap-1.5 flex-wrap">
            {form.etiquetas.map((et, i) => <span key={i} className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full">#{et}</span>)}
          </div>
          <div className="flex gap-1.5">
            <input placeholder="Etiqueta" value={etiquetaNueva} onChange={(e) => setEtiquetaNueva(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEtiqueta())}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
            <button onClick={agregarEtiqueta} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">+</button>
          </div>
          <button onClick={guardar} disabled={!form.titulo || subiendo} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">
            {subiendo ? '⏳ Subiendo...' : 'Guardar'}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-center text-slate-500 py-8">Sin contenido guardado todavía</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((c) => (
            <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
              {c.url && c.tipo === 'foto' && <img src={c.url} alt={c.titulo} className="w-full h-24 object-cover rounded-lg mb-2" />}
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-white">{ICONO_TIPO[c.tipo]} {c.titulo}</span>
                <button onClick={() => eliminar(c.id)} className="text-red-500 text-[10px]">🗑️</button>
              </div>
              {c.url && c.tipo !== 'foto' && <a href={c.url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 font-bold">Ver archivo →</a>}
              {c.texto && <p className="text-[10px] text-slate-400 mt-1 line-clamp-3">{c.texto}</p>}
              <div className="flex gap-1 flex-wrap mt-1.5">
                {(c.etiquetas || []).map((et, i) => <span key={i} className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">#{et}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 🆕 Generación de discursos/argumentarios/etc. con IA — siempre borrador, siempre a revisar. */
function PanelGeneracionIA() {
  const [tipoContenido, setTipoContenido] = useState('discurso');
  const [tema, setTema] = useState('');
  const [audiencia, setAudiencia] = useState('');
  const [tono, setTono] = useState('');
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState('');
  const [error, setError] = useState('');

  const generar = async () => {
    if (!tema.trim()) return;
    setGenerando(true);
    setError('');
    setResultado('');
    try {
      const { data } = await api.post('/marketing/generar-contenido-ia', { tipo_contenido: tipoContenido, tema, audiencia: audiencia || undefined, tono: tono || undefined });
      setResultado(data.data.contenido);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo generar el contenido'); }
    setGenerando(false);
  };

  const copiar = () => { navigator.clipboard.writeText(resultado); alert('Copiado ✅'); };
  const guardarEnBiblioteca = async () => {
    const fd = new FormData();
    fd.append('tipo', 'texto');
    fd.append('titulo', `${TIPO_CONTENIDO_LABEL[tipoContenido].label} — ${tema.slice(0, 50)}`);
    fd.append('texto', resultado);
    fd.append('etiquetas', JSON.stringify(['generado-ia', tipoContenido]));
    await api.post('/marketing/biblioteca', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    alert('✅ Guardado en tu Biblioteca de contenido');
  };

  return (
    <div className="space-y-3">
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-[11px] text-purple-300">
        🤖 Todo lo que genera la IA aquí es un <strong>borrador</strong> — revísalo y ajústalo antes de usarlo en público. Nunca inventa cifras ni ataca a nadie por nombre.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(TIPO_CONTENIDO_LABEL).map(([k, v]) => (
          <button key={k} onClick={() => setTipoContenido(k)} className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${tipoContenido === k ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {v.ic} {v.label}
          </button>
        ))}
      </div>
      <textarea placeholder="¿Sobre qué tema? (ej: propuesta de alumbrado público en la colonia Centro)" value={tema} onChange={(e) => setTema(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm min-h-16" />
      <div className="flex gap-2">
        <input placeholder="Audiencia (opcional, ej: jóvenes, comerciantes)" value={audiencia} onChange={(e) => setAudiencia(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Tono (opcional, ej: cercano, formal)" value={tono} onChange={(e) => setTono(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
      </div>
      <button onClick={generar} disabled={!tema.trim() || generando} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold disabled:opacity-40">
        {generando ? '⏳ Generando...' : `✨ Generar ${TIPO_CONTENIDO_LABEL[tipoContenido].label}`}
      </button>
      {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
      {resultado && (
        <div className="bg-slate-900/60 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{resultado}</p>
          <div className="flex gap-2">
            <button onClick={copiar} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">📋 Copiar</button>
            <button onClick={guardarEnBiblioteca} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">💾 Guardar en Biblioteca</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Marketing() {
  const [tab, setTab] = useState('nuevo');
  const [envios, setEnvios] = useState([]);
  const [envioDetalle, setEnvioDetalle] = useState(null);

  const cargarEnvios = () => api.get('/marketing/envios').then((r) => setEnvios(r.data.data));
  useEffect(cargarEnvios, []);

  const TABS = [
    { id: 'nuevo', ic: '📤', label: 'Nuevo envío' },
    { id: 'historial', ic: '📜', label: 'Historial' },
    { id: 'plantillas', ic: '📝', label: 'Plantillas' },
    { id: 'numeros', ic: '📱', label: 'Números' },
    { id: 'ia', ic: '✨', label: 'Discursos con IA' },
    { id: 'boletines', ic: '📰', label: 'Boletines' },
    { id: 'periodistas', ic: '🎙️', label: 'Periodistas' },
    { id: 'biblioteca', ic: '📚', label: 'Biblioteca' },
    { id: 'monitoreo-redes', ic: '📱', label: 'Monitoreo de Redes' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">📢 Comunicación y Marketing</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t.ic} {t.label}
            </button>
          ))}
        </div>

        {tab === 'nuevo' && <PanelNuevoEnvio onEnviado={cargarEnvios} />}
        {tab === 'numeros' && <PanelNumeros />}
        {tab === 'plantillas' && <PanelPlantillas />}
        {tab === 'ia' && <PanelGeneracionIA />}
        {tab === 'boletines' && <PanelBoletines />}
        {tab === 'periodistas' && <PanelPeriodistas />}
        {tab === 'biblioteca' && <PanelBiblioteca />}
        {tab === 'monitoreo-redes' && <PanelMonitoreoRedes />}

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

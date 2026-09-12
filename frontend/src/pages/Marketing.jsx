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
  // 🆕 Imágenes que se agregan al mensaje — hasta 5, cada una sube a
  // un lugar público y WhatsApp les muestra su vista previa sola.
  const [imagenes, setImagenes] = useState([]);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [previa, setPrevia] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // 🆕 Asesor de segmentos — analiza tus promovidos reales y sugiere
  // a quién conviene mandarle qué tipo de mensaje, en vez de armar un
  // filtro a ciegas cada vez.
  const [segmentos, setSegmentos] = useState([]);
  const [segmentoActivo, setSegmentoActivo] = useState(null);

  useEffect(() => {
    api.get('/marketing/segmentos-sugeridos').then((r) => setSegmentos(r.data.data)).catch(() => setSegmentos([]));
  }, []);

  const elegirSegmento = (seg) => {
    setSegmentoActivo(seg.id);
    setAudienciaTipo('promovidos');
    setFiltros(seg.filtro);
  };

  const previsualizar = async () => {
    const { data } = await api.post('/marketing/audiencia/previsualizar', { tipo: audienciaTipo, filtros });
    setPrevia(data);
  };
  useEffect(() => { previsualizar(); }, [audienciaTipo, JSON.stringify(filtros)]);

  const subirImagen = async (archivo) => {
    if (imagenes.length >= 5) { alert('Máximo 5 imágenes por mensaje'); return; }
    setSubiendoImagen(true);
    const fd = new FormData();
    fd.append('imagen', archivo);
    try {
      const { data } = await api.post('/marketing/subir-imagen-envio', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImagenes((prev) => [...prev, data.data.url]);
    } catch (e) { alert(e.response?.data?.error || 'No se pudo subir la imagen'); }
    setSubiendoImagen(false);
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post('/marketing/envios', {
        titulo, mensaje_base: mensaje, audiencia_tipo: audienciaTipo, audiencia_filtro: filtros, imagenes,
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
        <p className="text-sm text-emerald-300 font-bold">Cola lista con {resultado.total} personas</p>
        <button onClick={() => { setResultado(null); setImagenes([]); }} className="text-xs font-bold text-indigo-400">Hacer otro envío</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input placeholder="Título del envío (interno, para identificarlo)" value={titulo} onChange={(e) => setTitulo(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-xs font-bold text-emerald-300">🆓 Modo enlaces</span>
        <Ayuda posicion="abajo" texto="El sistema arma la lista de enlaces personalizados — cada persona de tu equipo abre su propio WhatsApp y toca 'enviar' uno por uno, sin costo. Es la única forma segura de mandar mensajes de campaña, ya que sale de cuentas personales reales en vez de una API automática (que Meta puede suspender si detecta mensajes a gente sin opt-in específico de WhatsApp)." />
      </div>

      {/* 🆕 Asesor de segmentos — sugiere a quién mandarle qué tipo
          de mensaje, en vez de armar el filtro completamente a
          ciegas. Solo se muestran segmentos que de verdad tienen
          gente (el backend ya filtra los de 0 personas). */}
      {segmentos.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-500 font-bold uppercase">💡 A quién conviene mandarle mensaje ahora</div>
          {segmentos.map((seg) => (
            <button key={seg.id} onClick={() => elegirSegmento(seg)}
              className={`w-full text-left rounded-xl p-3 border transition-colors ${segmentoActivo === seg.id ? 'bg-purple-500/20 border-purple-500' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{seg.nombre}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{seg.total} personas</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{seg.razon}</p>
              <div className="text-[10px] text-indigo-400 mt-1.5">
                {TIPO_CONTENIDO_LABEL[seg.tipo_mensaje_sugerido]?.ic} Tipo de mensaje sugerido: {TIPO_CONTENIDO_LABEL[seg.tipo_mensaje_sugerido]?.label}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => { setAudienciaTipo('promovidos'); setSegmentoActivo(null); }} className={`flex-1 py-2 rounded-lg text-xs font-bold ${audienciaTipo === 'promovidos' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🤝 Promovidos</button>
        <button onClick={() => { setAudienciaTipo('estructura'); setSegmentoActivo(null); }} className={`flex-1 py-2 rounded-lg text-xs font-bold ${audienciaTipo === 'estructura' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗂️ Estructura</button>
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

      {/* 🆕 Imágenes del mensaje — hasta 5, cada una se ve como una
          vista previa en el WhatsApp de quien la reciba. */}
      {imagenes.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {imagenes.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
              <button onClick={() => setImagenes((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}
      {imagenes.length < 5 && (
        <label className={`block rounded-xl p-3 cursor-pointer ${subiendoImagen ? 'bg-slate-700' : 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30'} transition-transform active:scale-[0.98]`}>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl">{subiendoImagen ? '⏳' : '🖼️'}</span>
            <span className="text-xs font-bold text-white">{subiendoImagen ? 'Subiendo...' : `Agregar imagen (${imagenes.length}/5)`}</span>
          </div>
          <input type="file" accept="image/*" className="hidden" disabled={subiendoImagen}
            onChange={(e) => e.target.files[0] && subirImagen(e.target.files[0])} />
        </label>
      )}

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

/** 🆕 Biblioteca de contenido — fotos, videos, textos y documentos reutilizables. */
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
            <label className="block rounded-xl p-4 cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30 transition-transform active:scale-[0.98]">
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl">📎</span>
                <div className="text-left">
                  <div className="text-sm font-black text-white">{archivo ? archivo.name : 'Elegir archivo'}</div>
                  <div className="text-[10px] text-indigo-100">{archivo ? 'Toca para cambiarlo' : 'Toca aquí para subir imagen, PDF o video'}</div>
                </div>
              </div>
              <input type="file" onChange={(e) => setArchivo(e.target.files[0])} className="hidden" />
            </label>
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
    { id: 'ia', ic: '✨', label: 'Discursos con IA' },
    { id: 'biblioteca', ic: '📚', label: 'Biblioteca' },
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
        {tab === 'plantillas' && <PanelPlantillas />}
        {tab === 'ia' && <PanelGeneracionIA />}
        {tab === 'biblioteca' && <PanelBiblioteca />}

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

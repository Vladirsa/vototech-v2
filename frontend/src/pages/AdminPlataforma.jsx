import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/authStore';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const TIPOS_ELECCION = [
  { id: 'ayuntamiento', label: '🏛️ Presidente Municipal' },
  { id: 'pres_comunidad', label: '🏠 Presidente de Comunidad' },
  { id: 'dip_local', label: '⚖️ Diputado Local' },
  { id: 'dip_federal', label: '🏢 Diputado Federal' },
  { id: 'senador', label: '🏦 Senador' },
  { id: 'gobernador', label: '🎖️ Gobernador' },
];

/**
 * Panel exclusivo del dueño de VotoTech — protegido con una clave
 * secreta (no es parte del sistema normal de usuarios/campañas).
 */
export default function AdminPlataforma() {
  const [clave, setClave] = useState(sessionStorage.getItem('vt_admin_key') || '');
  const [verClave, setVerClave] = useState(false);
  const [autenticado, setAutenticado] = useState(false);
  const [error, setError] = useState('');
  const [campanas, setCampanas] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [notaCodigo, setNotaCodigo] = useState('');
  const navigate = useNavigate();
  const iniciarSesion = useAuth((s) => s.iniciarSesion);

  const headers = { 'x-admin-key': clave };

  const cargar = async () => {
    try {
      const [c, co, m] = await Promise.all([
        axios.get(`${API_URL}/admin/campanas`, { headers }),
        axios.get(`${API_URL}/admin/codigos-acceso`, { headers }),
        axios.get(`${API_URL}/admin/municipios`, { headers }),
      ]);
      setCampanas(c.data.data);
      setCodigos(co.data.data);
      setMunicipios(m.data.data);
      setAutenticado(true);
      sessionStorage.setItem('vt_admin_key', clave);
      setError('');
    } catch (e) {
      if (e.response?.status === 403) {
        setError('❌ La clave que escribiste no coincide con SUPER_ADMIN_KEY en el servidor.');
      } else if (e.response?.status === 500) {
        setError('⚠️ El servidor no tiene configurada SUPER_ADMIN_KEY todavía (revisa las variables de entorno en Render).');
      } else if (!e.response) {
        setError(`⚠️ No se pudo conectar con el servidor (${API_URL}). Verifica que el backend esté encendido.`);
      } else {
        setError(`⚠️ Error inesperado: ${e.response?.data?.error || e.message}`);
      }
      setAutenticado(false);
    }
  };

  useEffect(() => { if (clave) cargar(); }, []);

  const generarCodigo = async () => {
    await axios.post(`${API_URL}/admin/codigos-acceso`, { nota: notaCodigo }, { headers });
    setNotaCodigo('');
    cargar();
  };

  const borrarCodigo = async (id) => {
    if (!confirm('¿Borrar este código? Ya no se va a poder usar.')) return;
    await axios.delete(`${API_URL}/admin/codigos-acceso/${id}`, { headers });
    cargar();
  };

  const aprobar = async (id) => { await axios.patch(`${API_URL}/admin/campanas/${id}/aprobar`, {}, { headers }); cargar(); };
  const rechazar = async (id) => { await axios.patch(`${API_URL}/admin/campanas/${id}/rechazar`, {}, { headers }); cargar(); };

  const renovar = async (id, meses) => {
    await axios.patch(`${API_URL}/admin/campanas/${id}/renovar`, { meses }, { headers });
    cargar();
  };

  const pausar = async (id, nombre) => {
    const motivo = prompt(`¿Por qué pausas la campaña de "${nombre}"? (opcional, queda en la bitácora)`);
    if (motivo === null) return; // canceló
    await axios.patch(`${API_URL}/admin/campanas/${id}/pausar`, { motivo }, { headers });
    cargar();
  };

  const reactivar = async (id) => {
    await axios.patch(`${API_URL}/admin/campanas/${id}/reactivar`, {}, { headers });
    cargar();
  };

  const borrarCampana = async (id, nombre) => {
    if (!confirm(`¿Borrar la campaña de "${nombre}" POR COMPLETO? Se pierden todos sus promovidos, estructura, todo. Esto NO se puede deshacer.`)) return;
    if (!confirm('Confírmalo una vez más — esto es permanente. ¿Seguro?')) return;
    const { data } = await axios.delete(`${API_URL}/admin/campanas/${id}`, { headers });
    alert(data.mensaje);
    cargar();
  };

  const continuarComo = async (id) => {
    const { data } = await axios.post(`${API_URL}/admin/campanas/${id}/continuar`, {}, { headers });
    iniciarSesion(data.data.token, { nombre: data.data.nombre, rol: 'candidato' }, data.data.subdominio);
    navigate('/dashboard');
  };

  const [creandoDemo, setCreandoDemo] = useState(false);
  const [mensajeDemo, setMensajeDemo] = useState('');
  const [tipoEleccionDemo, setTipoEleccionDemo] = useState('ayuntamiento');
  const [municipioDemo, setMunicipioDemo] = useState(3);
  const [distritoDemo, setDistritoDemo] = useState(1);

  const esDistrito = tipoEleccionDemo === 'dip_local' || tipoEleccionDemo === 'dip_federal';
  const esEstatal = tipoEleccionDemo === 'gobernador' || tipoEleccionDemo === 'senador';

  const crearDemo = async () => {
    setCreandoDemo(true);
    setMensajeDemo('');
    try {
      const nombreMun = municipios.find((m) => m.clave_ine === parseInt(municipioDemo))?.nombre || '';
      const { data } = await axios.post(`${API_URL}/admin/crear-demo`, {
        tipoEleccion: tipoEleccionDemo,
        municipioClaveIne: esDistrito || esEstatal ? undefined : municipioDemo,
        nombreMunicipio: nombreMun,
        distritoNumero: esDistrito ? distritoDemo : undefined,
      }, { headers });
      setMensajeDemo(`✅ Demo creada — Correo: ${data.data.email} · Contraseña: ${data.data.password}`);
      cargar();
    } catch (e) {
      setMensajeDemo('⚠️ Error al crear la demo: ' + (e.response?.data?.error || e.message));
    }
    setCreandoDemo(false);
  };

  const [reparando, setReparando] = useState(false);
  const [mensajeReparar, setMensajeReparar] = useState('');
  const [bitacora, setBitacora] = useState([]);
  const [mostrarBitacora, setMostrarBitacora] = useState(false);

  useEffect(() => {
    if (autenticado) axios.get(`${API_URL}/admin/bitacora`, { headers }).then((r) => setBitacora(r.data.data)).catch(() => {});
  }, [autenticado]);
  const repararDatos = async () => {
    setReparando(true);
    setMensajeReparar('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/reparar-lista-nominal`, {}, { headers });
      setMensajeReparar(`✅ ${data.mensaje}`);
    } catch (e) {
      setMensajeReparar('⚠️ Error: ' + (e.response?.data?.error || e.message));
    }
    setReparando(false);
  };

  const [generandoCasillas, setGenerandoCasillas] = useState(false);
  const [mensajeCasillas, setMensajeCasillas] = useState('');
  const generarCasillasOficiales = async () => {
    setGenerandoCasillas(true);
    setMensajeCasillas('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/generar-casillas-oficiales`, {}, { headers });
      setMensajeCasillas(data.mensaje);
    } catch (e) {
      setMensajeCasillas('⚠️ Error: ' + (e.response?.data?.error || e.message));
    }
    setGenerandoCasillas(false);
  };

  // 🆕 Importar calles del INEGI — botón, sin necesitar Shell de Render
  const [importandoCalles, setImportandoCalles] = useState(false);
  const [mensajeCalles, setMensajeCalles] = useState('');
  const importarCalles = async () => {
    setImportandoCalles(true);
    setMensajeCalles('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/importar-calles-inegi`, {}, { headers });
      setMensajeCalles(`✅ Capa usada: "${data.capaUsada}" — ${data.cargadas} calles cargadas de ${data.totalDescargadas} descargadas (${data.sinNombre} sin nombre, ${data.errores} con error).`);
    } catch (e) {
      const detalle = e.response?.data;
      if (detalle?.capasDisponibles) {
        setMensajeCalles(`⚠️ No se detectó la capa de vialidades automáticamente. Capas disponibles: ${detalle.capasDisponibles.join(', ')}\n\nCopia este listado y pásaselo a Claude para ajustar el script.`);
      } else {
        setMensajeCalles('⚠️ Error: ' + (detalle?.error || e.message));
      }
    }
    setImportandoCalles(false);
  };

  const [cargandoAgregados, setCargandoAgregados] = useState(false);
  const [mensajeAgregados, setMensajeAgregados] = useState('');
  const [estadoCarga, setEstadoCarga] = useState(29);
  const [tipoEleccionCarga, setTipoEleccionCarga] = useState('senador');
  const [anioCarga, setAnioCarga] = useState(2024);
  const [archivoResultados, setArchivoResultados] = useState(null);
  const [archivoAfiliados, setArchivoAfiliados] = useState(null);
  const [subiendoResultados, setSubiendoResultados] = useState(false);
  const [subiendoAfiliados, setSubiendoAfiliados] = useState(false);
  const [mensajeCargaResultados, setMensajeCargaResultados] = useState('');
  const [mensajeCargaAfiliados, setMensajeCargaAfiliados] = useState('');

  // ── BLOG PÚBLICO — artículos, PDFs y videos para SEO ──
  const [blogPosts, setBlogPosts] = useState([]);
  const [mostrarFormBlog, setMostrarFormBlog] = useState(false);
  const [editandoBlogId, setEditandoBlogId] = useState(null);
  const [formBlog, setFormBlog] = useState({ titulo: '', tipo: 'articulo', resumen: '', contenido: '', url_video: '', etiquetas: '', meta_descripcion: '', publicado: false });
  const [archivoBlog, setArchivoBlog] = useState(null);
  const [subiendoBlog, setSubiendoBlog] = useState(false);
  const [mensajeBlog, setMensajeBlog] = useState('');
  // 🆕 Imagen de portada — ahora se sube como archivo, no como URL de texto
  const [archivoPortada, setArchivoPortada] = useState(null);
  const [previewPortada, setPreviewPortada] = useState(null);
  // 🆕 Referencia al textarea de contenido, para saber dónde insertar
  // el formato (negrita, imagen, etc.) exactamente donde está el cursor.
  const refContenido = useRef(null);
  const [subiendoImagenInline, setSubiendoImagenInline] = useState(false);

  const cargarBlog = async () => {
    const { data } = await axios.get(`${API_URL}/blog/admin`, { headers });
    setBlogPosts(data.data);
  };
  useEffect(() => { if (autenticado) cargarBlog(); }, [autenticado]);

  const limpiarFormBlog = () => {
    setFormBlog({ titulo: '', tipo: 'articulo', resumen: '', contenido: '', url_video: '', etiquetas: '', meta_descripcion: '', publicado: false });
    setArchivoBlog(null);
    setArchivoPortada(null);
    setPreviewPortada(null);
    setEditandoBlogId(null);
    setMostrarFormBlog(false);
  };

  const editarBlog = (post) => {
    setFormBlog({
      titulo: post.titulo, tipo: post.tipo, resumen: post.resumen || '', contenido: post.contenido || '',
      url_video: post.tipo === 'video' ? post.url_archivo || '' : '', etiquetas: (post.etiquetas || []).join(', '),
      meta_descripcion: post.meta_descripcion || '', publicado: post.publicado,
    });
    setPreviewPortada(post.imagen_portada || null);
    setArchivoPortada(null);
    setEditandoBlogId(post.id);
    setMostrarFormBlog(true);
  };

  // 🆕 Al elegir un archivo de portada, se muestra una vista previa
  // de inmediato (sin esperar a guardar) para confirmar que sí es la imagen correcta.
  const elegirPortada = (archivo) => {
    setArchivoPortada(archivo);
    if (archivo) setPreviewPortada(URL.createObjectURL(archivo));
  };

  // 🆕 Inserta texto de formato (Markdown) en el textarea, justo donde
  // está el cursor — o envolviendo el texto seleccionado, si hay algo
  // seleccionado (ej. seleccionas una palabra y tocas "Negrita").
  const insertarFormato = (antes, despues = '') => {
    const textarea = refContenido.current;
    if (!textarea) return;
    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const textoActual = formBlog.contenido || '';
    const seleccionado = textoActual.slice(inicio, fin);
    const nuevoTexto = textoActual.slice(0, inicio) + antes + seleccionado + despues + textoActual.slice(fin);
    setFormBlog({ ...formBlog, contenido: nuevoTexto });
    // Regresa el foco y el cursor a un lugar razonable después de insertar
    setTimeout(() => {
      textarea.focus();
      const nuevaPos = inicio + antes.length + seleccionado.length + despues.length;
      textarea.setSelectionRange(nuevaPos, nuevaPos);
    }, 0);
  };

  // 🆕 Botón "📷 Insertar imagen" — sube la imagen de una vez y mete
  // la sintaxis de Markdown (![descripción](url)) en el cursor.
  const insertarImagenEnContenido = async (archivo) => {
    if (!archivo) return;
    setSubiendoImagenInline(true);
    try {
      const fd = new FormData();
      fd.append('imagen', archivo);
      const { data } = await axios.post(`${API_URL}/blog/admin/subir-imagen`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      insertarFormato(`\n\n![Descripción de la imagen](${data.url})\n\n`);
    } catch (e) {
      alert('No se pudo subir la imagen: ' + (e.response?.data?.error || e.message));
    }
    setSubiendoImagenInline(false);
  };

  const guardarBlog = async () => {
    setSubiendoBlog(true);
    setMensajeBlog('');
    const fd = new FormData();
    Object.entries(formBlog).forEach(([k, v]) => fd.append(k, v));
    if (archivoBlog) fd.append('archivo', archivoBlog);
    if (archivoPortada) fd.append('imagen_portada_archivo', archivoPortada); // 🆕
    try {
      if (editandoBlogId) {
        await axios.patch(`${API_URL}/blog/admin/${editandoBlogId}`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      } else {
        await axios.post(`${API_URL}/blog/admin`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      }
      setMensajeBlog('✅ Guardado correctamente');
      limpiarFormBlog();
      cargarBlog();
    } catch (e) {
      setMensajeBlog('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSubiendoBlog(false);
  };

  const alternarPublicadoBlog = async (post) => {
    const fd = new FormData();
    fd.append('publicado', (!post.publicado).toString());
    await axios.patch(`${API_URL}/blog/admin/${post.id}`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
    cargarBlog();
  };

  const eliminarBlog = async (id) => {
    if (!confirm('¿Borrar esta publicación para siempre?')) return;
    await axios.delete(`${API_URL}/blog/admin/${id}`, { headers });
    cargarBlog();
  };
  const [resumenDatos, setResumenDatos] = useState(null);

  // ── EXPANSIÓN A OTRO ESTADO — crear estado, subir municipios, subir cartografía ──
  const [estadosDisponibles, setEstadosDisponibles] = useState([]);
  const [mostrarExpansion, setMostrarExpansion] = useState(false);
  const [nuevoEstadoId, setNuevoEstadoId] = useState('');
  const [nuevoEstadoNombre, setNuevoEstadoNombre] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState('');
  const [archivoMunicipios, setArchivoMunicipios] = useState(null);
  const [archivoCartografia, setArchivoCartografia] = useState(null);
  const [estadoParaCartografia, setEstadoParaCartografia] = useState('');
  const [subiendoExpansion, setSubiendoExpansion] = useState(false);
  const [mensajeExpansion, setMensajeExpansion] = useState('');

  const cargarEstados = async () => {
    const { data } = await axios.get(`${API_URL}/admin/estados`, { headers });
    setEstadosDisponibles(data.data);
  };
  useEffect(() => { if (mostrarExpansion) cargarEstados(); }, [mostrarExpansion]);

  const crearEstado = async () => {
    setMensajeEstado('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/estados`, { id: parseInt(nuevoEstadoId), nombre: nuevoEstadoNombre }, { headers });
      setMensajeEstado('✅ ' + data.mensaje);
      setNuevoEstadoId(''); setNuevoEstadoNombre('');
      cargarEstados();
    } catch (e) {
      setMensajeEstado('⚠️ ' + (e.response?.data?.error || e.message));
    }
  };

  const subirMunicipiosNuevoEstado = async () => {
    if (!archivoMunicipios || !estadoParaCartografia) return;
    setSubiendoExpansion(true);
    setMensajeExpansion('');
    const fd = new FormData();
    fd.append('archivo', archivoMunicipios);
    fd.append('estado_id', estadoParaCartografia);
    try {
      const { data } = await axios.post(`${API_URL}/admin/subir-municipios`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setMensajeExpansion('✅ Municipios: ' + data.mensaje);
    } catch (e) {
      setMensajeExpansion('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSubiendoExpansion(false);
  };

  const subirCartografiaNuevoEstado = async () => {
    if (!archivoCartografia || !estadoParaCartografia) return;
    setSubiendoExpansion(true);
    setMensajeExpansion('');
    const fd = new FormData();
    fd.append('archivo', archivoCartografia);
    fd.append('estado_id', estadoParaCartografia);
    try {
      const { data } = await axios.post(`${API_URL}/admin/subir-cartografia`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setMensajeExpansion('✅ Cartografía: ' + data.mensaje);
    } catch (e) {
      setMensajeExpansion('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSubiendoExpansion(false);
  };

  const cargarResumenDatos = async (estId) => {
    const { data } = await axios.get(`${API_URL}/admin/resumen-datos/${estId}`, { headers });
    setResumenDatos(data.data);
  };
  useEffect(() => { if (autenticado) cargarResumenDatos(estadoCarga); }, [estadoCarga, autenticado]);

  const subirResultados = async () => {
    if (!archivoResultados) return;
    setSubiendoResultados(true);
    setMensajeCargaResultados('');
    const fd = new FormData();
    fd.append('archivo', archivoResultados);
    fd.append('estado_id', estadoCarga);
    fd.append('tipo_eleccion', tipoEleccionCarga);
    fd.append('anio', anioCarga);
    try {
      const { data } = await axios.post(`${API_URL}/admin/subir-resultados-historicos`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setMensajeCargaResultados(data.mensaje);
      cargarResumenDatos(estadoCarga);
    } catch (e) {
      setMensajeCargaResultados('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSubiendoResultados(false);
  };

  const subirAfiliados = async () => {
    if (!archivoAfiliados) return;
    setSubiendoAfiliados(true);
    setMensajeCargaAfiliados('');
    const fd = new FormData();
    fd.append('archivo', archivoAfiliados);
    fd.append('estado_id', estadoCarga);
    try {
      const { data } = await axios.post(`${API_URL}/admin/subir-afiliados`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setMensajeCargaAfiliados(data.mensaje);
      cargarResumenDatos(estadoCarga);
    } catch (e) {
      setMensajeCargaAfiliados('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSubiendoAfiliados(false);
  };

  const cargarAgregados2024 = async () => {
    setCargandoAgregados(true);
    setMensajeAgregados('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/cargar-agregados-2024`, {}, { headers });
      setMensajeAgregados(data.mensaje);
    } catch (e) {
      setMensajeAgregados('⚠️ Error: ' + (e.response?.data?.error || e.message));
    }
    setCargandoAgregados(false);
  };

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h1 className="text-lg font-black text-white">🔐 Panel VotoTech</h1>
          {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
          <div className="relative">
            <input type={verClave ? 'text' : 'password'} placeholder="Clave de administrador" value={clave} onChange={(e) => setClave(e.target.value)}
              className="w-full px-3 py-2.5 pr-10 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button type="button" onClick={() => setVerClave(!verClave)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm px-1">
              {verClave ? '🙈' : '👁️'}
            </button>
          </div>
          <button onClick={cargar} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Entrar</button>
        </div>
      </div>
    );
  }

  const ESTADO_COLOR = { pendiente: 'text-amber-400 bg-amber-500/10', aprobada: 'text-emerald-400 bg-emerald-500/10', rechazada: 'text-red-400 bg-red-500/10' };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-2xl font-black text-white">🔐 Panel de Administración VotoTech</h1>

        {/* Reparación puntual de datos incompletos */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-300">🔧 ¿Lista nominal en 0 en las fichas técnicas?</div>
            <div className="text-[10px] text-slate-500">Corrige bases cargadas antes de esta actualización</div>
          </div>
          <button onClick={repararDatos} disabled={reparando} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50">
            {reparando ? '⏳...' : 'Reparar'}
          </button>
        </div>
        {mensajeReparar && <div className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-2">{mensajeReparar}</div>}

        {/* Botones de mantenimiento de datos — para cuando no hay
            acceso a terminal (plan gratuito de Render, sin Shell) */}
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-indigo-300">🗳️ Generar base de casillas oficiales</div>
            <div className="text-[10px] text-slate-500">Estima las casillas de las 634 secciones (regla INE, 750 electores) — seguro de correr más de una vez</div>
          </div>
          <button onClick={generarCasillasOficiales} disabled={generandoCasillas} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex-shrink-0">
            {generandoCasillas ? '⏳...' : 'Generar'}
          </button>
        </div>
        {mensajeCasillas && <div className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-2">{mensajeCasillas}</div>}

        {/* 🆕 Catálogo de calles del INEGI — para que el buscador de
            direcciones (BuscadorCalle) tenga sus propios datos, sin
            depender de una consulta en vivo a Nominatim cada vez. */}
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-indigo-300">🛣️ Importar calles del INEGI (Tlaxcala)</div>
            <div className="text-[10px] text-slate-500">Descarga el catálogo oficial de vialidades — tarda varios minutos, no cierres la pestaña</div>
          </div>
          <button onClick={importarCalles} disabled={importandoCalles} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex-shrink-0">
            {importandoCalles ? '⏳ Descargando...' : 'Importar'}
          </button>
        </div>
        {mensajeCalles && <div className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-2 whitespace-pre-wrap">{mensajeCalles}</div>}

        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-indigo-300">📊 Cargar Senado/Dip. Federal/Dip. Local/Ayuntamientos 2024</div>
            <div className="text-[10px] text-slate-500">Resultados agregados reales 2024 — seguro de correr más de una vez</div>
          </div>
          <button onClick={cargarAgregados2024} disabled={cargandoAgregados} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex-shrink-0">
            {cargandoAgregados ? '⏳...' : 'Cargar'}
          </button>
        </div>
        {mensajeAgregados && <div className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-2">{mensajeAgregados}</div>}

        {/* ── CARGA DE DATOS POR ESTADO — resultados y afiliados vía CSV ── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">📂 Carga de Datos por Estado</h3>
            <p className="text-[10px] text-slate-500">Sube archivos CSV para llenar resultados históricos o afiliados de cualquier estado — sin necesitar código.</p>
          </div>

          <div className="flex gap-2">
            <select value={estadoCarga} onChange={(e) => setEstadoCarga(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
              <option value={29}>Tlaxcala (29)</option>
            </select>
            {resumenDatos && (
              <div className="flex-1 flex items-center gap-3 text-[10px] text-slate-400">
                <span>{resumenDatos.total_secciones} secciones</span>
                <span>·</span>
                <span>{resumenDatos.total_afiliados} afiliados</span>
              </div>
            )}
          </div>

          {resumenDatos?.resultados_por_tipo?.length > 0 && (
            <div className="bg-slate-800/60 rounded-lg p-2.5">
              <p className="text-[9px] text-slate-500 font-bold uppercase mb-1.5">Cobertura actual de resultados</p>
              <div className="flex flex-wrap gap-1.5">
                {resumenDatos.resultados_por_tipo.map((r, i) => (
                  <span key={i} className="text-[9px] bg-slate-900 text-slate-300 rounded-full px-2 py-1">
                    {r.tipo_eleccion} {r.anio}: {r.secciones_con_dato} secc.
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resultados históricos por sección */}
          <div className="border-t border-slate-800 pt-3">
            <p className="text-xs font-bold text-slate-300 mb-2">Resultados históricos por sección</p>
            <p className="text-[9px] text-slate-500 mb-2">CSV con columnas: <code className="text-indigo-300">seccion,partido,votos</code> (lista_nominal opcional)</p>
            <div className="flex gap-2 mb-2">
              <select value={tipoEleccionCarga} onChange={(e) => setTipoEleccionCarga(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[10px]">
                <option value="senador">Senador</option>
                <option value="dip_federal">Dip. Federal</option>
                <option value="dip_local">Dip. Local</option>
                <option value="ayuntamiento">Ayuntamiento</option>
                <option value="pres_comunidad">Pdte. Comunidad</option>
                <option value="gobernador">Gobernador</option>
                <option value="presidencial">Presidencial</option>
              </select>
              <input type="number" value={anioCarga} onChange={(e) => setAnioCarga(parseInt(e.target.value))}
                className="w-20 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[10px]" />
            </div>
            <div className="flex gap-2">
              <input type="file" accept=".csv" onChange={(e) => setArchivoResultados(e.target.files[0])}
                className="flex-1 text-[10px] text-slate-300" />
              <button onClick={subirResultados} disabled={!archivoResultados || subiendoResultados}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 flex-shrink-0">
                {subiendoResultados ? '⏳...' : 'Subir'}
              </button>
            </div>
            {mensajeCargaResultados && <p className="text-[10px] text-slate-300 mt-2">{mensajeCargaResultados}</p>}
          </div>

          {/* Afiliados */}
          <div className="border-t border-slate-800 pt-3">
            <p className="text-xs font-bold text-slate-300 mb-2">Lista de afiliados</p>
            <p className="text-[9px] text-slate-500 mb-2">CSV con columnas: <code className="text-indigo-300">nombre,seccion,telefono,direccion,partido</code> (solo nombre es obligatorio)</p>
            <div className="flex gap-2">
              <input type="file" accept=".csv" onChange={(e) => setArchivoAfiliados(e.target.files[0])}
                className="flex-1 text-[10px] text-slate-300" />
              <button onClick={subirAfiliados} disabled={!archivoAfiliados || subiendoAfiliados}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 flex-shrink-0">
                {subiendoAfiliados ? '⏳...' : 'Subir'}
              </button>
            </div>
            {mensajeCargaAfiliados && <p className="text-[10px] text-slate-300 mt-2">{mensajeCargaAfiliados}</p>}
          </div>
        </div>

        {/* ── BLOG PÚBLICO — artículos, PDFs, videos para SEO ── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">📝 Blog Público (SEO)</h3>
              <p className="text-[10px] text-slate-500">Vive en vototech.com.mx/blog — artículos, PDFs y videos que Google puede indexar.</p>
            </div>
            <button onClick={() => { limpiarFormBlog(); setMostrarFormBlog((v) => !v); }}
              className="px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold flex-shrink-0">
              {mostrarFormBlog ? '✕ Cerrar' : '+ Nueva publicación'}
            </button>
          </div>

          {mostrarFormBlog && (
            <div className="bg-slate-800/60 rounded-lg p-3 space-y-2.5">
              <input placeholder="Título" value={formBlog.titulo} onChange={(e) => setFormBlog({ ...formBlog, titulo: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />

              <div className="flex gap-2">
                <select value={formBlog.tipo} onChange={(e) => setFormBlog({ ...formBlog, tipo: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs">
                  <option value="articulo">📄 Artículo</option>
                  <option value="pdf">📎 PDF</option>
                  <option value="video">🎬 Video</option>
                </select>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-300 px-2">
                  <input type="checkbox" checked={formBlog.publicado} onChange={(e) => setFormBlog({ ...formBlog, publicado: e.target.checked })} />
                  Publicar ya (si no, queda como borrador)
                </label>
              </div>

              {/* 🆕 Imagen de portada — ahora sí se puede subir un archivo real,
                  no solo pegar una URL. Aparece para cualquier tipo de
                  publicación (hasta un PDF o video se ve mejor con portada). */}
              <div>
                <label className="text-[10px] text-slate-500 font-bold block mb-1">🖼️ Imagen de portada (aparece en la tarjeta del blog y al compartir en redes)</label>
                <div className="flex items-center gap-3">
                  {previewPortada && (
                    <img src={previewPortada} alt="Vista previa" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
                  )}
                  <input type="file" accept="image/*" onChange={(e) => elegirPortada(e.target.files[0])}
                    className="flex-1 text-[10px] text-slate-300" />
                </div>
              </div>

              <div>
                {/* 🆕 Antes decía "300 caracteres" sin más contexto —
                    ahora se ve claro que ESTE campo (el resumen corto)
                    tiene límite, pero el de "Contenido" de abajo NO
                    tiene ninguno — es donde va el artículo completo. */}
                <textarea placeholder="Resumen corto — aparece en la tarjeta del blog y como descripción para Google (el artículo completo va en 'Contenido', más abajo, sin límite)"
                  value={formBlog.resumen} maxLength={500}
                  onChange={(e) => setFormBlog({ ...formBlog, resumen: e.target.value })} rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                <p className={`text-[9px] mt-0.5 text-right ${(formBlog.resumen || '').length > 460 ? 'text-amber-400' : 'text-slate-600'}`}>
                  {(formBlog.resumen || '').length} / 500
                </p>
              </div>

              {formBlog.tipo === 'articulo' && (
                <div>
                  {/* 🆕 Barra de formato — inserta sintaxis Markdown simple
                      en el cursor. El sitio público ya la convierte a texto
                      con formato real (negritas, títulos, imágenes). */}
                  <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                    <button type="button" onClick={() => insertarFormato('**', '**')} title="Negrita"
                      className="w-8 h-8 rounded bg-slate-900 border border-slate-700 text-white text-xs font-black">B</button>
                    <button type="button" onClick={() => insertarFormato('*', '*')} title="Cursiva"
                      className="w-8 h-8 rounded bg-slate-900 border border-slate-700 text-white text-xs italic">I</button>
                    <button type="button" onClick={() => insertarFormato('\n## ', '')} title="Título"
                      className="px-2 h-8 rounded bg-slate-900 border border-slate-700 text-white text-xs font-bold">Título</button>
                    <button type="button" onClick={() => insertarFormato('[', '](https://)')} title="Link"
                      className="w-8 h-8 rounded bg-slate-900 border border-slate-700 text-white text-xs">🔗</button>
                    <label className="w-8 h-8 rounded bg-slate-900 border border-slate-700 text-white text-xs flex items-center justify-center cursor-pointer" title="Insertar imagen">
                      {subiendoImagenInline ? '⏳' : '📷'}
                      <input type="file" accept="image/*" className="hidden" disabled={subiendoImagenInline}
                        onChange={(e) => { insertarImagenEnContenido(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                    <span className="text-[9px] text-slate-500 ml-1">Selecciona texto y toca B o I — o pon el cursor donde quieras y toca 📷</span>
                  </div>
                  <textarea ref={refContenido} placeholder="Contenido completo del artículo — usa los botones de arriba para dar formato" value={formBlog.contenido}
                    onChange={(e) => setFormBlog({ ...formBlog, contenido: e.target.value })} rows={10}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono" />
                  <p className="text-[9px] text-slate-600 mt-0.5">{(formBlog.contenido || '').length} caracteres — sin límite, escribe lo que necesites</p>
                </div>
              )}

              {formBlog.tipo === 'pdf' && (
                <div>
                  <input type="file" accept=".pdf" onChange={(e) => setArchivoBlog(e.target.files[0])}
                    className="text-[10px] text-slate-300" />
                  <p className="text-[9px] text-slate-500 mt-1">{editandoBlogId ? 'Solo sube un archivo si quieres reemplazar el actual.' : 'Obligatorio para publicaciones tipo PDF.'}</p>
                </div>
              )}

              {formBlog.tipo === 'video' && (
                <input placeholder="Link de YouTube o Vimeo" value={formBlog.url_video}
                  onChange={(e) => setFormBlog({ ...formBlog, url_video: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              )}

              <input placeholder="Etiquetas separadas por coma (ej: campaña municipal, estructura, día de la elección)" value={formBlog.etiquetas}
                onChange={(e) => setFormBlog({ ...formBlog, etiquetas: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              <p className="text-[9px] text-slate-500 -mt-1.5">Las etiquetas ayudan a que Google entienda de qué trata, y sirven para filtrar en la página del blog.</p>

              <input placeholder="Descripción para Google (si la dejas vacía, usa el resumen)" value={formBlog.meta_descripcion} maxLength={320}
                onChange={(e) => setFormBlog({ ...formBlog, meta_descripcion: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />

              <button onClick={guardarBlog} disabled={subiendoBlog || !formBlog.titulo}
                className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
                {subiendoBlog ? '⏳ Guardando...' : editandoBlogId ? 'Guardar cambios' : 'Crear publicación'}
              </button>
              {mensajeBlog && <p className="text-[10px] text-slate-300">{mensajeBlog}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            {blogPosts.length === 0 ? (
              <p className="text-[10px] text-slate-500">Sin publicaciones todavía.</p>
            ) : blogPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2 gap-2">
                {post.imagen_portada && (
                  <img src={post.imagen_portada} alt="" className="w-9 h-9 object-cover rounded flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">{post.tipo === 'pdf' ? '📎' : post.tipo === 'video' ? '🎬' : '📄'}</span>
                    <span className="text-xs font-bold text-white truncate">{post.titulo}</span>
                  </div>
                  <div className="text-[9px] text-slate-500">{post.publicado ? `✅ Publicado` : '📝 Borrador'} · {post.vistas} vistas · /blog/{post.slug}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => alternarPublicadoBlog(post)} className="text-[10px] px-2 py-1 rounded bg-slate-700 text-slate-300">{post.publicado ? 'Ocultar' : 'Publicar'}</button>
                  <button onClick={() => editarBlog(post)} className="text-[10px] px-2 py-1 rounded bg-slate-700 text-slate-300">Editar</button>
                  <button onClick={() => eliminarBlog(post.id)} className="text-[10px] px-2 py-1 rounded bg-red-900/50 text-red-300">Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── EXPANSIÓN A OTRO ESTADO ── */}
        <div className="bg-slate-900/60 border border-purple-800/40 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">🗺️ Expandir a Otro Estado</h3>
              <p className="text-[10px] text-slate-500">Crea el estado, sube su catálogo de municipios, y su cartografía (mapa oficial de secciones del INE).</p>
            </div>
            <button onClick={() => setMostrarExpansion((v) => !v)}
              className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-bold flex-shrink-0">
              {mostrarExpansion ? '✕ Cerrar' : '+ Nuevo estado'}
            </button>
          </div>

          {mostrarExpansion && (
            <div className="space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-300 mb-2">1. Crear el estado</p>
                <p className="text-[9px] text-slate-500 mb-2">El ID debe ser la clave oficial del INE para ese estado (1-32) — no un número inventado.</p>
                <div className="flex gap-2">
                  <input placeholder="ID (ej. 21 = Puebla)" type="number" value={nuevoEstadoId} onChange={(e) => setNuevoEstadoId(e.target.value)}
                    className="w-32 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                  <input placeholder="Nombre del estado" value={nuevoEstadoNombre} onChange={(e) => setNuevoEstadoNombre(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                  <button onClick={crearEstado} disabled={!nuevoEstadoId || !nuevoEstadoNombre}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40 flex-shrink-0">Crear</button>
                </div>
                {mensajeEstado && <p className="text-[10px] text-slate-300 mt-2">{mensajeEstado}</p>}
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Estado destino para los siguientes pasos</label>
                <select value={estadoParaCartografia} onChange={(e) => setEstadoParaCartografia(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                  <option value="">Selecciona un estado...</option>
                  {estadosDisponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre} (id {e.id})</option>)}
                </select>
              </div>

              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-300 mb-2">2. Subir catálogo de municipios</p>
                <p className="text-[9px] text-slate-500 mb-2">CSV con columnas: <code className="text-purple-300">clave_ine,nombre</code> — necesario ANTES de la cartografía.</p>
                <div className="flex gap-2">
                  <input type="file" accept=".csv" onChange={(e) => setArchivoMunicipios(e.target.files[0])} className="flex-1 text-[10px] text-slate-300" />
                  <button onClick={subirMunicipiosNuevoEstado} disabled={!archivoMunicipios || !estadoParaCartografia || subiendoExpansion}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 flex-shrink-0">Subir</button>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-300 mb-2">3. Subir cartografía (el mapa)</p>
                <p className="text-[9px] text-slate-500 mb-2">Archivo <code className="text-purple-300">.geojson</code> de la Cartografía Electoral del INE — cada sección debe traer <code className="text-purple-300">seccion, municipio, distrito_local, distrito_federal</code> en sus propiedades.</p>
                <div className="flex gap-2">
                  <input type="file" accept=".geojson,.json" onChange={(e) => setArchivoCartografia(e.target.files[0])} className="flex-1 text-[10px] text-slate-300" />
                  <button onClick={subirCartografiaNuevoEstado} disabled={!archivoCartografia || !estadoParaCartografia || subiendoExpansion}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 flex-shrink-0">
                    {subiendoExpansion ? '⏳...' : 'Subir'}
                  </button>
                </div>
              </div>

              {mensajeExpansion && <p className="text-[10px] text-slate-300 bg-slate-800/60 rounded-lg p-2">{mensajeExpansion}</p>}
              <p className="text-[9px] text-slate-500">Después de estos 3 pasos, ya puedes usar el panel de arriba ("📂 Carga de Datos por Estado") para subir resultados históricos y afiliados de este nuevo estado.</p>
            </div>
          )}
        </div>

        <div>
          <button onClick={() => setMostrarBitacora((v) => !v)} className="text-xs font-bold text-slate-400">
            {mostrarBitacora ? '▼' : '▶'} 🕒 Bitácora de acciones ({bitacora.length})
          </button>
          {mostrarBitacora && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto bg-slate-900/40 rounded-lg p-2">
              {bitacora.length === 0 ? (
                <div className="text-[10px] text-slate-500 text-center py-3">Sin acciones registradas todavía</div>
              ) : bitacora.map((b) => {
                const COLOR = { aprobada: 'text-emerald-400', rechazada: 'text-red-400', renovada: 'text-indigo-400', borrada: 'text-slate-500' };
                return (
                  <div key={b.id} className="text-[10px] text-slate-400 flex justify-between">
                    <span><span className={`font-bold ${COLOR[b.accion]}`}>{b.accion}</span> · {b.nombre_campana}{b.detalle && ` (${b.detalle})`}</span>
                    <span>{new Date(b.creado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cuenta demo para presentaciones de venta — ahora personalizable */}
        <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-700/30 rounded-xl p-4 space-y-2.5">
          <h2 className="text-sm font-bold text-white">🎬 Cuenta Demo (para presentaciones)</h2>
          <p className="text-[10px] text-slate-400">Personaliza la demo según a quién vayas a presentar — su municipio, su tipo de elección.</p>

          <div className="grid grid-cols-2 gap-2">
            <select value={tipoEleccionDemo} onChange={(e) => setTipoEleccionDemo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
              {TIPOS_ELECCION.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {esDistrito ? (
              <select value={distritoDemo} onChange={(e) => setDistritoDemo(parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                {Array.from({ length: tipoEleccionDemo === 'dip_federal' ? 3 : 19 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{tipoEleccionDemo === 'dip_federal' ? 'Distrito Federal' : 'Distrito Local'} {n}</option>
                ))}
              </select>
            ) : esEstatal ? (
              <div className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs flex items-center">🗺️ Todo Tlaxcala</div>
            ) : (
              <select value={municipioDemo} onChange={(e) => setMunicipioDemo(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                {municipios.map((m) => <option key={m.clave_ine} value={m.clave_ine}>{m.nombre}</option>)}
              </select>
            )}
          </div>
          {esDistrito && (
            <p className="text-[9px] text-slate-500">Tlaxcala tiene 19 distritos locales y 3 federales — Apizaco (con datos reales) está en Distrito Local 4 / Federal 1</p>
          )}
          {tipoEleccionDemo !== 'ayuntamiento' && tipoEleccionDemo !== 'pres_comunidad' && (
            <p className="text-[9px] text-amber-400">⚠️ Solo hay resultados históricos reales cargados para Ayuntamiento y Pdte. de Comunidad — con otros tipos, el mapa no mostrará colores de partido, pero el resto del sistema funciona igual.</p>
          )}

          <button onClick={crearDemo} disabled={creandoDemo}
            className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-bold disabled:opacity-50">
            {creandoDemo ? '⏳ Creando demo...' : '🎬 Crear / Reconstruir Demo'}
          </button>
          {mensajeDemo && <div className="text-xs text-purple-200 bg-slate-900/50 rounded-lg p-2">{mensajeDemo}</div>}
        </div>

        {/* Generar códigos de acceso */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-white">🎟️ Generar código de acceso</h2>
          <p className="text-[10px] text-slate-500">Sin uno de estos, nadie puede registrar una campaña nueva.</p>
          <div className="flex gap-2">
            <input placeholder="Nota (ej: Andrea - Apizaco)" value={notaCodigo} onChange={(e) => setNotaCodigo(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <button onClick={generarCodigo} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold">Generar</button>
          </div>
          <div className="space-y-1 pt-2">
            {codigos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="font-mono text-indigo-400">{c.codigo}</span>
                <span className="text-slate-500">{c.nota || '—'}</span>
                <span className={c.usado ? 'text-slate-600' : 'text-emerald-400'}>{c.usado ? '✅ Usado' : '🟢 Disponible'}</span>
                <button onClick={() => borrarCodigo(c.id)} className="text-slate-600 hover:text-red-400 text-xs">🗑️</button>
              </div>
            ))}
          </div>
        </div>

        {/* Campañas registradas — con fechas y acceso directo */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-white">📋 Campañas registradas</h2>
          <div className="space-y-2">
            {campanas.map((c) => {
              const vencida = !c.es_demo && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date();
              const diasParaVencer = c.fecha_vencimiento ? Math.ceil((new Date(c.fecha_vencimiento) - new Date()) / 86400000) : null;
              return (
              <div key={c.id} className="bg-slate-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">{c.nombre_candidato} {c.es_demo && <span className="text-purple-400">(demo)</span>}</div>
                    <div className="text-[10px] text-slate-500">{c.subdominio}.vototech.mx · {c.tipo_eleccion} · {c.total_usuarios} usuarios</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ESTADO_COLOR[c.estado_aprobacion]}`}>{c.estado_aprobacion}</span>
                    {!c.es_demo && c.fecha_vencimiento && (
                      <span className={`text-[9px] font-bold ${vencida ? 'text-red-400' : diasParaVencer <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {vencida ? `💳 Vencida hace ${Math.abs(diasParaVencer)}d` : `💳 Vence en ${diasParaVencer}d`}
                      </span>
                    )}
                    {!c.es_demo && c.telefono_candidato && diasParaVencer <= 7 && (
                      <a href={`https://wa.me/52${c.telefono_candidato.replace(/\D/g, '')}?text=${encodeURIComponent(
                        vencida
                          ? `Hola ${c.nombre_candidato}, tu suscripción de VotoTech venció hace ${Math.abs(diasParaVencer)} días. Contáctanos para renovar y no perder acceso a tu plataforma.`
                          : `Hola ${c.nombre_candidato}, tu suscripción de VotoTech vence en ${diasParaVencer} días. Contáctanos para renovar a tiempo.`
                      )}`} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-emerald-400">📲 Recordar</a>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[9px] text-slate-500">
                    Registrada: {new Date(c.creado_en).toLocaleDateString('es-MX')}
                    {c.ultimo_acceso && <> · Último acceso: {new Date(c.ultimo_acceso).toLocaleDateString('es-MX')}</>}
                    {!c.ultimo_acceso && <> · Sin accesos todavía</>}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.estado_aprobacion === 'pendiente' && (
                      <>
                        <button onClick={() => aprobar(c.id)} className="text-[10px] font-bold text-emerald-400 px-2 py-1">✅ Aprobar</button>
                        <button onClick={() => rechazar(c.id)} className="text-[10px] font-bold text-red-400 px-2 py-1">✕ Rechazar</button>
                      </>
                    )}
                    {c.estado_aprobacion === 'aprobada' && !c.es_demo && (
                      <>
                        <select onChange={(e) => { if (e.target.value) { renovar(c.id, parseInt(e.target.value)); e.target.value = ''; } }} defaultValue=""
                          className="text-[10px] bg-slate-700 text-emerald-300 font-bold rounded px-1.5 py-1 border-0">
                          <option value="" disabled>💳 Renovar...</option>
                          <option value="1">+1 mes</option>
                          <option value="3">+3 meses</option>
                          <option value="12">+12 meses</option>
                        </select>
                        {c.activa ? (
                          <button onClick={() => pausar(c.id, c.nombre_candidato)} className="text-[10px] font-bold text-amber-400 px-2 py-1">⏸️ Pausar</button>
                        ) : (
                          <button onClick={() => reactivar(c.id)} className="text-[10px] font-bold text-emerald-400 px-2 py-1">▶️ Reactivar</button>
                        )}
                      </>
                    )}
                    <button onClick={() => continuarComo(c.id)} className="text-[10px] font-bold text-indigo-400 px-2 py-1">▶️ Continuar</button>
                    <button onClick={() => borrarCampana(c.id, c.nombre_candidato)} className="text-[10px] font-bold text-red-500 px-1">🗑️</button>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';
import InsigniaPartido from '../components/InsigniaPartido';
import Papa from 'papaparse';
// XLSX (SheetJS) se importa DINÁMICAMENTE dentro de leerArchivo() —
// es una librería pesada que solo hace falta si alguien de verdad
// sube un archivo .xlsx/.xls, no en cada visita a Promovidos.
import AnaliticaPromovidos from '../components/AnaliticaPromovidos';
import TableroPromovidos from '../components/TableroPromovidos';
import PanelEncuestas from '../components/PanelEncuestas';
import PanelSeguimientoPersuadibles from '../components/PanelSeguimientoPersuadibles';

const CLASIFICACION_ESTILO = {
  base:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '✅ Base' },
  persuadible: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: '🎯 Persuadible' },
  adversario:  { color: 'text-slate-500', bg: 'bg-slate-500/10', label: '⛔ Adversario' },
};

export function ModalAgregar({ onCerrar, onGuardado, seccionInicial }) {
  const [form, setForm] = useState({
    nombre: '', telefono: '', seccion_numero: seccionInicial || '', partido: '', calle: '', lat: null, lng: null,
    comprometido: false, temperatura: 'tibio', consentimiento: false,
    necesidad_principal: '', situacion_grave: '', genero: '', rango_edad: '',
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
        encuesta: form.necesidad_principal ? { necesidad_principal: form.necesidad_principal } : undefined,
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
        <BuscadorCalle
          valor={form.calle}
          onSeleccion={(datos) => setForm((f) => ({ ...f, calle: datos.calle, lat: datos.lat, lng: datos.lng }))}
        />

        <select value={form.partido} onChange={(e) => actualizar('partido', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          <option value="">Partido de preferencia (opcional)</option>
          {['morena','pan','pri','prd','mc','pvem','pt','pac','independiente'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>

        <div className="flex gap-2">
          <select value={form.genero} onChange={(e) => actualizar('genero', e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="">Género (opcional)</option>
            <option value="hombre">Hombre</option>
            <option value="mujer">Mujer</option>
            <option value="otro">Otro</option>
          </select>
          <select value={form.rango_edad} onChange={(e) => actualizar('rango_edad', e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="">Edad aprox. (opcional)</option>
            <option value="18-29">18-29 años</option>
            <option value="30-44">30-44 años</option>
            <option value="45-59">45-59 años</option>
            <option value="60+">60 años o más</option>
          </select>
        </div>
        <p className="text-[9px] text-slate-500">Estos 2 datos son opcionales — sirven para armar mejores estrategias de reuniones y mensajes con el tiempo. No preguntes ID, solo tu apreciación.</p>

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

        {/* 🗣️ Encuesta rápida — para que el candidato llegue informado
            y empático a cada sección, no solo a pedir el voto */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-2.5 space-y-2">
          <div className="text-[10px] font-bold text-indigo-300 uppercase">🗣️ Encuesta rápida (opcional)</div>
          <select value={form.necesidad_principal} onChange={(e) => actualizar('necesidad_principal', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
            <option value="">¿Cuál es su necesidad principal?</option>
            <option value="agua">💧 Agua</option>
            <option value="seguridad">🚨 Seguridad</option>
            <option value="empleo">💼 Empleo</option>
            <option value="salud">🏥 Salud</option>
            <option value="educacion">📚 Educación</option>
            <option value="vialidad">🛣️ Calles/Vialidad</option>
            <option value="otro">📌 Otro</option>
          </select>
          <textarea placeholder="¿Algo grave que el candidato deba saber antes de venir? (ej: enfermedad en la familia, conflicto reciente, denuncia pendiente...)"
            value={form.situacion_grave} onChange={(e) => actualizar('situacion_grave', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs min-h-14" />
        </div>

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

function ModalDetalle({ promovidoId, onCerrar, onActualizado }) {
  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);

  const cargar = () => api.get(`/promovidos/${promovidoId}`).then((r) => { setDetalle(r.data.data); setForm(r.data.data); });
  useEffect(cargar, [promovidoId]);

  const guardar = async () => {
    await api.patch(`/promovidos/${promovidoId}`, {
      nombre: form.nombre, telefono: form.telefono, partido: form.partido,
      comprometido: form.comprometido, temperatura: form.temperatura,
    });
    setEditando(false);
    cargar();
    onActualizado();
  };

  if (!detalle) return null;
  const est = CLASIFICACION_ESTILO[detalle.clasificacion] || CLASIFICACION_ESTILO.persuadible;
  const RESULTADO_ICONO = { positivo: '👍', neutral: '😐', negativo: '👎', sin_respuesta: '📵' };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">{detalle.nombre}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        {!editando ? (
          <>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${est.color}`}>{est.label}</span>
              {detalle.veces_intentado > 1 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">⚠️ Intentado {detalle.veces_intentado}x</span>
              )}
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>📞 {detalle.telefono || 'Sin teléfono'}</div>
              <div>📍 {detalle.seccion_numero ? `Sección ${detalle.seccion_numero}` : 'Sin sección'} {detalle.calle && `· ${detalle.calle}`}</div>
              <div>🏛️ {detalle.partido?.toUpperCase() || 'Sin partido declarado'} {detalle.comprometido && '· ✅ Comprometido'}</div>
              <div>🌡️ Temperatura: {detalle.temperatura}</div>
              <div className="text-slate-500">Registrado por {detalle.registrado_por_nombre} el {new Date(detalle.creado_en).toLocaleDateString('es-MX')}</div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">📋 Historial de contactos ({detalle.historial.length})</div>
              {detalle.historial.length === 0 ? (
                <div className="text-xs text-slate-500">Sin contactos registrados todavía</div>
              ) : (
                <div className="space-y-2">
                  {detalle.historial.map((h) => (
                    <div key={h.id} className="bg-slate-800/50 rounded-lg p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-bold text-white">{RESULTADO_ICONO[h.resultado] || '📝'} {h.tipo}</span>
                        <span className="text-slate-500">{new Date(h.creado_en).toLocaleDateString('es-MX')}</span>
                      </div>
                      <div className="text-slate-400">{h.usuario_nombre}{h.notas && ` — ${h.notas}`}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setEditando(true)} className="w-full py-2.5 rounded-lg bg-indigo-600/80 text-white text-sm font-bold">✏️ Editar datos</button>
          </>
        ) : (
          <>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Teléfono"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <select value={form.partido || ''} onChange={(e) => setForm({ ...form, partido: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="">Sin partido</option>
              {['morena','pan','pri','prd','mc','pvem','pt','pac','independiente'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
            <div className="flex gap-2">
              {['frio','tibio','caliente'].map(t => (
                <button key={t} onClick={() => setForm({ ...form, temperatura: t })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.temperatura===t ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400'}`}>
                  {t==='frio'?'❄️':t==='tibio'?'🌡️':'🔥'} {t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={form.comprometido} onChange={(e) => setForm({ ...form, comprometido: e.target.checked })} />
              Está comprometido a votar por nosotros
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
              <button onClick={guardar} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar cambios</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModalImportar({ onCerrar, onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [encabezados, setEncabezados] = useState([]);
  const [filas, setFilas] = useState([]);
  const [mapeo, setMapeo] = useState({ nombre: '', telefono: '', seccion_numero: '', partido: '' });
  const [declaroConsentimiento, setDeclaroConsentimiento] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorLectura, setErrorLectura] = useState('');

  const leerArchivo = (file) => {
    setArchivo(file);
    setErrorLectura('');
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);

    const procesarFilas = (encabezadosDetectados, filasDetectadas) => {
      setEncabezados(encabezadosDetectados);
      setFilas(filasDetectadas);
      // Adivinar el mapeo automático por nombres de columna comunes
      const adivinar = (opciones) => encabezadosDetectados.find((f) => opciones.some((o) => f.toLowerCase().includes(o))) || '';
      setMapeo({
        nombre: adivinar(['nombre']),
        telefono: adivinar(['telefono', 'tel', 'celular']),
        seccion_numero: adivinar(['seccion', 'secc']),
        partido: adivinar(['partido']),
      });
    };

    if (esExcel) {
      // Antes esto se mandaba (por error) a PapaParse, que SOLO sabe
      // leer CSV — un archivo .xlsx real es binario, no texto, y se
      // interpretaba como basura, causando datos corruptos y el
      // error del servidor. Ahora si de verdad es Excel, se lee como
      // Excel (con SheetJS, cargado solo aquí), no como si fuera texto.
      const lector = new FileReader();
      lector.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const libro = XLSX.read(e.target.result, { type: 'array' });
          const hoja = libro.Sheets[libro.SheetNames[0]];
          const datos = XLSX.utils.sheet_to_json(hoja, { defval: '' });
          if (datos.length === 0) { setErrorLectura('El archivo Excel no tiene filas de datos.'); return; }
          procesarFilas(Object.keys(datos[0]), datos);
        } catch (err) {
          setErrorLectura('No se pudo leer el archivo Excel. Verifica que no esté dañado o protegido con contraseña.');
        }
      };
      lector.onerror = () => setErrorLectura('No se pudo abrir el archivo.');
      lector.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (!res.data.length) { setErrorLectura('El archivo no tiene filas de datos, o el formato no se pudo leer.'); return; }
          procesarFilas(res.meta.fields || [], res.data);
        },
        error: () => setErrorLectura('No se pudo leer el archivo CSV.'),
      });
    }
  };

  const importar = async () => {
    setImportando(true);
    const filasMapeadas = filas.map((f) => {
      const seccionTexto = mapeo.seccion_numero ? String(f[mapeo.seccion_numero] || '').trim() : '';
      const seccionParseada = seccionTexto ? parseInt(seccionTexto) : NaN;
      return {
        nombre: f[mapeo.nombre]?.trim ? f[mapeo.nombre].trim() : f[mapeo.nombre],
        telefono: mapeo.telefono ? f[mapeo.telefono]?.trim?.() || f[mapeo.telefono] : undefined,
        seccion_numero: Number.isInteger(seccionParseada) ? seccionParseada : undefined,
        partido: mapeo.partido ? (f[mapeo.partido]?.trim?.() || f[mapeo.partido] || '').toLowerCase() || undefined : undefined,
      };
    }).filter((f) => f.nombre);

    try {
      const { data } = await api.post('/promovidos/importar', { filas: filasMapeadas, declaro_consentimiento: declaroConsentimiento });
      setResultado(data);
      onImportado();
    } catch (e) {
      setResultado({ error: e.response?.data?.error || 'Error al importar' });
    }
    setImportando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">📤 Importar tu base de datos</h2>
        <p className="text-[10px] text-slate-500">
          Sube un Excel o CSV que TÚ ya tengas de contactos previos (no es el padrón oficial, es tu propia información).
        </p>

        {!archivo && (
          <div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => leerArchivo(e.target.files[0])}
              className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold" />
            <p className="text-[9px] text-slate-600 mt-2">Formato CSV recomendado (exporta tu Excel como CSV desde Excel/Google Sheets)</p>
          </div>
        )}
        {errorLectura && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
            ⚠️ {errorLectura}
            <button onClick={() => { setArchivo(null); setErrorLectura(''); }} className="block underline font-bold mt-1">Intentar con otro archivo</button>
          </div>
        )}

        {archivo && !resultado && !errorLectura && (
          <>
            <div className="text-xs text-emerald-400">✅ {filas.length} filas detectadas en {archivo.name}</div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Indica qué columna es cada dato</div>
              {[['nombre', 'Nombre *'], ['telefono', 'Teléfono'], ['seccion_numero', 'Sección'], ['partido', 'Partido']].map(([campo, label]) => (
                <div key={campo} className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 w-24">{label}</span>
                  <select value={mapeo[campo]} onChange={(e) => setMapeo({ ...mapeo, [campo]: e.target.value })}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                    <option value="">No importar esta columna</option>
                    {encabezados.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/50 p-2 rounded-lg">
              <input type="checkbox" checked={declaroConsentimiento} onChange={(e) => setDeclaroConsentimiento(e.target.checked)} className="mt-0.5" />
              <span>Declaro que estos contactos son míos y que ya contaba con su consentimiento para tener sus datos, conforme a la LFPDPPP *</span>
            </label>

            <div className="flex gap-2">
              <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
              <button onClick={importar} disabled={!mapeo.nombre || !declaroConsentimiento || importando}
                className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
                {importando ? '⏳ Importando...' : `Importar ${filas.length} contactos`}
              </button>
            </div>
          </>
        )}

        {resultado && !resultado.error && (
          <div className="space-y-3">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-300">
              ✅ {resultado.importados} importados · {resultado.duplicados} ya existían (se omitieron) · {resultado.errores} con error
            </div>
            <button onClick={onCerrar} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Cerrar</button>
          </div>
        )}
        {resultado?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">⚠️ {resultado.error}</div>
        )}
      </div>
    </div>
  );
}

export default function Promovidos() {
  const [params] = useSearchParams();
  const seccionFiltro = params.get('seccion') ? parseInt(params.get('seccion')) : null;
  const [lista, setLista] = useState([]);
  const [modoSeguimiento, setModoSeguimiento] = useState(params.get('filtro') === 'seguimiento');
  const [mostrarModal, setMostrarModal] = useState(params.get('agregar') === '1');
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('lista');
  const [vista, setVista] = useState('lista'); // 'lista' | 'tablero'
  const [busqueda, setBusqueda] = useState('');
  const [filtroTemperatura, setFiltroTemperatura] = useState('todas');
  const [detalleId, setDetalleId] = useState(null);
  const [mostrarImportar, setMostrarImportar] = useState(false);

  const cargar = () => {
    setCargando(true);
    const ep = modoSeguimiento ? '/promovidos/seguimiento-prioritario' : '/promovidos';
    api.get(ep).then((r) => { setLista(r.data.data); setCargando(false); });
  };

  useEffect(() => { cargar(); }, [modoSeguimiento]);

  // Si se llegó desde el mapa con una sección específica (ej: /promovidos?seccion=12),
  // filtrar la lista para mostrar solo esa sección — así el botón "Ver promovidos
  // aquí" del mapa de verdad lleva a algo relevante y no a la lista completa.
  const listaFiltrada = lista
    .filter((p) => !seccionFiltro || p.seccion_numero === seccionFiltro)
    .filter((p) => filtroTemperatura === 'todas' || p.temperatura === filtroTemperatura)
    .filter((p) => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.telefono?.includes(busqueda));

  const registrarContacto = async (id, resultado) => {
    await api.post(`/promovidos/${id}/contacto`, { tipo: 'visita', resultado });
    cargar();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🤝 Promovidos</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/exportar/promovidos', 'promovidos.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold" title="Descargar Excel">
              📥 Excel
            </button>
            <button onClick={() => setMostrarImportar(true)}
              className="px-3 py-2.5 rounded-xl bg-purple-700/50 text-purple-300 text-sm font-bold" title="Importar tu base propia">
              📤 Importar
            </button>
            <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
              + Agregar
            </button>
          </div>
        </div>

        {seccionFiltro && (
          <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2">
            <span className="text-xs text-indigo-300">📍 Mostrando solo la sección {seccionFiltro} (llegaste desde el mapa)</span>
            <Link to="/promovidos" className="text-xs font-bold text-indigo-400">Ver todos ✕</Link>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: 'thin' }}>
          <button onClick={() => { setModoSeguimiento(false); setTab('lista'); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${!modoSeguimiento && tab === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            Todos
          </button>
          <button onClick={() => { setModoSeguimiento(true); setTab('lista'); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${modoSeguimiento && tab === 'lista' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            🎯 Seguimiento prioritario
          </button>
          <Link to="/marketing"
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-600/80 text-white flex items-center">
            📢 Enviar por Marketing →
          </Link>
          <button onClick={() => setTab('analitica')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'analitica' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📊 Analítica
          </button>
          <button onClick={() => setTab('encuestas')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'encuestas' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📋 Encuestas
          </button>
          <button onClick={() => setTab('seguimiento-persuadibles')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${tab === 'seguimiento-persuadibles' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            📅 Agenda de Persuadibles
          </button>
        </div>

        {tab === 'analitica' && <AnaliticaPromovidos />}
        {tab === 'encuestas' && <PanelEncuestas />}
        {tab === 'seguimiento-persuadibles' && <PanelSeguimientoPersuadibles />}

        {tab === 'lista' && (
          <div className="flex gap-2">
            <input placeholder="🔍 Buscar por nombre o teléfono..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
            <select value={filtroTemperatura} onChange={(e) => setFiltroTemperatura(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
              <option value="todas">Toda temperatura</option>
              <option value="frio">❄️ Frío</option>
              <option value="tibio">🌡️ Tibio</option>
              <option value="caliente">🔥 Caliente</option>
            </select>
          </div>
        )}

        {tab === 'lista' && (
          <div className="flex gap-1.5">
            <button onClick={() => setVista('lista')} className={`px-3 py-1 rounded-full text-[10px] font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
            <button onClick={() => setVista('tablero')} className={`px-3 py-1 rounded-full text-[10px] font-bold ${vista === 'tablero' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗂️ Tablero</button>
          </div>
        )}


        {tab === 'lista' && vista === 'tablero' && (
          <TableroPromovidos lista={listaFiltrada} onActualizar={cargar} onVerDetalle={setDetalleId} />
        )}

        {tab === 'lista' && vista === 'lista' && (cargando ? (
          <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>
        ) : listaFiltrada.length === 0 ? (
          <div className="text-center text-slate-500 py-10">{seccionFiltro ? `Sin promovidos todavía en la sección ${seccionFiltro}` : 'Sin registros todavía'}</div>
        ) : (
          <div className="space-y-2">
            {listaFiltrada.map((p) => {
              const est = CLASIFICACION_ESTILO[p.clasificacion] || CLASIFICACION_ESTILO.persuadible;
              return (
                <div key={p.id} className={`rounded-xl border border-slate-800 ${est.bg} p-4`}>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setDetalleId(p.id)}>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5">
                        {p.nombre}
                        {p.veces_intentado > 1 && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">⚠️ {p.veces_intentado}x</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                        {p.seccion_numero ? `Sección ${String(p.seccion_numero).padStart(3,'0')}` : 'Sin sección'}
                        {p.partido ? <InsigniaPartido partido={p.partido} tamano="chico" /> : <span className="text-slate-600">Sin partido</span>}
                        {p.dias_sin_contacto != null && `· ${p.dias_sin_contacto} días sin contacto`}
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

      {mostrarModal && <ModalAgregar seccionInicial={seccionFiltro} onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
      {detalleId && <ModalDetalle promovidoId={detalleId} onCerrar={() => setDetalleId(null)} onActualizado={cargar} />}
      {mostrarImportar && <ModalImportar onCerrar={() => { setMostrarImportar(false); cargar(); }} onImportado={cargar} />}
    </div>
  );
}

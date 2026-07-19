import { useState, useEffect } from 'react';
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
      <div className="max-w-4xl mx-auto space-y-6">
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
                      <select onChange={(e) => { if (e.target.value) { renovar(c.id, parseInt(e.target.value)); e.target.value = ''; } }} defaultValue=""
                        className="text-[10px] bg-slate-700 text-emerald-300 font-bold rounded px-1.5 py-1 border-0">
                        <option value="" disabled>💳 Renovar...</option>
                        <option value="1">+1 mes</option>
                        <option value="3">+3 meses</option>
                        <option value="12">+12 meses</option>
                      </select>
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

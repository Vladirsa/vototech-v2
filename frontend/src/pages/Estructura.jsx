import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import html2canvas from 'html2canvas';
import QRCode from 'react-qr-code';

const SALUD_ESTILO = {
  sano:         { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-700/40', ic: '✅', label: 'Sano' },
  sobrecargado: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-700/40', ic: '🔴', label: 'Sobrecargado' },
  bajo:         { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-700/40', ic: '🟡', label: 'Subutilizado' },
  vacio:        { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-700', ic: '⚪', label: 'Sin equipo aún' },
  na:           { color: 'text-slate-500', bg: '', border: 'border-slate-800', ic: '', label: '' },
};

const ROL_LABEL = {
  candidato: 'Candidato', jefe_campana: 'Nivel Dirección', coord_general: 'Nivel General',
  coord_distrital: 'Nivel Regional', coord_municipal: 'Nivel Municipal',
  coord_seccional: 'Nivel Territorial', promotor: 'Promotor',
};

// Catálogo real de puestos de campaña — investigado de estructuras
// reales mexicanas (coordinación general, territorial, político,
// jurídico, enlaces sectoriales) — organizado por el nivel jerárquico
// sano al que normalmente corresponde cada uno.
const PUESTOS_POR_ROL = {
  jefe_campana: ['Secretario Particular', 'Coordinador General de Campaña', 'Coordinador Jurídico', 'Coordinador Territorial', 'Coordinador Político', 'Coordinador de Comunicación', 'Coordinador de Finanzas'],
  coord_general: ['Coordinador de Enlace con Partidos', 'Coordinador de Alianzas', 'Coordinador de Vinculación Social', 'Coordinador de Prensa', 'Coordinador de Redes Sociales'],
  coord_distrital: ['Coordinador Distrital', 'Coordinador de Jóvenes', 'Coordinador de Mujeres', 'Coordinador Empresarial', 'Coordinador de Adultos Mayores', 'Coordinador de Colonias', 'Coordinador de Transporte y Logística', 'Coordinador de Eventos'],
  coord_municipal: ['Coordinador Municipal', 'Coordinador de Casillas', 'Coordinador de Representantes'],
  coord_seccional: ['Coordinador Seccional', 'Coordinador de Manzana', 'Enlace Comunitario'],
  promotor: ['Promotor de Campaña', 'Estructura Territorial'],
};

function estaActivoReciente(ultimoAcceso) {
  if (!ultimoAcceso) return null;
  const dias = (Date.now() - new Date(ultimoAcceso).getTime()) / 86400000;
  if (dias < 3) return 'reciente';
  if (dias < 14) return 'medio';
  return 'inactivo';
}
const PUNTO_ACTIVIDAD = { reciente: 'bg-emerald-400', medio: 'bg-amber-400', inactivo: 'bg-red-400' };

function ModalAgregarMiembro({ miembros, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'coord_seccional', puesto: '', parent_id: '', territorio_id: '' });
  const [error, setError] = useState('');
  const guardar = async () => {
    try {
      await api.post('/estructura', {
        ...form,
        parent_id: form.parent_id || undefined,
        territorio_tipo: form.territorio_id ? 'seccion' : undefined,
        territorio_id: form.territorio_id ? parseInt(form.territorio_id) : undefined,
      });
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">+ Agregar al Organigrama</h2>
        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}

        <input placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <input placeholder="Contraseña temporal" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">Nivel jerárquico (controla cuánta gente sana puede tener a cargo)</label>
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value, puesto: '' })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            {Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">Puesto específico (el título real de campaña)</label>
          <input list="lista-puestos" value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })}
            placeholder="Ej: Coordinador de Jóvenes"
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <datalist id="lista-puestos">
            {PUESTOS_POR_ROL[form.rol]?.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>

        {(form.rol === 'coord_seccional' || form.rol === 'coord_municipal') && (
          <input placeholder="Sección que le asignas (ej: 12)" type="number" value={form.territorio_id}
            onChange={(e) => setForm({ ...form, territorio_id: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        )}

        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">¿A quién le reporta? (de ahí cuelga en el organigrama)</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="">Directo al Candidato</option>
            {miembros.filter(m => m.rol !== 'promotor').map(m => <option key={m.id} value={m.id}>{m.nombre} — {m.puesto || ROL_LABEL[m.rol]}</option>)}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={!form.nombre || !form.email || form.password.length < 8}
            className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDetalleMiembro({ miembro, miembros, onCerrar, onActualizado }) {
  const [cadena, setCadena] = useState(null);
  const [zonas, setZonas] = useState(null);
  const [rendimientoRama, setRendimientoRama] = useState(null);
  const [codigoPropio, setCodigoPropio] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [reasignando, setReasignando] = useState(false);
  const [nuevoDestino, setNuevoDestino] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nombre: miembro.nombre, rol: miembro.rol, puesto: miembro.puesto || '', parent_id: miembro.parent_id || '', meta_diaria: miembro.meta_diaria || '' });

  const hijosDirectos = miembros.filter((m) => m.parent_id === miembro.id);

  useEffect(() => {
    api.get(`/estructura/cadena/${miembro.id}`).then((r) => setCadena(r.data.data));
    api.get(`/estructura/${miembro.id}/zonas`).then((r) => setZonas(r.data.data));
    api.get(`/estructura/${miembro.id}/historial`).then((r) => setHistorial(r.data.data));
    if (miembro.rol !== 'promotor') {
      api.get(`/estructura/${miembro.id}/rendimiento-rama`).then((r) => setRendimientoRama(r.data.data));
    }
  }, [miembro.id]);

  const reasignarEquipo = async () => {
    if (!nuevoDestino) return;
    const { data } = await api.post(`/estructura/${miembro.id}/reasignar-equipo`, { nuevo_parent_id: nuevoDestino });
    alert(`✅ ${data.movidos} personas movidas`);
    setReasignando(false);
    onActualizado();
    onCerrar();
  };

  const generarCodigoParaEl = async () => {
    const { data } = await api.post('/codigos', { rol_asignado: 'promotor', usos_maximos: 1 });
    setCodigoPropio(data.data.codigo);
  };

  const guardarCambios = async () => {
    await api.patch(`/estructura/${miembro.id}`, {
      nombre: form.nombre, rol: form.rol, puesto: form.puesto || null,
      parent_id: form.parent_id || null,
      meta_diaria: form.meta_diaria ? parseInt(form.meta_diaria) : undefined,
    });
    setEditando(false);
    onActualizado();
  };

  const desactivar = async () => {
    if (!confirm(`¿Dar de baja a ${miembro.nombre}? Su historial se conserva, pero ya no podrá entrar al sistema.`)) return;
    await api.patch(`/estructura/${miembro.id}`, { activo: false });
    onActualizado();
    onCerrar();
  };

  const actividad = estaActivoReciente(miembro.ultimo_acceso);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white">{miembro.nombre}</h2>
            <p className="text-xs text-indigo-400 font-bold">{miembro.puesto || ROL_LABEL[miembro.rol]}</p>
          </div>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        {!editando ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">{ROL_LABEL[miembro.rol]}</span>
              {actividad && <span className={`w-2 h-2 rounded-full ${PUNTO_ACTIVIDAD[actividad]}`} title="Actividad reciente" />}
              <span className="text-slate-500">
                {miembro.ultimo_acceso ? `Último acceso: ${new Date(miembro.ultimo_acceso).toLocaleDateString('es-MX')}` : 'Nunca ha entrado'}
              </span>
            </div>

            {/* Rendimiento de TODA la rama hacia abajo — no solo gente directa */}
            {rendimientoRama && (
              <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-800/30 rounded-xl p-3">
                <div className="text-[10px] font-bold text-indigo-300 uppercase mb-2">🌳 Rendimiento de toda su rama</div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="text-center">
                    <div className="text-lg font-black text-white">{rendimientoRama.total_personas_en_rama}</div>
                    <div className="text-[8px] text-slate-500">Personas en la rama</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-emerald-400">{rendimientoRama.total_promovidos_rama}</div>
                    <div className="text-[8px] text-slate-500">Promovidos generados</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-amber-400">{rendimientoRama.total_comprometidos_rama}</div>
                    <div className="text-[8px] text-slate-500">Comprometidos</div>
                  </div>
                </div>
                {rendimientoRama.mejor_promotor && (
                  <div className="text-[10px] text-slate-300 bg-slate-800/50 rounded-lg px-2 py-1.5">
                    🏆 Mejor promotor de la rama: <strong className="text-white">{rendimientoRama.mejor_promotor.nombre}</strong> ({rendimientoRama.mejor_promotor.total_promovidos})
                  </div>
                )}
              </div>
            )}

            {/* Cadena de invitación — quién lo invitó, hasta el candidato */}
            {cadena && cadena.length > 1 && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🔗 Cadena de invitación (de dónde llegó)</div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
                  {cadena.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-600">→</span>}
                      <span className={i === cadena.length - 1 ? 'text-indigo-400 font-bold' : ''}>{c.nombre}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Código propio para invitar hacia abajo */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🎟️ Código para que invite a su gente</div>
              {codigoPropio ? (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-center space-y-2">
                  <span className="font-mono text-indigo-300 font-bold block">{codigoPropio}</span>
                  <div className="bg-white p-2 rounded-lg inline-block">
                    <QRCode value={codigoPropio} size={120} />
                  </div>
                  <p className="text-[9px] text-slate-500">Que lo escaneen directo con el celular al registrarse</p>
                </div>
              ) : (
                <button onClick={generarCodigoParaEl} className="w-full py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-bold">Generar código nuevo</button>
              )}
            </div>

            {/* Zonas asignadas (de Sectorización en el mapa) */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🗺️ Influencia territorial (capa del mapa)</div>
              {!zonas || zonas.length === 0 ? (
                <div className="text-xs text-slate-500">Sin secciones asignadas — asígnalas desde el modo Sectorización en el mapa</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {zonas.map((s) => <span key={s} className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Sección {s}</span>)}
                </div>
              )}
            </div>

            {miembro.meta_diaria > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">🎯 Meta diaria</div>
                <div className="text-sm text-white">{miembro.meta_diaria} promovidos/día</div>
              </div>
            )}

            {/* Reasignar en bloque — mover a todo su equipo directo */}
            {hijosDirectos.length > 0 && (
              <div>
                {!reasignando ? (
                  <button onClick={() => setReasignando(true)} className="w-full py-2 rounded-lg bg-purple-600/80 text-white text-xs font-bold">
                    🔀 Reasignar su equipo ({hijosDirectos.length} personas) a otro coordinador
                  </button>
                ) : (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] text-purple-300">Mover a las {hijosDirectos.length} personas que le reportan directo a:</p>
                    <select value={nuevoDestino} onChange={(e) => setNuevoDestino(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
                      <option value="">Selecciona el nuevo coordinador...</option>
                      {miembros.filter(m => m.id !== miembro.id && m.rol !== 'promotor').map(m => <option key={m.id} value={m.id}>{m.nombre} — {m.puesto || ROL_LABEL[m.rol]}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setReasignando(false)} className="flex-1 py-1.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">Cancelar</button>
                      <button onClick={reasignarEquipo} disabled={!nuevoDestino} className="flex-[2] py-1.5 rounded bg-purple-600 text-white text-[10px] font-bold disabled:opacity-40">Confirmar movimiento</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Historial de movimientos */}
            {historial?.length > 0 && (
              <div>
                <button onClick={() => setMostrarHistorial(v => !v)} className="text-[10px] font-bold text-slate-400">
                  {mostrarHistorial ? '▼' : '▶'} 🕒 Historial de movimientos ({historial.length})
                </button>
                {mostrarHistorial && (
                  <div className="mt-1.5 space-y-1">
                    {historial.map((h) => (
                      <div key={h.id} className="text-[9px] text-slate-500 bg-slate-800/40 rounded px-2 py-1">
                        {new Date(h.creado_en).toLocaleDateString('es-MX')} · {h.nombre_anterior || 'Candidato'} → {h.nombre_nuevo || 'Candidato'} ({h.motivo}, por {h.nombre_cambiado_por})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button onClick={() => setEditando(true)} className="flex-1 py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-bold">✏️ Editar</button>
              {miembro.activo !== false && (
                <button onClick={desactivar} className="flex-1 py-2 rounded-lg bg-red-600/80 text-white text-xs font-bold">🚫 Dar de baja</button>
              )}
            </div>
          </>
        ) : (
          <>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input list="lista-puestos-editar" value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })}
              placeholder="Puesto específico" className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <datalist id="lista-puestos-editar">
              {PUESTOS_POR_ROL[form.rol]?.map((p) => <option key={p} value={p} />)}
            </datalist>
            <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="">Directo al Candidato</option>
              {miembros.filter(m => m.id !== miembro.id && m.rol !== 'promotor').map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <input placeholder="Meta diaria" type="number" value={form.meta_diaria} onChange={(e) => setForm({ ...form, meta_diaria: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
              <button onClick={guardarCambios} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar cambios</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Nodo del organigrama visual — se dibuja a sí mismo y a sus hijos recursivamente */
function NodoOrganigrama({ miembro, hijos, onClick, esRaiz, busqueda }) {
  const est = SALUD_ESTILO[miembro.salud] || SALUD_ESTILO.na;
  const actividad = estaActivoReciente(miembro.ultimo_acceso);
  const propios = hijos.filter((h) => h.parent_id === miembro.id);
  const coincide = busqueda && (miembro.nombre.toLowerCase().includes(busqueda.toLowerCase()) || miembro.puesto?.toLowerCase().includes(busqueda.toLowerCase()));
  const opacado = busqueda && !coincide;

  return (
    <div className="flex flex-col items-center">
      <button onClick={() => onClick(miembro)}
        className={`px-4 py-2.5 rounded-2xl border-2 ${esRaiz ? 'border-amber-500 bg-amber-500/10' : est.border} ${!esRaiz && est.bg} min-w-[150px] text-center hover:scale-105 transition-all relative shadow-lg ${coincide ? 'ring-4 ring-yellow-400 scale-105' : ''} ${opacado ? 'opacity-25' : ''}`}>
        {actividad && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${PUNTO_ACTIVIDAD[actividad]} border-2 border-slate-950`} />}
        <div className="text-sm font-black text-white truncate max-w-[140px]">{miembro.nombre}</div>
        <div className="text-[10px] text-indigo-300 font-bold truncate max-w-[140px]">{miembro.puesto || ROL_LABEL[miembro.rol]}</div>
        {miembro.salud !== 'na' && <div className={`text-[9px] font-bold ${est.color} mt-0.5`}>{est.ic} {miembro.reportes_directos} a cargo</div>}
      </button>
      {propios.length > 0 && (
        <>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex gap-4 pt-1 border-t border-slate-700 relative">
            {propios.map((h) => (
              <div key={h.id} className="flex flex-col items-center pt-2">
                <NodoOrganigrama miembro={h} hijos={hijos} onClick={onClick} busqueda={busqueda} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Estructura() {
  const [miembros, setMiembros] = useState([]);
  const [salud, setSalud] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [miembroDetalle, setMiembroDetalle] = useState(null);
  const [vista, setVista] = useState('organigrama');
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [vacantes, setVacantes] = useState([]);
  const [alertasRama, setAlertasRama] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [exportando, setExportando] = useState(false);
  const refOrganigrama = useRef(null);

  const cargar = () => {
    Promise.all([api.get('/estructura'), api.get('/estructura/salud')]).then(([m, s]) => {
      setMiembros(m.data.data); setSalud(s.data.data); setCargando(false);
    });
    api.get('/estructura/vacantes/catalogo').then((r) => setVacantes(r.data.data));
    api.get('/estructura/alertas/rama-dormida').then((r) => setAlertasRama(r.data.data));
    api.get('/estructura/ranking/coordinadores').then((r) => setRanking(r.data.data));
  };
  useEffect(cargar, []);

  const exportarImagen = async () => {
    if (!refOrganigrama.current) return;
    setExportando(true);
    const canvas = await html2canvas(refOrganigrama.current, { backgroundColor: '#020617', scale: 2 });
    const enlace = document.createElement('a');
    enlace.download = `organigrama-${new Date().toISOString().slice(0, 10)}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
    setExportando(false);
  };

  const nombreCoincide = (m) => !busqueda || m.nombre.toLowerCase().includes(busqueda.toLowerCase()) || m.puesto?.toLowerCase().includes(busqueda.toLowerCase());

  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;

  const raiz = miembros.filter((m) => !m.parent_id);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🗂️ Organigrama de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
        </div>

        {salud && (
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(salud.resumen).map(([key, n]) => {
              const est = SALUD_ESTILO[key];
              return (
                <div key={key} className={`rounded-xl ${est.bg} border border-slate-800 p-3 text-center`}>
                  <div className="text-xl">{est.ic}</div>
                  <div className={`text-lg font-black ${est.color}`}>{n}</div>
                  <div className="text-[9px] text-slate-500">{est.label}</div>
                </div>
              );
            })}
          </div>
        )}
        {salud?.alertas?.length > 0 && (
          <div className="space-y-1.5">
            {salud.alertas.map((a, i) => (
              <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                🔴 <strong>{miembros.find(m => m.id === a.usuario_id)?.nombre}</strong>: {a.mensaje}
              </div>
            ))}
          </div>
        )}

        {/* 🌙 Ramas completas dormidas — no solo un coordinador, TODA su cadena sin actividad */}
        {alertasRama.length > 0 && (
          <div className="space-y-1.5">
            {alertasRama.map((a) => (
              <div key={a.id} className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-purple-300">
                🌙 Toda la rama de <strong>{a.nombre}</strong> ({a.puesto}, {a.personas_en_rama} personas) lleva 14+ días sin actividad
              </div>
            ))}
          </div>
        )}

        {/* 🈳 Vacantes del catálogo típico de campaña */}
        {vacantes.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <div className="text-[10px] font-bold text-amber-300 uppercase mb-1.5">🈳 Puestos aún vacantes</div>
            <div className="flex flex-wrap gap-1.5">
              {vacantes.map((v) => <span key={v} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full">{v}</span>)}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            <button onClick={() => setVista('organigrama')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'organigrama' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🌳 Organigrama</button>
            <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
            <button onClick={() => setVista('ranking')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'ranking' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🏆 Ranking</button>
          </div>
          {vista === 'organigrama' && (
            <div className="flex gap-2 items-center">
              <input placeholder="🔍 Buscar por nombre o puesto..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs w-56" />
              <button onClick={exportarImagen} disabled={exportando} className="px-3 py-1.5 rounded-lg bg-emerald-700/60 text-emerald-300 text-xs font-bold">
                {exportando ? '⏳...' : '📥 Exportar imagen'}
              </button>
            </div>
          )}
        </div>

        {vista === 'organigrama' ? (
          <div ref={refOrganigrama} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 overflow-x-auto">
            <div className="flex gap-8 justify-center min-w-max pb-2">
              {raiz.length === 0 ? (
                <div className="text-slate-500 text-sm py-10">Agrega tu primer nivel de estructura (reportan directo al Candidato)</div>
              ) : raiz.map((m) => <NodoOrganigrama key={m.id} miembro={m} hijos={miembros} onClick={setMiembroDetalle} esRaiz busqueda={busqueda} />)}
            </div>
            <p className="text-center text-[10px] text-slate-600 mt-4">Toca cualquier persona para ver su detalle, código de invitación, cadena, y editar</p>
          </div>
        ) : vista === 'ranking' ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left px-3 py-2 text-slate-400 font-bold">#</th>
                  <th className="text-left px-3 py-2 text-slate-400 font-bold">Coordinador</th>
                  <th className="text-left px-3 py-2 text-slate-400 font-bold">Puesto</th>
                  <th className="text-center px-3 py-2 text-slate-400 font-bold">Personas en su rama</th>
                  <th className="text-center px-3 py-2 text-slate-400 font-bold">Promovidos generados</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40" onClick={() => setMiembroDetalle(miembros.find(m => m.id === r.id))}>
                    <td className="px-3 py-2 font-black text-white">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                    <td className="px-3 py-2 text-white font-bold">{r.nombre}</td>
                    <td className="px-3 py-2 text-slate-400">{r.puesto || ROL_LABEL[r.rol]}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{r.personas_en_rama}</td>
                    <td className="px-3 py-2 text-center text-emerald-400 font-bold">{r.promovidos_rama}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {miembros.map((m) => {
              const est = SALUD_ESTILO[m.salud] || SALUD_ESTILO.na;
              const actividad = estaActivoReciente(m.ultimo_acceso);
              return (
                <button key={m.id} onClick={() => setMiembroDetalle(m)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between hover:bg-slate-800/60 text-left">
                  <div className="flex items-center gap-2">
                    {actividad && <span className={`w-2 h-2 rounded-full ${PUNTO_ACTIVIDAD[actividad]}`} />}
                    <div>
                      <div className="text-sm font-bold text-white">{m.nombre}</div>
                      <div className="text-[10px] text-slate-500">{m.puesto || ROL_LABEL[m.rol]}{m.rol !== 'promotor' && ` · ${m.reportes_directos} a cargo`}</div>
                    </div>
                  </div>
                  {m.salud !== 'na' && <span className={`text-[10px] font-bold ${est.color}`}>{est.ic} {est.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {mostrarModal && <ModalAgregarMiembro miembros={miembros} onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
      {miembroDetalle && <ModalDetalleMiembro miembro={miembroDetalle} miembros={miembros} onCerrar={() => setMiembroDetalle(null)} onActualizado={cargar} />}
    </div>
  );
}

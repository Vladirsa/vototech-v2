import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';

const TIPO_LABEL = {
  espectacular: { ic: '📺', label: 'Espectacular' },
  barda: { ic: '🧱', label: 'Barda' },
  manta: { ic: '🎏', label: 'Manta/Lona' },
  ine_representante: { ic: '🗳️', label: 'Representante INE' },
  utilitario: { ic: '👕', label: 'Utilitario (playeras, gorras, etc.)' },
};
const ESTADO_COLOR = { activo: 'text-emerald-400 bg-emerald-500/10', vencido: 'text-red-400 bg-red-500/10', retirado: 'text-slate-500 bg-slate-500/10' };
const MOTIVO_LABEL = { promocion_voto: '🗳️ Promoción del voto', reunion: '👥 Reunión', otro: '📦 Otro' };

function ModalAgregarActivo({ onCerrar, onGuardado }) {
  const [form, setForm] = useState({ tipo: 'espectacular', seccion_numero: '', direccion: '', empresa: '', costo: '', fecha_ini: '', fecha_vence: '', nombre_rep: '', telefono_rep: '', lat: null, lng: null, cantidad: '', motivo: 'promocion_voto', destinatario: '' });
  const [error, setError] = useState('');

  const guardar = async () => {
    try {
      const { data } = await api.post('/activos', {
        ...form,
        seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined,
        costo: form.costo ? parseFloat(form.costo) : undefined,
        cantidad: form.cantidad ? parseInt(form.cantidad) : undefined,
      });
      if (data.alerta_legal) alert(data.alerta_legal); // el activo ya quedó guardado, esto solo informa
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-white">+ Nuevo Activo</h2>
        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}

        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v.ic} {v.label}</option>)}
        </select>

        <input placeholder="Sección electoral" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />

        <BuscadorCalle valor={form.direccion} onSeleccion={(d) => setForm({ ...form, direccion: d.direccion_completa, lat: d.lat, lng: d.lng })} />

        {form.tipo === 'ine_representante' ? (
          <>
            <input placeholder="Nombre del representante" value={form.nombre_rep} onChange={(e) => setForm({ ...form, nombre_rep: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Teléfono" value={form.telefono_rep} onChange={(e) => setForm({ ...form, telefono_rep: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </>
        ) : form.tipo === 'utilitario' ? (
          <>
            {/* 🆕 Cantidad, motivo, y a quién se le entrega — antes solo
                se podía guardar "qué es" sin saber a dónde fue ni por qué. */}
            <input placeholder="¿Qué es? (ej: Playeras talla M, 100 gorras)" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Cantidad entregada" type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">¿Para qué fue?</label>
              <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                {Object.entries(MOTIVO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <input placeholder="¿A quién se le entregó? (nombre)" value={form.destinatario} onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </>
        ) : (
          <>
            <input placeholder="Empresa/proveedor" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <input placeholder="Costo" type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <div className="flex-1">
                <label className="text-[9px] text-slate-500">Fecha de colocación</label>
                <input type="date" value={form.fecha_ini} onChange={(e) => setForm({ ...form, fecha_ini: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </div>
            </div>
            {['barda', 'espectacular', 'manta'].includes(form.tipo) && (
              <p className="text-[9px] text-amber-400">⚠️ Si se coloca antes del inicio oficial de campaña, el sistema te avisará al guardar (riesgo de "acto anticipado")</p>
            )}
            <input placeholder="Vence" type="date" value={form.fecha_vence} onChange={(e) => setForm({ ...form, fecha_vence: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/** 🆕 Modal de entregas — historial de a quién se le fue dando este
 *  artículo, con cuántos promovidos generó cada entrega, y para
 *  registrar una entrega nueva sin tener que crear el artículo otra vez. */
function ModalEntregas({ activo, onCerrar }) {
  const [entregas, setEntregas] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ cantidad: '', motivo: 'promocion_voto', destinatario: '', seccion_numero: '' });
  const [error, setError] = useState('');

  const cargar = () => {
    api.get(`/activos/${activo.id}/entregas`).then((r) => setEntregas(r.data.data)).catch(() => setEntregas([]));
  };
  useEffect(cargar, [activo.id]);

  const registrarEntrega = async () => {
    setError('');
    try {
      await api.post(`/activos/${activo.id}/entregas`, {
        ...form,
        cantidad: parseInt(form.cantidad),
        seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined,
      });
      setForm({ cantidad: '', motivo: 'promocion_voto', destinatario: '', seccion_numero: '' });
      setMostrarForm(false);
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar'); }
  };

  const totalEntregado = entregas?.reduce((s, e) => s + e.cantidad, 0) || 0;
  const totalPromovidos = entregas?.reduce((s, e) => s + e.promovidos_generados, 0) || 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">📦 Entregas — {activo.direccion}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>

        {entregas && entregas.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
              <div className="text-lg font-black text-white">{totalEntregado}</div>
              <div className="text-[9px] text-slate-500">Piezas entregadas en total</div>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2.5 text-center">
              <div className="text-lg font-black text-emerald-400">{totalPromovidos}</div>
              <div className="text-[9px] text-slate-500">Promovidos generados cerca</div>
            </div>
          </div>
        )}

        {!mostrarForm ? (
          <button onClick={() => setMostrarForm(true)} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">
            + Registrar otra entrega
          </button>
        ) : (
          <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
            {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-2 py-1.5">{error}</div>}
            <input placeholder="Cantidad" type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm">
              {Object.entries(MOTIVO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="¿A quién?" value={form.destinatario} onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <input placeholder="Sección (opcional)" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setMostrarForm(false)} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">Cancelar</button>
              <button onClick={registrarEntrega} disabled={!form.cantidad || !form.destinatario} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar entrega</button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {entregas === null ? (
            <div className="text-center text-slate-500 text-xs py-6">⏳ Cargando...</div>
          ) : entregas.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-6">Sin entregas registradas todavía</div>
          ) : entregas.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">{e.cantidad} piezas — {e.destinatario}</div>
                  <div className="text-[9px] text-slate-500">{MOTIVO_LABEL[e.motivo]} · {new Date(e.fecha).toLocaleDateString('es-MX')}{e.seccion_numero && ` · Sección ${e.seccion_numero}`}</div>
                </div>
                {e.promovidos_generados > 0 && (
                  <span className="text-[10px] font-bold text-emerald-400">+{e.promovidos_generados} promovidos</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Activos() {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [entregasDe, setEntregasDe] = useState(null);

  const [error, setError] = useState('');
  const cargar = () => {
    setError('');
    api.get('/activos').then((r) => setLista(r.data.data)).catch((e) => {
      setError(e.response?.data?.error || 'No se pudo cargar la lista de activos. Revisa tu conexión e intenta de nuevo.');
    });
  };
  useEffect(cargar, []);

  const cambiarEstado = async (id, estado) => {
    try { await api.patch(`/activos/${id}/estado`, { estado }); cargar(); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo cambiar el estado'); }
  };
  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este activo?')) return;
    try { await api.delete(`/activos/${id}`); cargar(); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo eliminar'); }
  };

  const filtrados = filtro === 'todos' ? lista : lista.filter((a) => a.tipo === filtro);

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">📺 Activos de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro('todos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Todos ({lista.length})</button>
          {Object.entries(TIPO_LABEL).map(([k, v]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {v.ic} {v.label} ({lista.filter((a) => a.tipo === k).length})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2.5">⚠️ {error} <button onClick={cargar} className="underline font-bold ml-1">Reintentar</button></div>}
          {filtrados.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Sin activos registrados en esta categoría</div>
          ) : filtrados.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{(TIPO_LABEL[a.tipo]?.ic || '📦')} {a.tipo === 'ine_representante' ? a.nombre_rep : (a.direccion || 'Sin dirección')}</div>
                  <div className="text-[10px] text-slate-500">
                    {a.seccion_numero && `Sección ${a.seccion_numero} · `}
                    {a.tipo === 'ine_representante' ? a.telefono_rep : a.tipo === 'utilitario' ? `${a.cantidad || 0} piezas` : a.empresa}
                    {a.fecha_vence && ` · vence ${new Date(a.fecha_vence).toLocaleDateString('es-MX')}`}
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${ESTADO_COLOR[a.estado]}`}>{a.estado}</span>
              </div>
              {a.riesgo_acto_anticipado && (
                <div className="mt-2 text-[9px] bg-red-500/10 text-red-400 rounded-lg px-2 py-1.5">
                  ⚠️ Colocado antes del inicio oficial de campaña — riesgo de "acto anticipado", el ITE ha sancionado casos similares
                </div>
              )}
              <div className="flex gap-1.5 mt-2 items-center">
                {a.tipo === 'utilitario' && (
                  <button onClick={() => setEntregasDe(a)} className="text-[10px] text-indigo-400 font-bold">📦 Ver entregas</button>
                )}
                {a.estado !== 'activo' && <button onClick={() => cambiarEstado(a.id, 'activo')} className="text-[10px] text-emerald-400 font-bold">✅ Marcar activo</button>}
                {a.estado !== 'vencido' && <button onClick={() => cambiarEstado(a.id, 'vencido')} className="text-[10px] text-amber-400 font-bold">⏰ Marcar vencido</button>}
                {a.estado !== 'retirado' && <button onClick={() => cambiarEstado(a.id, 'retirado')} className="text-[10px] text-slate-400 font-bold">📦 Marcar retirado</button>}
                <button onClick={() => eliminar(a.id)} className="text-[10px] text-red-400 font-bold ml-auto">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mostrarModal && <ModalAgregarActivo onCerrar={() => setMostrarModal(false)} onGuardado={() => { setMostrarModal(false); cargar(); }} />}
      {entregasDe && <ModalEntregas activo={entregasDe} onCerrar={() => setEntregasDe(null)} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import api from '../lib/api';

/**
 * La brecha real que resuelve esto: un promotor marca a alguien
 * como "persuadible" y ahí se queda — nadie regresa por esa persona
 * a menos que alguien decida hacerlo por su cuenta. Este panel le
 * pone fecha de próximo contacto y responsable a cada persuadible,
 * para que el seguimiento sea un proceso, no una esperanza.
 */
export default function PanelSeguimientoPersuadibles() {
  const [lista, setLista] = useState([]);
  const [soloMios, setSoloMios] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null); // id del promovido en edición
  const [form, setForm] = useState({ notas: '', proximo_seguimiento: '', se_convencio: false });
  const [mensaje, setMensaje] = useState('');

  const cargar = () => {
    setCargando(true);
    api.get(`/promovidos/seguimiento?solo_mios=${soloMios}`).then((r) => { setLista(r.data.data); setCargando(false); });
  };
  useEffect(cargar, [soloMios]);

  const abrirEdicion = (p) => {
    setEditando(p.id);
    setForm({ notas: p.notas_seguimiento || '', proximo_seguimiento: '', se_convencio: false });
    setMensaje('');
  };

  const guardar = async (id) => {
    try {
      const { data } = await api.patch(`/promovidos/${id}/seguimiento`, form);
      setMensaje(data.mensaje || '✅ Guardado');
      setEditando(null);
      cargar();
    } catch (e) { setMensaje(e.response?.data?.error || 'Error al guardar'); }
  };

  if (cargando) return <div className="text-center text-slate-500 py-10">⏳ Cargando...</div>;

  const vencidos = lista.filter((p) => p.vencido);
  const proximos = lista.filter((p) => !p.vencido && p.proximo_seguimiento);
  const sinProgramar = lista.filter((p) => !p.proximo_seguimiento);

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-200 leading-relaxed">
        Aquí viven tus "persuadibles" — la gente que todavía no se compromete. El sistema no los convierte solo a positivo: alguien de tu equipo tiene que volver a hablar con ellos. Esta pantalla existe para que ese seguimiento no se pierda.
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} />
        Mostrar solo los que me toca a mí dar seguimiento
      </label>

      {mensaje && <div className="bg-emerald-500/10 text-emerald-400 text-xs rounded-lg px-3 py-2">{mensaje}</div>}

      {lista.length === 0 ? (
        <div className="text-center text-slate-500 py-10">🎉 Sin persuadibles pendientes — todos están comprometidos o clasificados de otra forma</div>
      ) : (
        <>
          {vencidos.length > 0 && (
            <div>
              <div className="text-xs font-bold text-red-400 uppercase mb-2">🔴 Vencidos — {vencidos.length}, se pasó la fecha para volver a contactarlos</div>
              <div className="space-y-2">{vencidos.map((p) => (
                <TarjetaPersuadible key={p.id} p={p} editando={editando} form={form} setForm={setForm} abrirEdicion={abrirEdicion} guardar={guardar} urgente />
              ))}</div>
            </div>
          )}
          {proximos.length > 0 && (
            <div>
              <div className="text-xs font-bold text-amber-400 uppercase mb-2">🟡 Programados — {proximos.length}</div>
              <div className="space-y-2">{proximos.map((p) => (
                <TarjetaPersuadible key={p.id} p={p} editando={editando} form={form} setForm={setForm} abrirEdicion={abrirEdicion} guardar={guardar} />
              ))}</div>
            </div>
          )}
          {sinProgramar.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">⚪ Sin fecha programada todavía — {sinProgramar.length}</div>
              <div className="space-y-2">{sinProgramar.map((p) => (
                <TarjetaPersuadible key={p.id} p={p} editando={editando} form={form} setForm={setForm} abrirEdicion={abrirEdicion} guardar={guardar} />
              ))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaPersuadible({ p, editando, form, setForm, abrirEdicion, guardar, urgente }) {
  const abierto = editando === p.id;
  return (
    <div className={`rounded-xl border p-3 ${urgente ? 'bg-red-500/5 border-red-500/30' : 'bg-slate-900/60 border-slate-800'}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-white">{p.nombre}</div>
          <div className="text-[10px] text-slate-500">
            {p.seccion_numero ? `Sección ${p.seccion_numero}` : 'Sin sección'} · {p.veces_contactado} contacto(s) previo(s)
            {p.asignado_a_nombre && ` · Le toca a ${p.asignado_a_nombre}`}
            {p.proximo_seguimiento && ` · Próximo: ${new Date(p.proximo_seguimiento).toLocaleDateString('es-MX')}`}
          </div>
        </div>
        {!abierto && <button onClick={() => abrirEdicion(p)} className="text-[10px] font-bold text-indigo-400">Registrar contacto</button>}
      </div>

      {p.notas_seguimiento && !abierto && <p className="text-[10px] text-slate-500 mt-1.5 italic">"{p.notas_seguimiento}"</p>}

      {abierto && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          <textarea placeholder="¿Qué pasó en esta plática?" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" rows={2} />
          <label className="flex items-center gap-2 text-xs text-emerald-400 font-bold cursor-pointer">
            <input type="checkbox" checked={form.se_convencio} onChange={(e) => setForm({ ...form, se_convencio: e.target.checked })} />
            🎉 Se convenció — pasar a Base / Comprometido
          </label>
          {!form.se_convencio && (
            <div>
              <label className="text-[10px] text-slate-500">¿Cuándo volver a intentarlo?</label>
              <input type="date" value={form.proximo_seguimiento} onChange={(e) => setForm({ ...form, proximo_seguimiento: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
            </div>
          )}
          <button onClick={() => guardar(p.id)} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar</button>
        </div>
      )}
    </div>
  );
}

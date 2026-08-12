import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';
import BuscadorCalle from '../components/BuscadorCalle';

const CATEGORIAS = ['utilitarios', 'propaganda_impresa', 'espectaculares', 'eventos', 'transporte', 'personal', 'tecnologia', 'publicidad_digital', 'otro'];
const TIPO_COMPROBANTE = { factura: '🧾 Factura', nota: '📝 Nota de venta', recibo: '🧻 Recibo', sin_comprobante: '⚠️ Sin comprobante' };
const TIPO_INGRESO = {
  aportacion_efectivo: '💵 Aportación en efectivo', aportacion_especie: '📦 Aportación en especie',
  autofinanciamiento: '🏦 Autofinanciamiento', financiamiento_publico: '🏛️ Financiamiento público',
  rendimientos_financieros: '📈 Rendimientos financieros',
};
// 🆕 De qué tipo de persona viene el dinero — el sistema avisa (sin
// bloquear) si cae en una fuente que la LGPP prohíbe expresamente.
const TIPO_PERSONA = {
  fisica_no_militante: 'Persona física (no militante)', fisica_militante: 'Persona física — militante del partido',
  gobierno: '🚫 Gobierno/dependencia pública', extranjero: '🚫 Persona extranjera',
  iglesia_o_culto: '🚫 Iglesia o asociación religiosa', empresa_mercantil: '🚫 Empresa mercantil',
  organismo_internacional: '🚫 Organismo internacional', anonimo: '🚫 Anónimo / no identificado',
};
const TIPO_ACTIVO = {
  espectacular: { ic: '📺', label: 'Espectacular' }, barda: { ic: '🧱', label: 'Barda' },
  manta: { ic: '🎏', label: 'Manta/Lona' }, ine_representante: { ic: '🪪', label: 'Representante INE' },
  utilitario: { ic: '👕', label: 'Utilitario (playeras, gorras, etc.)' },
};
const ESTADO_ACTIVO_COLOR = { activo: 'text-emerald-400 bg-emerald-500/10', vencido: 'text-red-400 bg-red-500/10', retirado: 'text-slate-500 bg-slate-500/10', baja: 'text-slate-500 bg-slate-500/10' };
const MOTIVO_LABEL = { promocion_voto: '🗳️ Promoción del voto', reunion: '👥 Reunión', otro: '📦 Otro' };
const DESTINO_BAJA_LABEL = {
  transferido_partido: '🏛️ Transferido al partido', vendido: '💰 Vendido', donado: '🎁 Donado',
  destruido: '🗑️ Destruido', devuelto_comodato: '↩️ Devuelto (comodato)', perdido: '❓ Perdido/robado',
};
const NIVEL_TOPE_ESTILO = {
  ok: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Dentro de rango normal' },
  medio: { color: 'text-amber-400', bg: 'bg-amber-500', label: '70%+ del tope — empieza a monitorear de cerca' },
  alto: { color: 'text-orange-400', bg: 'bg-orange-500', label: '85%+ del tope — atención alta' },
  critico: { color: 'text-red-400', bg: 'bg-red-500', label: '95%+ del tope — riesgo real, revisa con tu contador' },
  rebasado: { color: 'text-red-300', bg: 'bg-red-700', label: '⚠️ TOPE REBASADO — el rebase puede causar nulidad de la elección (Art. 76 LGPP)' },
};

/** Subir foto de comprobante/recibo — se usa tanto en gastos como en ingresos. */
function BotonEvidencia({ url, onSubir }) {
  const [subiendo, setSubiendo] = useState(false);
  const manejar = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    const formData = new FormData();
    formData.append('foto', archivo);
    try { await onSubir(formData); } catch (e) { alert('No se pudo subir la foto'); }
    setSubiendo(false);
  };
  if (url) return <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-400 font-bold">📎 Ver comprobante</a>;
  return (
    <label className="text-[10px] text-slate-500 font-bold cursor-pointer">
      {subiendo ? '⏳...' : '📷 Agregar evidencia'}
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => manejar(e.target.files[0])} />
    </label>
  );
}

/** Modal para agregar un nuevo activo — mismo formulario que ya existía en Activos.jsx. */
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
      if (data.alerta_legal) alert(data.alerta_legal);
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
          {Object.entries(TIPO_ACTIVO).map(([k, v]) => <option key={k} value={k}>{v.ic} {v.label}</option>)}
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

/** Modal de entregas de un utilitario — igual que antes en Activos.jsx. */
function ModalEntregas({ activo, onCerrar }) {
  const [entregas, setEntregas] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ cantidad: '', motivo: 'promocion_voto', destinatario: '', seccion_numero: '' });
  const [error, setError] = useState('');

  const cargar = () => { api.get(`/activos/${activo.id}/entregas`).then((r) => setEntregas(r.data.data)).catch(() => setEntregas([])); };
  useEffect(cargar, [activo.id]);

  const registrarEntrega = async () => {
    setError('');
    try {
      await api.post(`/activos/${activo.id}/entregas`, { ...form, cantidad: parseInt(form.cantidad), seccion_numero: form.seccion_numero ? parseInt(form.seccion_numero) : undefined });
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
            <div className="bg-slate-800/60 rounded-lg p-2.5 text-center"><div className="text-lg font-black text-white">{totalEntregado}</div><div className="text-[9px] text-slate-500">Piezas entregadas</div></div>
            <div className="bg-emerald-500/10 rounded-lg p-2.5 text-center"><div className="text-lg font-black text-emerald-400">{totalPromovidos}</div><div className="text-[9px] text-slate-500">Promovidos generados</div></div>
          </div>
        )}
        {!mostrarForm ? (
          <button onClick={() => setMostrarForm(true)} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">+ Registrar otra entrega</button>
        ) : (
          <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
            {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-2 py-1.5">{error}</div>}
            <input placeholder="Cantidad" type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm">
              {Object.entries(MOTIVO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="¿A quién?" value={form.destinatario} onChange={(e) => setForm({ ...form, destinatario: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <input placeholder="Sección (opcional)" type="number" value={form.seccion_numero} onChange={(e) => setForm({ ...form, seccion_numero: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setMostrarForm(false)} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold">Cancelar</button>
              <button onClick={registrarEntrega} disabled={!form.cantidad || !form.destinatario} className="flex-[2] py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">Guardar entrega</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {entregas === null ? <div className="text-center text-slate-500 text-xs py-6">⏳ Cargando...</div> :
           entregas.length === 0 ? <div className="text-center text-slate-500 text-xs py-6">Sin entregas registradas todavía</div> :
           entregas.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">{e.cantidad} piezas — {e.destinatario}</div>
                  <div className="text-[9px] text-slate-500">{MOTIVO_LABEL[e.motivo]} · {new Date(e.fecha).toLocaleDateString('es-MX')}{e.seccion_numero && ` · Sección ${e.seccion_numero}`}</div>
                </div>
                {e.promovidos_generados > 0 && <span className="text-[10px] font-bold text-emerald-400">+{e.promovidos_generados} promovidos</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 🆕 Modal para asignar/cambiar el responsable de un activo. */
function ModalResponsable({ activo, equipo, onCerrar, onGuardado }) {
  const [responsableId, setResponsableId] = useState(activo.responsable_id || '');
  const guardar = async () => {
    if (!responsableId) return;
    await api.patch(`/activos/${activo.id}/responsable`, { responsable_id: responsableId });
    onGuardado();
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-white">👤 Asignar responsable</h2>
        <p className="text-[10px] text-slate-500">{TIPO_ACTIVO[activo.tipo]?.ic} {activo.direccion || activo.nombre_rep} · {activo.codigo_inventario}</p>
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          <option value="">Selecciona a alguien de tu equipo...</option>
          {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre} — {u.puesto || u.rol}</option>)}
        </select>
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} disabled={!responsableId} className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">Asignar</button>
        </div>
      </div>
    </div>
  );
}

/** 🆕 Modal para dar de baja un activo — pide qué pasó con él y por qué,
 *  tal como exige el control de inventarios del Reglamento de Fiscalización. */
function ModalBaja({ activo, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ destino_baja: 'transferido_partido', motivo_baja: '', valor_venta: '' });
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [evidenciaUrl, setEvidenciaUrl] = useState('');
  const [error, setError] = useState('');

  const subirEvidencia = async (archivo) => {
    setSubiendoEvidencia(true);
    const fd = new FormData();
    fd.append('foto', archivo);
    try {
      const { data } = await api.post('/activos/evidencia-baja', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEvidenciaUrl(data.data.url);
    } catch (e) { /* si falla, se puede dar de baja igual sin evidencia */ }
    setSubiendoEvidencia(false);
  };

  const guardar = async () => {
    if (!form.motivo_baja.trim()) { setError('Explica brevemente qué pasó'); return; }
    try {
      await api.post(`/activos/${activo.id}/baja`, {
        destino_baja: form.destino_baja,
        motivo_baja: form.motivo_baja,
        valor_venta: form.valor_venta ? parseFloat(form.valor_venta) : undefined,
        evidencia_baja_url: evidenciaUrl || undefined,
      });
      onGuardado();
    } catch (err) { setError(err.response?.data?.error || 'Error al dar de baja'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-red-800/40 rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-white">🗑️ Dar de baja</h2>
        <p className="text-[10px] text-slate-500">{TIPO_ACTIVO[activo.tipo]?.ic} {activo.direccion || activo.nombre_rep} · {activo.codigo_inventario}</p>
        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-[10px] text-slate-500 font-bold block mb-1">¿Qué pasó con el bien?</label>
          <select value={form.destino_baja} onChange={(e) => setForm({ ...form, destino_baja: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            {Object.entries(DESTINO_BAJA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.destino_baja === 'vendido' && (
          <input placeholder="¿Por cuánto se vendió?" type="number" value={form.valor_venta} onChange={(e) => setForm({ ...form, valor_venta: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        )}
        <textarea placeholder="Explica brevemente (ej: se entregó firma de recibido al partido el 15 de junio)" value={form.motivo_baja}
          onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })} rows={2}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
        <div>
          <label className="text-[10px] text-slate-500 font-bold block mb-1">Evidencia (acta de entrega, foto, etc.) — opcional</label>
          {evidenciaUrl ? (
            <span className="text-[10px] text-emerald-400">✅ Evidencia adjuntada</span>
          ) : (
            <label className="text-[10px] text-indigo-400 font-bold cursor-pointer">
              {subiendoEvidencia ? '⏳ Subiendo...' : '📷 Adjuntar foto/documento'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirEvidencia(e.target.files[0])} />
            </label>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
          <button onClick={guardar} className="flex-[2] py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold">Confirmar baja</button>
        </div>
      </div>
    </div>
  );
}

/** 🆕 Modal de kardex — historial completo de movimientos de un activo. */
function ModalKardex({ activo, onCerrar }) {
  const [kardex, setKardex] = useState(null);
  useEffect(() => { api.get(`/activos/${activo.id}/kardex`).then((r) => setKardex(r.data.data)).catch(() => setKardex([])); }, [activo.id]);
  const ICONO_MOVIMIENTO = { alta: '🟢', traspaso: '🔄', baja: '🔴' };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">📋 Kardex — {activo.codigo_inventario}</h2>
          <button onClick={onCerrar} className="text-slate-500">✕</button>
        </div>
        <div className="space-y-2">
          {kardex === null ? <div className="text-center text-slate-500 text-xs py-6">⏳ Cargando...</div> :
           kardex.length === 0 ? <div className="text-center text-slate-500 text-xs py-6">Sin movimientos registrados</div> :
           kardex.map((k) => (
            <div key={k.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-2.5">
              <div className="flex items-center gap-2">
                <span>{ICONO_MOVIMIENTO[k.tipo_movimiento] || '•'}</span>
                <span className="text-xs font-bold text-white capitalize">{k.tipo_movimiento}</span>
                <span className="text-[9px] text-slate-500 ml-auto">{new Date(k.creado_en).toLocaleDateString('es-MX')}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{k.descripcion}</p>
              {(k.responsable_anterior_nombre || k.responsable_nuevo_nombre) && (
                <p className="text-[9px] text-slate-500 mt-0.5">{k.responsable_anterior_nombre || 'Sin asignar'} → {k.responsable_nuevo_nombre || 'Sin asignar'}</p>
              )}
              <p className="text-[9px] text-slate-600 mt-0.5">Por: {k.realizado_por_nombre}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Administracion() {
  const [tab, setTab] = useState('gastos'); // gastos | ingresos | activos | bodega | tope | exportar

  // ── GASTOS / INGRESOS (ya existía en Finanzas.jsx) ──
  const [gastos, setGastos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [mostrarFormGasto, setMostrarFormGasto] = useState(false);
  const [mostrarFormIngreso, setMostrarFormIngreso] = useState(false);
  const [formGasto, setFormGasto] = useState({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), tipo_comprobante: 'sin_comprobante', numero_comprobante: '', proveedor: '' });
  const [formIngreso, setFormIngreso] = useState({ tipo_ingreso: 'aportacion_efectivo', tipo_persona: 'fisica_no_militante', aportante_nombre: '', aportante_identificacion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), forma_recepcion: 'transferencia', numero_recibo: '' });
  const [tope, setTope] = useState('');
  const [bodega, setBodega] = useState([]);
  const [utilitarioModo, setUtilitarioModo] = useState('nuevo');
  const [utilitarioForm, setUtilitarioForm] = useState({ tipo: '', cantidad: '', activo_id: '' });

  // ── ACTIVOS ──
  const [listaActivos, setListaActivos] = useState([]);
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const [mostrarModalActivo, setMostrarModalActivo] = useState(false);
  const [entregasDe, setEntregasDe] = useState(null);
  const [responsableDe, setResponsableDe] = useState(null);
  const [bajaDe, setBajaDe] = useState(null);
  const [kardexDe, setKardexDe] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [resumenActivos, setResumenActivos] = useState(null);
  const [errorActivos, setErrorActivos] = useState('');

  const cargarFinanzas = () => api.get('/finanzas').then((r) => { setGastos(r.data.data); setIngresos(r.data.ingresos); setResumen(r.data.resumen); });
  const cargarBodega = () => api.get('/activos/bodega').then((r) => setBodega(r.data.data)).catch(() => setBodega([]));
  const cargarActivos = () => {
    setErrorActivos('');
    api.get('/activos').then((r) => setListaActivos(r.data.data)).catch((e) => setErrorActivos(e.response?.data?.error || 'No se pudo cargar la lista de activos.'));
  };
  const cargarResumenActivos = () => api.get('/activos/resumen').then((r) => setResumenActivos(r.data.data)).catch(() => setResumenActivos(null));

  useEffect(() => {
    cargarFinanzas();
    cargarBodega();
    cargarActivos();
    cargarResumenActivos();
    api.get('/estructura').then((r) => setEquipo(r.data.data.filter((u) => u.activo !== false))).catch(() => setEquipo([]));
  }, []);

  const guardarGasto = async () => {
    const payload = { ...formGasto, monto: parseFloat(formGasto.monto) };
    if (formGasto.categoria === 'utilitarios') {
      payload.utilitario_cantidad = parseInt(utilitarioForm.cantidad);
      if (utilitarioModo === 'restock') payload.utilitario_activo_id = utilitarioForm.activo_id;
      else payload.utilitario_tipo = utilitarioForm.tipo;
    }
    await api.post('/finanzas', payload);
    setFormGasto({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), tipo_comprobante: 'sin_comprobante', numero_comprobante: '', proveedor: '' });
    setUtilitarioForm({ tipo: '', cantidad: '', activo_id: '' });
    setMostrarFormGasto(false);
    cargarFinanzas();
    cargarBodega();
  };

  const guardarIngreso = async () => {
    const { data } = await api.post('/finanzas/ingresos', { ...formIngreso, monto: parseFloat(formIngreso.monto) });
    if (data.alerta_fuente_prohibida) alert(data.alerta_fuente_prohibida);
    setFormIngreso({ tipo_ingreso: 'aportacion_efectivo', tipo_persona: 'fisica_no_militante', aportante_nombre: '', aportante_identificacion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), forma_recepcion: 'transferencia', numero_recibo: '' });
    setMostrarFormIngreso(false);
    cargarFinanzas();
  };

  const guardarTope = async () => { await api.put('/finanzas/tope', { tope: parseFloat(tope) }); setTope(''); cargarFinanzas(); };

  const cambiarEstadoActivo = async (id, estado) => {
    try { await api.patch(`/activos/${id}/estado`, { estado }); cargarActivos(); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo cambiar el estado'); }
  };
  const eliminarActivo = async (id) => {
    if (!confirm('¿Eliminar este activo?')) return;
    try { await api.delete(`/activos/${id}`); cargarActivos(); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo eliminar'); }
  };

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
  const puedeGuardarGasto = formGasto.descripcion && formGasto.monto &&
    (formGasto.categoria !== 'utilitarios' || (utilitarioForm.cantidad && (utilitarioModo === 'restock' ? utilitarioForm.activo_id : utilitarioForm.tipo)));
  const filtradosActivos = filtroActivo === 'todos' ? listaActivos : listaActivos.filter((a) => a.tipo === filtroActivo);

  const TABS = [
    { id: 'gastos', ic: '💸', label: 'Gastos' },
    { id: 'ingresos', ic: '💵', label: 'Ingresos' },
    { id: 'activos', ic: '📺', label: 'Activos' },
    { id: 'bodega', ic: '🏬', label: 'Bodega' },
    { id: 'tope', ic: '🚦', label: 'Tope de Gasto' },
    { id: 'exportar', ic: '📎', label: 'Exportar' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">💼 Administración de Campaña</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        {/* Balance general — siempre visible arriba, sin importar la pestaña */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-emerald-400">{fmt(resumen?.total_ingresos)}</div>
            <div className="text-[9px] text-slate-500">Ingresos totales</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-red-400">{fmt(resumen?.total_gastado)}</div>
            <div className="text-[9px] text-slate-500">Gastos totales</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className={`text-lg font-black ${(resumen?.balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(resumen?.balance)}</div>
            <div className="text-[9px] text-slate-500">Balance</div>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-2 flex-wrap border-b border-slate-800 pb-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <span>{t.ic}</span>{t.label}
              {t.id === 'tope' && resumen?.nivel_alerta_tope && resumen.nivel_alerta_tope !== 'ok' && (
                <span className={`w-1.5 h-1.5 rounded-full ${NIVEL_TOPE_ESTILO[resumen.nivel_alerta_tope].bg}`} />
              )}
            </button>
          ))}
        </div>

        {/* ═══════════ PESTAÑA: GASTOS ═══════════ */}
        {tab === 'gastos' && (
          <div className="space-y-3">
            <button onClick={() => setMostrarFormGasto(!mostrarFormGasto)} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">
              {mostrarFormGasto ? 'Cancelar' : '+ Nuevo gasto'}
            </button>
            {resumen?.gastos_sin_comprobante > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
                ⚠️ {resumen.gastos_sin_comprobante} gasto(s) sin comprobante todavía — el INE puede observarlos al fiscalizar.
              </div>
            )}
            {mostrarFormGasto && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                <select value={formGasto.categoria} onChange={(e) => setFormGasto({ ...formGasto, categoria: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
                {formGasto.categoria === 'utilitarios' && (
                  <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 space-y-2">
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setUtilitarioModo('nuevo')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${utilitarioModo === 'nuevo' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>+ Artículo nuevo</button>
                      <button type="button" onClick={() => setUtilitarioModo('restock')} disabled={bodega.length === 0} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-30 ${utilitarioModo === 'restock' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔁 Reabastecer</button>
                    </div>
                    {utilitarioModo === 'nuevo' ? (
                      <input placeholder="¿Qué es? (ej: Playeras talla M)" value={utilitarioForm.tipo} onChange={(e) => setUtilitarioForm({ ...utilitarioForm, tipo: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                    ) : (
                      <select value={utilitarioForm.activo_id} onChange={(e) => setUtilitarioForm({ ...utilitarioForm, activo_id: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs">
                        <option value="">Selecciona el artículo...</option>
                        {bodega.map((b) => <option key={b.id} value={b.id}>{b.subtipo} (hay {b.en_bodega} en bodega)</option>)}
                      </select>
                    )}
                    <input placeholder="Cantidad de piezas compradas" type="number" value={utilitarioForm.cantidad} onChange={(e) => setUtilitarioForm({ ...utilitarioForm, cantidad: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                  </div>
                )}
                <input placeholder="Descripción" value={formGasto.descripcion} onChange={(e) => setFormGasto({ ...formGasto, descripcion: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Proveedor (opcional)" value={formGasto.proveedor} onChange={(e) => setFormGasto({ ...formGasto, proveedor: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <div className="flex gap-2">
                  <input type="number" placeholder="Monto" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                  <input type="date" value={formGasto.fecha} onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                </div>
                <div className="flex gap-2">
                  <select value={formGasto.tipo_comprobante} onChange={(e) => setFormGasto({ ...formGasto, tipo_comprobante: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                    {Object.entries(TIPO_COMPROBANTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {formGasto.tipo_comprobante !== 'sin_comprobante' && (
                    <input placeholder="N° folio/factura" value={formGasto.numero_comprobante} onChange={(e) => setFormGasto({ ...formGasto, numero_comprobante: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                  )}
                </div>
                <button onClick={guardarGasto} disabled={!puedeGuardarGasto} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Guardar gasto</button>
              </div>
            )}
            <div className="space-y-2">
              {gastos.map((g) => (
                <div key={g.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{g.descripcion}</div>
                      <div className="text-[10px] text-slate-500">{g.categoria.replace('_', ' ')} · {new Date(g.fecha).toLocaleDateString('es-MX')}{g.proveedor && ` · ${g.proveedor}`}</div>
                    </div>
                    <div className="text-sm font-black text-red-400">{fmt(g.monto)}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-slate-500">{TIPO_COMPROBANTE[g.tipo_comprobante] || TIPO_COMPROBANTE.sin_comprobante}{g.numero_comprobante && ` · Folio ${g.numero_comprobante}`}</span>
                    <BotonEvidencia url={g.evidencia_url} onSubir={(fd) => api.post(`/finanzas/${g.id}/evidencia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(cargarFinanzas)} />
                  </div>
                </div>
              ))}
              {gastos.length === 0 && <div className="text-center text-slate-500 py-10">Sin gastos registrados</div>}
            </div>
          </div>
        )}

        {/* ═══════════ PESTAÑA: INGRESOS ═══════════ */}
        {tab === 'ingresos' && (
          <div className="space-y-3">
            <button onClick={() => setMostrarFormIngreso(!mostrarFormIngreso)} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              {mostrarFormIngreso ? 'Cancelar' : '+ Nuevo ingreso'}
            </button>
            {mostrarFormIngreso && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                <select value={formIngreso.tipo_ingreso} onChange={(e) => setFormIngreso({ ...formIngreso, tipo_ingreso: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  {Object.entries(TIPO_INGRESO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">¿De qué tipo de persona viene el dinero?</label>
                  <select value={formIngreso.tipo_persona} onChange={(e) => setFormIngreso({ ...formIngreso, tipo_persona: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                    {Object.entries(TIPO_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {['gobierno', 'extranjero', 'iglesia_o_culto', 'empresa_mercantil', 'organismo_internacional', 'anonimo'].includes(formIngreso.tipo_persona) && (
                    <p className="text-[9px] text-red-400 mt-1">⚠️ Esta fuente está prohibida por la Ley General de Partidos Políticos (Art. 54) — al guardar, el sistema te lo confirmará.</p>
                  )}
                </div>
                {formIngreso.tipo_ingreso.startsWith('aportacion') && (
                  <div className="flex gap-2">
                    <input placeholder="Nombre del aportante" value={formIngreso.aportante_nombre} onChange={(e) => setFormIngreso({ ...formIngreso, aportante_nombre: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                    <input placeholder="CURP/RFC" value={formIngreso.aportante_identificacion} onChange={(e) => setFormIngreso({ ...formIngreso, aportante_identificacion: e.target.value })} className="w-32 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="number" placeholder="Monto" value={formIngreso.monto} onChange={(e) => setFormIngreso({ ...formIngreso, monto: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                  <input type="date" value={formIngreso.fecha} onChange={(e) => setFormIngreso({ ...formIngreso, fecha: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                </div>
                <div className="flex gap-2">
                  <select value={formIngreso.forma_recepcion} onChange={(e) => setFormIngreso({ ...formIngreso, forma_recepcion: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                    <option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="especie">En especie</option>
                  </select>
                  <input placeholder="N° recibo de aportación" value={formIngreso.numero_recibo} onChange={(e) => setFormIngreso({ ...formIngreso, numero_recibo: e.target.value })} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                </div>
                <button onClick={guardarIngreso} disabled={!formIngreso.monto} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Guardar ingreso</button>
              </div>
            )}
            <div className="space-y-2">
              {ingresos.map((i) => (
                <div key={i.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{i.aportante_nombre || TIPO_INGRESO[i.tipo_ingreso]}</div>
                      <div className="text-[10px] text-slate-500">{TIPO_INGRESO[i.tipo_ingreso]} · {new Date(i.fecha).toLocaleDateString('es-MX')} · {i.forma_recepcion}</div>
                    </div>
                    <div className="text-sm font-black text-emerald-400">{fmt(i.monto)}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-slate-500">{i.numero_recibo ? `Recibo ${i.numero_recibo}` : 'Sin número de recibo'}</span>
                    <BotonEvidencia url={i.evidencia_url} onSubir={(fd) => api.post(`/finanzas/ingresos/${i.id}/evidencia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(cargarFinanzas)} />
                  </div>
                </div>
              ))}
              {ingresos.length === 0 && <div className="text-center text-slate-500 py-10">Sin ingresos registrados</div>}
            </div>
          </div>
        )}

        {/* ═══════════ PESTAÑA: ACTIVOS ═══════════ */}
        {tab === 'activos' && (
          <div className="space-y-3">
            {resumenActivos && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-white">{resumenActivos.total_activos}</div>
                  <div className="text-[9px] text-slate-500">Activos totales</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-indigo-400">{fmt(resumenActivos.valor_original_total)}</div>
                  <div className="text-[9px] text-slate-500">Valor de compra</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-amber-400">{fmt(resumenActivos.valor_depreciado_total)}</div>
                  <div className="text-[9px] text-slate-500">Valor actual (informativo)</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-emerald-400">{resumenActivos.por_estado?.baja || 0}</div>
                  <div className="text-[9px] text-slate-500">Dados de baja</div>
                </div>
              </div>
            )}
            <p className="text-[9px] text-slate-600">El valor actual es un cálculo informativo interno (depreciación lineal simple) — nunca se presenta como cifra oficial ante el INE.</p>

            <div className="flex items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFiltroActivo('todos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtroActivo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Todos ({listaActivos.length})</button>
                {Object.entries(TIPO_ACTIVO).map(([k, v]) => (
                  <button key={k} onClick={() => setFiltroActivo(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtroActivo === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {v.ic} {v.label} ({listaActivos.filter((a) => a.tipo === k).length})
                  </button>
                ))}
              </div>
              <button onClick={() => setMostrarModalActivo(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold whitespace-nowrap">+ Agregar</button>
            </div>

            <div className="space-y-2">
              {errorActivos && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2.5">⚠️ {errorActivos} <button onClick={cargarActivos} className="underline font-bold ml-1">Reintentar</button></div>}
              {filtradosActivos.length === 0 ? (
                <div className="text-center text-slate-500 py-10">Sin activos registrados en esta categoría</div>
              ) : filtradosActivos.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{(TIPO_ACTIVO[a.tipo]?.ic || '📦')} {a.tipo === 'ine_representante' ? a.nombre_rep : (a.direccion || 'Sin dirección')}</div>
                      <div className="text-[10px] text-slate-500">
                        {a.codigo_inventario && `${a.codigo_inventario} · `}
                        {a.seccion_numero && `Sección ${a.seccion_numero} · `}
                        {a.tipo === 'ine_representante' ? a.telefono_rep : a.tipo === 'utilitario' ? `${a.cantidad || 0} piezas` : a.empresa}
                        {a.fecha_vence && ` · vence ${new Date(a.fecha_vence).toLocaleDateString('es-MX')}`}
                      </div>
                      {a.responsable_nombre && <div className="text-[10px] text-indigo-400 mt-0.5">👤 {a.responsable_nombre}</div>}
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${ESTADO_ACTIVO_COLOR[a.estado] || ESTADO_ACTIVO_COLOR.activo}`}>{a.estado === 'baja' ? (DESTINO_BAJA_LABEL[a.destino_baja] || 'De baja') : a.estado}</span>
                  </div>
                  {a.riesgo_acto_anticipado && (
                    <div className="mt-2 text-[9px] bg-red-500/10 text-red-400 rounded-lg px-2 py-1.5">
                      ⚠️ Colocado antes del inicio oficial de campaña — riesgo de "acto anticipado", el ITE ha sancionado casos similares
                    </div>
                  )}
                  <div className="flex gap-2 mt-2 items-center flex-wrap">
                    {a.tipo === 'utilitario' && <button onClick={() => setEntregasDe(a)} className="text-[10px] text-indigo-400 font-bold">📦 Entregas</button>}
                    {a.estado !== 'baja' && <button onClick={() => setResponsableDe(a)} className="text-[10px] text-purple-400 font-bold">👤 Asignar responsable</button>}
                    <button onClick={() => setKardexDe(a)} className="text-[10px] text-slate-400 font-bold">📋 Kardex</button>
                    {a.estado !== 'baja' && (
                      <>
                        {a.estado !== 'activo' && <button onClick={() => cambiarEstadoActivo(a.id, 'activo')} className="text-[10px] text-emerald-400 font-bold">✅ Activo</button>}
                        {a.estado !== 'vencido' && <button onClick={() => cambiarEstadoActivo(a.id, 'vencido')} className="text-[10px] text-amber-400 font-bold">⏰ Vencido</button>}
                        <button onClick={() => setBajaDe(a)} className="text-[10px] text-red-400 font-bold">🗑️ Dar de baja</button>
                      </>
                    )}
                    <button onClick={() => eliminarActivo(a.id)} className="text-[10px] text-red-600 font-bold ml-auto">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════ PESTAÑA: BODEGA ═══════════ */}
        {tab === 'bodega' && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-teal-300">🏬 Bodega de Utilitarios</h2>
            <p className="text-[10px] text-slate-500 mb-2">Se actualiza sola cada vez que registras un gasto de utilitarios (pestaña Gastos) o entregas piezas (pestaña Activos).</p>
            {bodega.length === 0 ? (
              <div className="text-center text-slate-500 py-10">Sin utilitarios registrados todavía</div>
            ) : (
              <div className="space-y-1.5">
                {bodega.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
                    <span className="font-bold text-white capitalize">{b.subtipo}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-400">Comprado: <strong className="text-white">{b.comprado}</strong></span>
                      <span className="text-amber-400">Entregado: <strong>{b.entregado}</strong></span>
                      <span className={`font-bold ${b.en_bodega <= 0 ? 'text-red-400' : b.en_bodega < b.comprado * 0.2 ? 'text-amber-400' : 'text-emerald-400'}`}>En bodega: {b.en_bodega}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ PESTAÑA: TOPE DE GASTO ═══════════ */}
        {tab === 'tope' && (
          <div className="space-y-3">
            {!resumen?.tope_ople ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex gap-2">
                <input placeholder="Define tu tope de gasto OPLE" type="number" value={tope} onChange={(e) => setTope(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <button onClick={guardarTope} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar</button>
              </div>
            ) : (
              <>
                <div className={`rounded-2xl p-5 border ${resumen.nivel_alerta_tope === 'rebasado' ? 'bg-red-950/60 border-red-700' : resumen.nivel_alerta_tope === 'critico' ? 'bg-red-500/10 border-red-500/40' : resumen.nivel_alerta_tope === 'alto' ? 'bg-orange-500/10 border-orange-500/40' : resumen.nivel_alerta_tope === 'medio' ? 'bg-amber-500/10 border-amber-500/40' : 'bg-emerald-500/10 border-emerald-500/40'}`}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Gastado: <strong className="text-white">{fmt(resumen.total_gastado)}</strong></span>
                    <span className="text-slate-300">Tope autorizado: <strong className="text-white">{fmt(resumen.tope_ople)}</strong></span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
                    {[70, 85, 95].map((marca) => <div key={marca} className="absolute top-0 bottom-0 w-px bg-slate-600" style={{ left: `${marca}%` }} />)}
                    <div className={`h-full ${NIVEL_TOPE_ESTILO[resumen.nivel_alerta_tope].bg}`} style={{ width: `${Math.min(100, resumen.porcentaje_usado)}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1"><span>0%</span><span>70%</span><span>85%</span><span>95%</span><span>100%</span></div>
                  <p className={`text-sm font-bold mt-3 ${NIVEL_TOPE_ESTILO[resumen.nivel_alerta_tope].color}`}>{resumen.porcentaje_usado}% utilizado — {NIVEL_TOPE_ESTILO[resumen.nivel_alerta_tope].label}</p>
                  <p className="text-xs text-slate-400 mt-1">Disponible: {fmt(resumen.disponible)}</p>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(NIVEL_TOPE_ESTILO).filter(([k]) => k !== 'ok').map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className={`w-2.5 h-2.5 rounded-full ${v.bg}`} />{v.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════ PESTAÑA: EXPORTAR ═══════════ */}
        {tab === 'exportar' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Cada formato sirve para algo distinto — arma lo que necesites según a quién se lo vas a entregar. Estos documentos son apoyo interno; la presentación oficial ante el INE la hace tu Responsable de Finanzas directo en el portal del SIF.</p>

            <div className="bg-slate-900/60 border border-emerald-800/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-1">📊 Excel — Tablas de datos</h3>
              <p className="text-[11px] text-slate-500 mb-3">Para revisar cifras, filtrar, o pasarle a tu contador para que recapture en el SIF.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => descargarArchivo('/exportar/gastos', 'gastos_ople.xlsx')} className="px-3 py-2 rounded-lg bg-emerald-700/50 text-emerald-300 text-xs font-bold">📥 Gastos + resumen OPLE</button>
                <button onClick={() => descargarArchivo('/exportar/activos-excel', 'inventario_activos.xlsx')} className="px-3 py-2 rounded-lg bg-emerald-700/50 text-emerald-300 text-xs font-bold">📥 Inventario de activos</button>
                <button onClick={() => descargarArchivo('/exportar/respaldo-completo', 'respaldo_completo.xlsx')} className="px-3 py-2 rounded-lg bg-emerald-700/50 text-emerald-300 text-xs font-bold">📥 Respaldo completo</button>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-red-800/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-1">📄 PDF — Paquete de comprobantes</h3>
              <p className="text-[11px] text-slate-500 mb-3">Cada gasto con su foto de comprobante, armado en un solo documento — para tener todo a la mano al recapturar en el SIF.</p>
              <button onClick={() => descargarArchivo('/exportar/comprobantes-pdf', 'paquete_comprobantes.pdf')} className="px-3 py-2 rounded-lg bg-red-700/50 text-red-300 text-xs font-bold">📥 Descargar paquete PDF</button>
            </div>

            <div className="bg-slate-900/60 border border-indigo-800/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-1">📝 Word — Oficio editable</h3>
              <p className="text-[11px] text-slate-500 mb-3">Carta formal de entrega de comprobantes — edítala, agrégale membrete, imprímela y fírmala.</p>
              <button onClick={() => descargarArchivo('/exportar/oficio-word', 'oficio_comprobantes.docx')} className="px-3 py-2 rounded-lg bg-indigo-700/50 text-indigo-300 text-xs font-bold">📥 Descargar oficio Word</button>
            </div>
          </div>
        )}
      </div>

      {mostrarModalActivo && <ModalAgregarActivo onCerrar={() => setMostrarModalActivo(false)} onGuardado={() => { setMostrarModalActivo(false); cargarActivos(); cargarResumenActivos(); }} />}
      {entregasDe && <ModalEntregas activo={entregasDe} onCerrar={() => setEntregasDe(null)} />}
      {responsableDe && <ModalResponsable activo={responsableDe} equipo={equipo} onCerrar={() => setResponsableDe(null)} onGuardado={() => { setResponsableDe(null); cargarActivos(); }} />}
      {bajaDe && <ModalBaja activo={bajaDe} onCerrar={() => setBajaDe(null)} onGuardado={() => { setBajaDe(null); cargarActivos(); cargarResumenActivos(); }} />}
      {kardexDe && <ModalKardex activo={kardexDe} onCerrar={() => setKardexDe(null)} />}
    </div>
  );
}

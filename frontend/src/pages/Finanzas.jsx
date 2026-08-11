import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { descargarArchivo } from '../lib/api';

const CATEGORIAS = ['utilitarios', 'propaganda_impresa', 'espectaculares', 'eventos', 'transporte', 'personal', 'tecnologia', 'publicidad_digital', 'otro'];
const TIPO_COMPROBANTE = { factura: '🧾 Factura', nota: '📝 Nota de venta', recibo: '🧻 Recibo', sin_comprobante: '⚠️ Sin comprobante' };
const TIPO_INGRESO = {
  aportacion_efectivo: '💵 Aportación en efectivo', aportacion_especie: '📦 Aportación en especie',
  autofinanciamiento: '🏦 Autofinanciamiento', financiamiento_publico: '🏛️ Financiamiento público',
  rendimientos_financieros: '📈 Rendimientos financieros',
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

export default function Finanzas() {
  const [tab, setTab] = useState('gastos'); // 'gastos' | 'ingresos'
  const [gastos, setGastos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), tipo_comprobante: 'sin_comprobante', numero_comprobante: '', proveedor: '' });
  const [formIngreso, setFormIngreso] = useState({ tipo_ingreso: 'aportacion_efectivo', aportante_nombre: '', aportante_identificacion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), forma_recepcion: 'transferencia', numero_recibo: '' });
  const [tope, setTope] = useState('');

  // 🆕 Bodega de utilitarios — para elegir "restock de algo que ya
  // existe" en vez de crear un artículo duplicado cada vez que se
  // compra más de lo mismo.
  const [bodega, setBodega] = useState([]);
  const [utilitarioModo, setUtilitarioModo] = useState('nuevo'); // 'nuevo' | 'restock'
  const [utilitarioForm, setUtilitarioForm] = useState({ tipo: '', cantidad: '', activo_id: '' });

  const cargar = () => api.get('/finanzas').then((r) => { setGastos(r.data.data); setIngresos(r.data.ingresos); setResumen(r.data.resumen); });
  const cargarBodega = () => api.get('/activos/bodega').then((r) => setBodega(r.data.data)).catch(() => setBodega([]));
  useEffect(() => { cargar(); cargarBodega(); }, []);

  const guardar = async () => {
    const payload = { ...form, monto: parseFloat(form.monto) };
    // 🆕 Si es un gasto de utilitarios, se manda también qué artículo
    // es y cuántas piezas — esto es lo que conecta el gasto con la
    // bodega real en Activos.
    if (form.categoria === 'utilitarios') {
      payload.utilitario_cantidad = parseInt(utilitarioForm.cantidad);
      if (utilitarioModo === 'restock') payload.utilitario_activo_id = utilitarioForm.activo_id;
      else payload.utilitario_tipo = utilitarioForm.tipo;
    }
    await api.post('/finanzas', payload);
    setForm({ categoria: 'otro', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), tipo_comprobante: 'sin_comprobante', numero_comprobante: '', proveedor: '' });
    setUtilitarioForm({ tipo: '', cantidad: '', activo_id: '' });
    setMostrarForm(false);
    cargar();
    cargarBodega();
  };

  const guardarIngreso = async () => {
    await api.post('/finanzas/ingresos', { ...formIngreso, monto: parseFloat(formIngreso.monto) });
    setFormIngreso({ tipo_ingreso: 'aportacion_efectivo', aportante_nombre: '', aportante_identificacion: '', monto: '', fecha: new Date().toISOString().slice(0, 10), forma_recepcion: 'transferencia', numero_recibo: '' });
    setMostrarForm(false);
    cargar();
  };

  const guardarTope = async () => {
    await api.put('/finanzas/tope', { tope: parseFloat(tope) });
    setTope('');
    cargar();
  };

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);

  const puedeGuardarGasto = form.descripcion && form.monto &&
    (form.categoria !== 'utilitarios' || (utilitarioForm.cantidad && (utilitarioModo === 'restock' ? utilitarioForm.activo_id : utilitarioForm.tipo)));

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">💰 Administración de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <div className="flex gap-2">
            <button onClick={() => descargarArchivo('/exportar/gastos', 'gastos_ople.xlsx')}
              className="px-3 py-2.5 rounded-xl bg-emerald-700/50 text-emerald-300 text-sm font-bold" title="Excel formato OPLE">
              📥 Excel OPLE
            </button>
            <button onClick={() => setMostrarForm(!mostrarForm)} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold">
              {mostrarForm ? 'Cancelar' : tab === 'gastos' ? '+ Gasto' : '+ Ingreso'}
            </button>
          </div>
        </div>

        {/* Balance general: ingresos vs gastos */}
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

        {resumen?.gastos_sin_comprobante > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
            ⚠️ {resumen.gastos_sin_comprobante} gasto(s) sin comprobante todavía — el INE puede observarlos al fiscalizar.
          </div>
        )}

        <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border border-emerald-700/30 rounded-2xl p-4">
          {resumen?.tope_ople ? (
            <>
              <div className="flex justify-between text-xs text-emerald-300 mb-2">
                <span>Gastado: {fmt(resumen.total_gastado)}</span>
                <span>Tope OPLE: {fmt(resumen.tope_ople)}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${resumen.porcentaje_usado > 90 ? 'bg-red-500' : resumen.porcentaje_usado > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, resumen.porcentaje_usado)}%` }} />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">{resumen.porcentaje_usado}% usado · Disponible: {fmt(resumen.disponible)}</div>
            </>
          ) : (
            <div className="flex gap-2">
              <input placeholder="Define tu tope de gasto OPLE" type="number" value={tope} onChange={(e) => setTope(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <button onClick={guardarTope} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Guardar</button>
            </div>
          )}
        </div>

        {/* 🆕 BODEGA DE UTILITARIOS — visible siempre que haya algo
            registrado, para que el candidato vea de un vistazo cuánto
            tiene comprado, entregado, y disponible. */}
        {bodega.length > 0 && (
          <div className="bg-slate-900/60 border border-teal-800/40 rounded-xl p-4">
            <h2 className="text-xs font-bold text-teal-300 uppercase mb-2">🏬 Bodega de Utilitarios</h2>
            <div className="space-y-1.5">
              {bodega.map((b) => (
                <div key={b.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2 text-xs">
                  <span className="font-bold text-white capitalize">{b.subtipo}</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-slate-400">Comprado: <strong className="text-white">{b.comprado}</strong></span>
                    <span className="text-amber-400">Entregado: <strong>{b.entregado}</strong></span>
                    <span className={`font-bold ${b.en_bodega <= 0 ? 'text-red-400' : b.en_bodega < b.comprado * 0.2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      En bodega: {b.en_bodega}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 mt-2">Se actualiza sola cada vez que registras un gasto de utilitarios o entregas piezas desde Activos.</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => setTab('gastos')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${tab === 'gastos' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>💸 Gastos ({gastos.length})</button>
          <button onClick={() => setTab('ingresos')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${tab === 'ingresos' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>💵 Ingresos ({ingresos.length})</button>
        </div>

        {mostrarForm && tab === 'gastos' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>

            {/* 🆕 Campos extra SOLO para utilitarios — esto es lo que
                conecta el gasto con la bodega real: cuántas piezas y
                de qué tipo, en vez de un monto suelto sin contexto. */}
            {form.categoria === 'utilitarios' && (
              <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 space-y-2">
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setUtilitarioModo('nuevo')}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${utilitarioModo === 'nuevo' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>+ Artículo nuevo</button>
                  <button type="button" onClick={() => setUtilitarioModo('restock')} disabled={bodega.length === 0}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-30 ${utilitarioModo === 'restock' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔁 Reabastecer existente</button>
                </div>
                {utilitarioModo === 'nuevo' ? (
                  <input placeholder="¿Qué es? (ej: Playeras talla M, Gorras)" value={utilitarioForm.tipo}
                    onChange={(e) => setUtilitarioForm({ ...utilitarioForm, tipo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                ) : (
                  <select value={utilitarioForm.activo_id} onChange={(e) => setUtilitarioForm({ ...utilitarioForm, activo_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs">
                    <option value="">Selecciona el artículo...</option>
                    {bodega.map((b) => <option key={b.id} value={b.id}>{b.subtipo} (hay {b.en_bodega} en bodega)</option>)}
                  </select>
                )}
                <input placeholder="Cantidad de piezas compradas" type="number" value={utilitarioForm.cantidad}
                  onChange={(e) => setUtilitarioForm({ ...utilitarioForm, cantidad: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              </div>
            )}

            <input placeholder="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Proveedor (opcional)" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="flex gap-2">
              <input type="number" placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
            <div className="flex gap-2">
              <select value={form.tipo_comprobante} onChange={(e) => setForm({ ...form, tipo_comprobante: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                {Object.entries(TIPO_COMPROBANTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {form.tipo_comprobante !== 'sin_comprobante' && (
                <input placeholder="N° folio/factura" value={form.numero_comprobante} onChange={(e) => setForm({ ...form, numero_comprobante: e.target.value })}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              )}
            </div>
            <button onClick={guardar} disabled={!puedeGuardarGasto} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Guardar gasto</button>
          </div>
        )}

        {mostrarForm && tab === 'ingresos' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <select value={formIngreso.tipo_ingreso} onChange={(e) => setFormIngreso({ ...formIngreso, tipo_ingreso: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              {Object.entries(TIPO_INGRESO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {formIngreso.tipo_ingreso.startsWith('aportacion') && (
              <div className="flex gap-2">
                <input placeholder="Nombre del aportante" value={formIngreso.aportante_nombre} onChange={(e) => setFormIngreso({ ...formIngreso, aportante_nombre: e.target.value })}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="CURP/RFC" value={formIngreso.aportante_identificacion} onChange={(e) => setFormIngreso({ ...formIngreso, aportante_identificacion: e.target.value })}
                  className="w-32 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </div>
            )}
            <div className="flex gap-2">
              <input type="number" placeholder="Monto" value={formIngreso.monto} onChange={(e) => setFormIngreso({ ...formIngreso, monto: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <input type="date" value={formIngreso.fecha} onChange={(e) => setFormIngreso({ ...formIngreso, fecha: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
            <div className="flex gap-2">
              <select value={formIngreso.forma_recepcion} onChange={(e) => setFormIngreso({ ...formIngreso, forma_recepcion: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="especie">En especie</option>
              </select>
              <input placeholder="N° recibo de aportación" value={formIngreso.numero_recibo} onChange={(e) => setFormIngreso({ ...formIngreso, numero_recibo: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
            <button onClick={guardarIngreso} disabled={!formIngreso.monto} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Guardar ingreso</button>
          </div>
        )}

        <div className="space-y-2">
          {tab === 'gastos' ? gastos.map((g) => (
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
                <BotonEvidencia url={g.evidencia_url} onSubir={(fd) => api.post(`/finanzas/${g.id}/evidencia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(cargar)} />
              </div>
            </div>
          )) : ingresos.map((i) => (
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
                <BotonEvidencia url={i.evidencia_url} onSubir={(fd) => api.post(`/finanzas/ingresos/${i.id}/evidencia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(cargar)} />
              </div>
            </div>
          ))}
          {tab === 'gastos' && gastos.length === 0 && <div className="text-center text-slate-500 py-10">Sin gastos registrados</div>}
          {tab === 'ingresos' && ingresos.length === 0 && <div className="text-center text-slate-500 py-10">Sin ingresos registrados</div>}
        </div>
      </div>
    </div>
  );
}

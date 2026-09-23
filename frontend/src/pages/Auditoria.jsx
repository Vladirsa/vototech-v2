import { useEffect, useState } from 'react';
import api from '../lib/api';

const ACCION_ICONO = { crear: '➕', editar: '✏️', borrar: '🗑️' };
const ACCION_COLOR = { crear: 'text-emerald-400 bg-emerald-500/10', editar: 'text-amber-400 bg-amber-500/10', borrar: 'text-red-400 bg-red-500/10' };

function formatearDetalle(detalle) {
  if (!detalle) return null;
  if (detalle.cambios) {
    // Formato especial para ediciones de estructura — se ve "campo: valor" en vez de JSON crudo
    return Object.entries(detalle.cambios).map(([campo, valor]) => `${campo}: ${valor}`).join(' · ');
  }
  return Object.entries(detalle).filter(([k]) => k !== 'persona_afectada').map(([k, v]) => `${k}: ${v}`).join(' · ');
}

/**
 * 🆕 Bitácora de Auditoría — quién hizo qué, cuándo, y desde dónde,
 * en toda la campaña. Solo altos mandos deberían tener acceso a
 * esta pantalla (se restringe también en el menú), porque abarca
 * acciones de TODO el equipo, no solo las propias.
 */
export default function Auditoria() {
  const [registros, setRegistros] = useState(null);
  const [filtros, setFiltros] = useState({ tabla: '', accion: '', buscar: '', desde: '', hasta: '' });
  const [opciones, setOpciones] = useState({ tablas: [], acciones: [] });

  const cargar = () => {
    const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    api.get(`/auditoria?${params}`).then((r) => {
      setRegistros(r.data.data);
      setOpciones(r.data.filtros_disponibles);
    });
  };
  useEffect(() => { cargar(); }, [filtros.tabla, filtros.accion, filtros.desde, filtros.hasta]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-black text-white">📋 Bitácora de Auditoría</h1>
        <p className="text-xs text-slate-500 mt-1">Quién hizo qué, cuándo, y desde dónde — en toda la campaña. Se guarda automáticamente en las acciones más sensibles (finanzas, resultados electorales, cambios de estructura).</p>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-2">
        <input placeholder="🔍 Buscar por nombre o detalle..." value={filtros.buscar}
          onChange={(e) => setFiltros({ ...filtros, buscar: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
        <select value={filtros.tabla} onChange={(e) => setFiltros({ ...filtros, tabla: e.target.value })}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
          <option value="">Toda tabla</option>
          {opciones.tablas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtros.accion} onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
          <option value="">Toda acción</option>
          {opciones.acciones.map((a) => <option key={a} value={a}>{ACCION_ICONO[a] || ''} {a}</option>)}
        </select>
        <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
        <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" />
      </div>

      {/* Lista */}
      {registros === null ? (
        <div className="text-center text-slate-500 text-xs py-10">⏳ Cargando...</div>
      ) : registros.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-10">Sin registros con estos filtros.</div>
      ) : (
        <div className="space-y-1.5">
          {registros.map((r) => (
            <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 flex items-start gap-3">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${ACCION_COLOR[r.accion] || 'text-slate-400 bg-slate-800'}`}>
                {ACCION_ICONO[r.accion] || '•'} {r.accion}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white">
                  <span className="font-bold">{r.usuario_nombre || 'Sistema'}</span>
                  <span className="text-slate-500"> · {r.tabla}</span>
                </div>
                {formatearDetalle(r.detalle) && (
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{formatearDetalle(r.detalle)}</div>
                )}
              </div>
              <div className="text-[9px] text-slate-600 whitespace-nowrap text-right">
                {new Date(r.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                <br />{new Date(r.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[9px] text-slate-600 text-center">Se muestran los últimos 300 registros que coinciden con los filtros.</p>

      <AccesosAlSistema />
    </div>
  );
}

const EVENTO_ACCESO = {
  login_ok: { texto: '✅ Entró', color: 'text-emerald-400 bg-emerald-500/10' },
  login_paso1_ok: { texto: '🔑 Contraseña correcta (falta 2º paso)', color: 'text-sky-400 bg-sky-500/10' },
  login_2fa_ok: { texto: '✅ Entró con 2 pasos', color: 'text-emerald-400 bg-emerald-500/10' },
  login_fallido: { texto: '⛔ Contraseña incorrecta', color: 'text-red-400 bg-red-500/10' },
  login_2fa_fallido: { texto: '⛔ Código de 2 pasos incorrecto', color: 'text-red-400 bg-red-500/10' },
  password_cambiada: { texto: '🔁 Cambió su contraseña', color: 'text-amber-400 bg-amber-500/10' },
};

/**
 * 🔒 Entradas al sistema: quién entró, cuándo, desde qué IP y con qué
 * aparato, e intentos fallidos. Muchos "⛔" seguidos de la misma persona
 * o IP = alguien probando contraseñas.
 */
export function AccesosAlSistema() {
  const [accesos, setAccesos] = useState(null);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (abierto && accesos === null) api.get('/auditoria/accesos').then((r) => setAccesos(r.data.data)).catch(() => setAccesos([]));
  }, [abierto]);
  const fallidos = (accesos || []).filter((a) => a.evento?.includes('fallido')).length;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-black text-white">🔐 Entradas al sistema</span>
        <span className="text-xs text-slate-400">{abierto ? '▲ Ocultar' : '▼ Ver'}</span>
      </button>
      {abierto && (
        accesos === null ? <div className="text-center text-slate-500 text-xs py-6">⏳ Cargando...</div>
        : accesos.length === 0 ? <div className="text-center text-slate-500 text-xs py-6">Todavía no hay entradas registradas.</div>
        : (
          <div className="space-y-1.5 mt-3">
            {fallidos > 0 && <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">⚠️ {fallidos} intento(s) fallido(s) en los últimos registros. Si son muchos de la misma persona, pídele que cambie su contraseña.</div>}
            {accesos.map((a, i) => {
              const ev = EVENTO_ACCESO[a.evento] || { texto: a.evento, color: 'text-slate-400 bg-slate-800' };
              return (
                <div key={i} className="flex items-center gap-2 text-xs border-b border-slate-800/60 py-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${ev.color}`}>{ev.texto}</span>
                  <span className="text-white font-bold truncate">{a.nombre || '—'}</span>
                  <span className="text-slate-500 truncate hidden sm:inline">{a.ip}</span>
                  <span className="ml-auto text-[10px] text-slate-500 whitespace-nowrap">{new Date(a.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

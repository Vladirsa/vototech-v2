import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';
// html2canvas se importa DINÁMICAMENTE dentro de exportarImagen() —
// es una librería pesada que solo hace falta si alguien de verdad
// toca "Exportar imagen", no en cada visita a Estructura.
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
  // 🆕 Coordinador Regional — supervisa varios municipios agrupados,
  // para campañas grandes (Gobernador, Dip. Federal).
  coord_regional: 'Coordinador Regional',
  coord_distrital: 'Nivel Regional', coord_municipal: 'Nivel Municipal',
  coord_seccional: 'Nivel Territorial', promotor: 'Promotor',
  // 🆕 Faltaba — se usa en varias partes del archivo pero nunca se
  // había agregado aquí, así que su etiqueta salía en blanco.
  representante_casilla: 'Representante de Casilla',
  encargado_juridico: 'Encargado Jurídico', encargado_finanzas: 'Encargado de Finanzas', voluntario: 'Voluntario',
};

const PUESTOS_POR_ROL = {
  jefe_campana: ['Secretario Particular', 'Coordinador General de Campaña', 'Coordinador Jurídico', 'Coordinador Territorial', 'Coordinador Político', 'Coordinador de Comunicación', 'Coordinador de Finanzas'],
  coord_general: ['Coordinador de Enlace con Partidos', 'Coordinador de Alianzas', 'Coordinador de Vinculación Social', 'Coordinador de Prensa', 'Coordinador de Redes Sociales'],
  coord_distrital: ['Coordinador Distrital', 'Coordinador de Jóvenes', 'Coordinador de Mujeres', 'Coordinador Empresarial', 'Coordinador de Adultos Mayores', 'Coordinador de Colonias', 'Coordinador de Transporte y Logística', 'Coordinador de Eventos'],
  coord_municipal: ['Coordinador Municipal', 'Coordinador de Casillas', 'Coordinador de Representantes'],
  coord_seccional: ['Coordinador Seccional', 'Coordinador de Manzana', 'Enlace Comunitario'],
  promotor: ['Promotor de Campaña', 'Estructura Territorial'],
  encargado_juridico: ['Abogado de Campaña', 'Asistente Jurídico'],
  encargado_finanzas: ['Tesorero de Campaña', 'Auxiliar Contable'],
  // 🆕 Estas 4 opciones no son solo etiquetas — el texto que elijas
  // aquí decide qué módulos ve ese voluntario (lo resuelve el
  // servidor automáticamente, buscando palabras clave): "Marketing"
  // le da acceso al módulo de Marketing, "Eventos" le da Agenda,
  // "Toque de Puertas" y "General" se quedan con lo básico
  // (Dashboard + Promovidos), que ya les alcanza para su trabajo.
  voluntario: ['Voluntario de Marketing y Redes', 'Voluntario de Apoyo en Eventos', 'Voluntario de Toque de Puertas', 'Voluntario General'],
};

function estaActivoReciente(ultimoAcceso) {
  if (!ultimoAcceso) return null;
  const dias = (Date.now() - new Date(ultimoAcceso).getTime()) / 86400000;
  if (dias < 3) return 'reciente';
  if (dias < 14) return 'medio';
  return 'inactivo';
}
const PUNTO_ACTIVIDAD = { reciente: 'bg-emerald-400', medio: 'bg-amber-400', inactivo: 'bg-red-400' };

// ═══════════════════════════════════════════════════════════════
// 🆕 GUÍA DE ESTRUCTURA — "¿Cómo funciona esto?"
// A los clientes se les dificulta entender la lógica del organigrama
// (niveles, "a quién le reporta", territorio). Este modal explica
// todo con un ejemplo concreto de principio a fin, en vez de dejar
// que lo adivinen solos formulario por formulario.
// ═══════════════════════════════════════════════════════════════
function ModalAyudaEstructura({ onCerrar }) {
  const [seccion, setSeccion] = useState('idea');
  const SECCIONES = [
    { id: 'idea', label: '1. La idea básica' },
    { id: 'niveles', label: '2. Los niveles' },
    { id: 'reporta', label: '3. "¿A quién reporta?"' },
    { id: 'territorio', label: '4. El territorio' },
    { id: 'ejemplo', label: '5. Ejemplo completo' },
    { id: 'semaforo', label: '6. El semáforo de salud' },
  ];
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[60]" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-black text-white">🧭 Cómo funciona tu Estructura</h2>
          <button onClick={onCerrar} className="text-slate-500 text-xl leading-none">✕</button>
        </div>

        {/* Navegación por secciones — para no aventarle todo el texto
            de golpe, que es justo lo que hace que se sienta complicado. */}
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-slate-800 flex-shrink-0">
          {SECCIONES.map((s) => (
            <button key={s.id} onClick={() => setSeccion(s.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${seccion === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto text-sm text-slate-300 leading-relaxed space-y-3">
          {seccion === 'idea' && (
            <>
              <p>Piensa en tu Estructura como el <strong className="text-white">árbol genealógico de tu campaña</strong>: cada persona que agregas "le reporta" a alguien de arriba, igual que en cualquier empresa u organización.</p>
              <p>Tú (el <strong className="text-amber-400">Candidato</strong>) estás siempre en la punta del árbol. Todo mundo, directa o indirectamente, cuelga de ti.</p>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center space-y-2 my-2">
                <div className="inline-block px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs">Tú (Candidato)</div>
                <div className="text-slate-600">↓</div>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs">Tu gente de confianza</div>
                <div className="text-slate-600">↓</div>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-xs">Coordinadores de territorio</div>
                <div className="text-slate-600">↓</div>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 font-bold text-xs">Promotores (los que tocan puertas)</div>
              </div>
              <p className="text-xs text-slate-500">Cada quien solo necesita saber 2 cosas de sí mismo: <strong className="text-slate-300">qué nivel tiene</strong>, y <strong className="text-slate-300">a quién le reporta</strong>. El sistema arma el árbol solo con esos dos datos.</p>
            </>
          )}

          {seccion === 'niveles' && (
            <>
              <p>De arriba hacia abajo, así de simple es cada nivel:</p>
              <div className="space-y-2 my-2">
                {[
                  ['👑', 'Nivel Dirección', 'La mano derecha del candidato. Ve y decide prácticamente todo.'],
                  ['🎖️', 'Nivel General', 'Coordina un área completa de la campaña (ej: Jóvenes, Mujeres, Comunicación).'],
                  ['🏛️', 'Nivel Regional', 'Responsable de un Distrito completo (varios municipios o secciones).'],
                  ['🏘️', 'Nivel Municipal', 'Responsable de UN municipio.'],
                  ['📍', 'Nivel Territorial', 'Responsable de UNA sección electoral específica.'],
                  ['🤝', 'Promotor', 'El que toca puertas — captura promovidos, el nivel de acción diaria.'],
                ].map(([ic, nombre, desc]) => (
                  <div key={nombre} className="flex gap-3 items-start bg-slate-800/40 rounded-lg p-2.5">
                    <span className="text-lg flex-shrink-0">{ic}</span>
                    <div>
                      <div className="text-xs font-bold text-white">{nombre}</div>
                      <div className="text-[11px] text-slate-400">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">No necesitas usar los 6 niveles — muchas campañas chicas solo usan 2 o 3 (ej: Candidato → Coordinador Municipal → Promotores). Usa solo los que tengan sentido para el tamaño real de tu campaña.</p>
            </>
          )}

          {seccion === 'reporta' && (
            <>
              <p>Cuando agregas a alguien nuevo, el formulario pregunta <strong className="text-white">"¿A quién le reporta?"</strong> — esa es la pregunta más importante de todas, porque de ahí depende dónde aparece esa persona en el árbol.</p>
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 space-y-1.5">
                <p className="text-xs text-indigo-200">💡 Regla simple: si dejas esa pregunta vacía ("Directo al Candidato"), la persona aparece en el primer nivel del árbol, colgando directo de ti.</p>
                <p className="text-xs text-indigo-200">Si eliges a alguien que ya agregaste antes, la nueva persona aparece <strong>debajo</strong> de esa persona en el árbol — como su subordinado.</p>
              </div>
              <p className="text-xs text-slate-500">Este dato se puede cambiar después en cualquier momento — si alguien cambió de coordinador, entra a su detalle y edítalo, o usa "🔀 Reasignar su equipo" para mover a todo un grupo de personas de un jalón.</p>
            </>
          )}

          {seccion === 'territorio' && (
            <>
              <p>El territorio que le asignas a un coordinador (una sección, un municipio, un distrito) <strong className="text-white">no es solo informativo</strong> — hace 2 cosas reales:</p>
              <div className="space-y-2 my-2">
                <div className="flex gap-2 items-start">
                  <span className="text-base">🎯</span>
                  <p className="text-xs text-slate-300">Calcula automáticamente una <strong className="text-white">meta diaria sugerida</strong>, basada en cuántos electores hay realmente en esa zona (el sistema usa el 8% del padrón como referencia, y los días que faltan para la elección).</p>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base">🗺️</span>
                  <p className="text-xs text-slate-300">Define su <strong className="text-white">zona de influencia en el Mapa</strong> — desde ahí se puede visualizar qué parte del territorio le corresponde cubrir a cada quien.</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">No todos los niveles necesitan territorio — un Encargado de Finanzas o un Coordinador General de Jóvenes, por ejemplo, normalmente no tienen una sección o municipio asignado, porque su trabajo no es geográfico.</p>
            </>
          )}

          {seccion === 'ejemplo' && (
            <>
              <p className="font-bold text-white">Ejemplo real, de principio a fin:</p>
              <div className="space-y-2.5">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs"><strong className="text-emerald-400">Paso 1.</strong> Agregas a <strong className="text-white">María</strong> como <em>Coordinadora Municipal</em>, territorio = Municipio de Apizaco, y dejas "¿A quién reporta?" vacío → aparece colgando directo de ti.</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs"><strong className="text-emerald-400">Paso 2.</strong> Agregas a <strong className="text-white">Juan</strong> como <em>Coordinador Seccional</em>, territorio = Sección 45, y en "¿A quién reporta?" seleccionas a María → Juan aparece colgando debajo de María en el árbol.</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs"><strong className="text-emerald-400">Paso 3.</strong> Juan reparte su código de invitación a sus promotores de campo — cuando ellos se registran con ese código, quedan automáticamente colgando debajo de Juan, sin que nadie tenga que configurar nada a mano.</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs"><strong className="text-emerald-400">Resultado:</strong> al entrar a "🌳 Organigrama" verás la rama completa — Tú → María → Juan → sus promotores — creciendo hacia abajo, con el semáforo de salud de cada quien.</p>
                </div>
              </div>
            </>
          )}

          {seccion === 'semaforo' && (
            <>
              <p>Cada coordinador (no los promotores) trae un semáforo automático según cuánta gente tiene directamente a su cargo:</p>
              <div className="space-y-1.5 my-2">
                {[
                  ['✅', 'Sano', 'text-emerald-400', 'Tiene una cantidad razonable de gente a cargo — ni muy poca ni demasiada.'],
                  ['🔴', 'Sobrecargado', 'text-red-400', 'Tiene demasiada gente reportándole directo — considera dividir su equipo con otro coordinador.'],
                  ['🟡', 'Subutilizado', 'text-amber-400', 'Tiene poca gente para su nivel — podría absorber más equipo.'],
                  ['⚪', 'Sin equipo aún', 'text-slate-400', 'Todavía no tiene a nadie reportándole — normal si acaba de entrar.'],
                ].map(([ic, label, color, desc]) => (
                  <div key={label} className="flex gap-2.5 items-start">
                    <span className="text-base">{ic}</span>
                    <div>
                      <span className={`text-xs font-bold ${color}`}>{label}</span>
                      <p className="text-[11px] text-slate-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Este semáforo se recalcula solo, en tiempo real, cada vez que agregas o mueves a alguien — no hay que actualizarlo a mano.</p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <button onClick={onCerrar} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Entendido</button>
        </div>
      </div>
    </div>
  );
}

function ModalAgregarMiembro({ miembros, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', telefono: '', rol: 'coord_seccional', puesto: '', parent_id: '', territorio_tipo: 'seccion', territorio_id: '', region_id: '', meta_diaria: '' });
  const [sugerencia, setSugerencia] = useState(null);
  // 🆕 Lista de regiones — solo se necesita si eligen el rol
  // Coordinador Regional.
  const [regiones, setRegiones] = useState([]);
  useEffect(() => {
    if (form.rol === 'coord_regional') api.get('/estructura/regiones').then((r) => setRegiones(r.data.data)).catch(() => setRegiones([]));
  }, [form.rol]);
  useEffect(() => {
    if (!form.territorio_id) { setSugerencia(null); return; }
    api.get(`/estructura/sugerir-meta?territorio_tipo=${form.territorio_tipo}&territorio_id=${form.territorio_id}`)
      .then((r) => setSugerencia(r.data.data))
      .catch(() => setSugerencia(null));
  }, [form.territorio_tipo, form.territorio_id]);
  const [error, setError] = useState('');
  const guardar = async () => {
    try {
      await api.post('/estructura', {
        ...form,
        parent_id: form.parent_id || undefined,
        territorio_tipo: form.territorio_id ? form.territorio_tipo : undefined,
        territorio_id: form.territorio_id ? parseInt(form.territorio_id) : undefined,
        region_id: form.region_id || undefined,
        meta_diaria: form.meta_diaria ? parseInt(form.meta_diaria) : undefined,
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
        <input placeholder="Teléfono (para contactarlo por WhatsApp)" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
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
        {/* 🆕 Selector de región — solo para Coordinador Regional */}
        {form.rol === 'coord_regional' && (
          <div>
            <label className="block text-[10px] text-slate-500 font-bold mb-1">Región a su cargo</label>
            <select value={form.region_id} onChange={(e) => setForm({ ...form, region_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="">Elige una región...</option>
              {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre} ({r.municipios_ids.length} municipios)</option>)}
            </select>
            {regiones.length === 0 && (
              <p className="text-[9px] text-amber-400 mt-1">No tienes regiones creadas todavía — ve a la pestaña "🌎 Regiones" para crear una primero.</p>
            )}
          </div>
        )}
        {(form.rol === 'coord_seccional' || form.rol === 'coord_municipal' || form.rol === 'coord_distrital' || form.rol === 'coord_general') && (
          <div className="flex gap-2">
            <select value={form.territorio_tipo} onChange={(e) => setForm({ ...form, territorio_tipo: e.target.value })}
              className="px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
              <option value="seccion">Sección</option>
              <option value="municipio">Municipio</option>
              <option value="distrito_local">Distrito Local</option>
              <option value="distrito_federal">Distrito Federal</option>
            </select>
            <input placeholder="Número (ej: 12)" type="number" value={form.territorio_id}
              onChange={(e) => setForm({ ...form, territorio_id: e.target.value })}
              className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
        )}
        {sugerencia && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2.5 text-[10px] text-indigo-200">
            📊 Su territorio tiene {sugerencia.lista_nominal.toLocaleString()} electores en lista nominal. Con {sugerencia.dias_restantes} días para la elección, la meta sugerida es <strong className="text-white">{sugerencia.meta_diaria_sugerida} promovidos/día</strong> ({sugerencia.meta_total_sugerida.toLocaleString()} en total — 8% del padrón de su zona).
            <button onClick={() => setForm({ ...form, meta_diaria: String(sugerencia.meta_diaria_sugerida) })} className="block mt-1 font-bold text-indigo-300 underline">Usar esta meta</button>
          </div>
        )}
        <input placeholder="Meta diaria de promovidos (puedes ajustarla)" type="number" value={form.meta_diaria}
          onChange={(e) => setForm({ ...form, meta_diaria: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
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
  const [reporteEquipo, setReporteEquipo] = useState(null);
  const [ramaExpandida, setRamaExpandida] = useState(null);
  const [codigoPropio, setCodigoPropio] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [reasignando, setReasignando] = useState(false);
  const [nuevoDestino, setNuevoDestino] = useState('');
  const [editando, setEditando] = useState(false);
  // 🆕 Checklist de documentos — solo aplica a Candidato y
  // Representante de Casilla (los únicos roles con documentación
  // legal específica que hay que llevar control).
  const [checklistDocs, setChecklistDocs] = useState(null);
  useEffect(() => {
    if (['candidato', 'representante_casilla'].includes(miembro.rol)) {
      api.get(`/documentos-persona/${miembro.id}`).then((r) => setChecklistDocs(r.data.data)).catch(() => setChecklistDocs(null));
    }
  }, [miembro.id, miembro.rol]);
  const marcarDocumento = async (tipo, entregado) => {
    await api.patch(`/documentos-persona/${miembro.id}/${tipo}`, { entregado });
    api.get(`/documentos-persona/${miembro.id}`).then((r) => setChecklistDocs(r.data.data));
  };
  const [form, setForm] = useState({ nombre: miembro.nombre, telefono: miembro.telefono || '', rol: miembro.rol, puesto: miembro.puesto || '', parent_id: miembro.parent_id || '', meta_diaria: miembro.meta_diaria || '', territorio_tipo: miembro.territorio_tipo || 'seccion', territorio_id: miembro.territorio_id || '' });
  const hijosDirectos = miembros.filter((m) => m.parent_id === miembro.id);
  useEffect(() => {
    api.get(`/estructura/cadena/${miembro.id}`).then((r) => setCadena(r.data.data));
    api.get(`/estructura/${miembro.id}/zonas`).then((r) => setZonas(r.data.data));
    api.get(`/estructura/${miembro.id}/historial`).then((r) => setHistorial(r.data.data));
    if (miembro.rol !== 'promotor') {
      api.get(`/estructura/${miembro.id}/rendimiento-rama`).then((r) => setRendimientoRama(r.data.data));
      // Reporte jerárquico — solo tiene sentido si esta persona tiene
      // "nietos" (gente que reporta a su gente), como un Coordinador
      // Municipal con Enlaces Seccionales que a su vez tienen Promotores.
      api.get(`/estructura/${miembro.id}/reporte-equipo`).then((r) => setReporteEquipo(r.data.data)).catch(() => setReporteEquipo(null));
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
      nombre: form.nombre, telefono: form.telefono || null, rol: form.rol, puesto: form.puesto || null,
      parent_id: form.parent_id || null,
      meta_diaria: form.meta_diaria ? parseInt(form.meta_diaria) : undefined,
      territorio_tipo: form.territorio_id ? form.territorio_tipo : undefined,
      territorio_id: form.territorio_id ? parseInt(form.territorio_id) : undefined,
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
            {/* 🆕 Checklist de documentos — solo Candidato y
                Representante de Casilla lo tienen, según lo que
                exige el INE (credencial/registro) y la LGIPE
                (nombramiento de representantes). */}
            {checklistDocs && (
              <div className={`rounded-xl border p-3 space-y-2 ${checklistDocs.completo ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-300 uppercase">📋 Documentación</span>
                  <span className={`text-[10px] font-bold ${checklistDocs.completo ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {checklistDocs.completo ? '✅ Completa' : `⚠️ Faltan ${checklistDocs.faltantes}`}
                  </span>
                </div>
                {checklistDocs.checklist.map((doc) => (
                  <label key={doc.tipo} className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={doc.entregado} onChange={(e) => marcarDocumento(doc.tipo, e.target.checked)}
                      className="mt-0.5" />
                    <span className={doc.entregado ? 'line-through text-slate-500' : ''}>{doc.label}</span>
                  </label>
                ))}
              </div>
            )}
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
            {/* 📊 REPORTE JERÁRQUICO — solo aparece si esta persona
                tiene "nietos" (gente que reporta a su gente), como un
                Coordinador Municipal con Enlaces Seccionales que a su
                vez tienen Promotores debajo. */}
            {reporteEquipo && reporteEquipo.ramas.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">📊 Reporte de equipo por nivel</div>
                <div className="space-y-1.5">
                  {reporteEquipo.ramas.map((rama) => (
                    <div key={rama.id} className="bg-slate-800/40 rounded-lg overflow-hidden">
                      <button onClick={() => setRamaExpandida(ramaExpandida === rama.id ? null : rama.id)}
                        className="w-full flex items-center justify-between px-2.5 py-2 text-left">
                        <div>
                          <div className="text-xs font-bold text-white">{rama.nombre}</div>
                          <div className="text-[9px] text-slate-500">{rama.puesto || ROL_LABEL[rama.rol]} · {rama.total_personas_directas} a su cargo</div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="text-xs font-black text-emerald-400">{rama.total_promovidos}</div>
                            {rama.total_duplicados > 0 && <div className="text-[9px] text-red-400">⚠️ {rama.total_duplicados} duplicados</div>}
                          </div>
                          <span className="text-slate-500 text-[10px]">{ramaExpandida === rama.id ? '▼' : '▶'}</span>
                        </div>
                      </button>
                      {ramaExpandida === rama.id && (
                        <div className="border-t border-slate-700 px-2.5 py-2 space-y-1">
                          {rama.personas.length === 0 ? (
                            <p className="text-[9px] text-slate-500">Sin gente asignada todavía</p>
                          ) : rama.personas.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-300">{p.nombre}</span>
                              <span className={p.duplicados > 0 ? 'text-red-400' : 'text-slate-400'}>
                                {p.total_promovidos} promovidos{p.duplicados > 0 && ` · ${p.duplicados} dup.`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
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
            <div className="flex gap-2">
              <select value={form.territorio_tipo} onChange={(e) => setForm({ ...form, territorio_tipo: e.target.value })}
                className="px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                <option value="seccion">Sección</option>
                <option value="municipio">Municipio</option>
                <option value="distrito_local">Distrito Local</option>
                <option value="distrito_federal">Distrito Federal</option>
              </select>
              <input placeholder="Número" type="number" value={form.territorio_id}
                onChange={(e) => setForm({ ...form, territorio_id: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            </div>
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

function PanelCodigosMasivos() {
  const [codigos, setCodigos] = useState([]);
  const [rol, setRol] = useState('promotor');
  const [usos, setUsos] = useState(10);
  const [copiado, setCopiado] = useState(null);
  const cargar = () => api.get('/codigos').then((r) => setCodigos(r.data.data));
  useEffect(() => { cargar(); }, []);
  const generar = async () => {
    await api.post('/codigos', { rol_asignado: rol, usos_maximos: usos });
    cargar();
  };
  const copiar = (codigo) => {
    navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 1500);
  };
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">Para cuando reparte UN código a varias personas de un jalón (ej. en un mitin) — distinto al código personal de cada quien, que sí queda ligado a su cadena de invitación.</p>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-2">
        <select value={rol} onChange={(e) => setRol(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
          <option value="promotor">🤝 Promotor</option>
          <option value="coord_seccional">📍 Coord. Seccional</option>
          <option value="voluntario">🙋 Voluntario</option>
          <option value="encargado_juridico">⚖️ Encargado Jurídico</option>
          <option value="encargado_finanzas">💰 Encargado de Finanzas</option>
          <option value="coord_municipal">🏘️ Coord. Municipal</option>
        </select>
        <input type="number" min={1} value={usos} onChange={(e) => setUsos(+e.target.value)}
          className="w-24 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" title="Usos máximos" />
        <button onClick={generar} className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Generar</button>
      </div>
      <div className="space-y-2">
        {codigos.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-6">Sin códigos masivos generados todavía</div>
        ) : codigos.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-base font-black text-indigo-400">{c.codigo}</div>
              <div className="text-[10px] text-slate-500">{c.rol_asignado} · usado {c.usos_actuales}/{c.usos_maximos} · {c.activo ? '✅ activo' : '❌ inactivo'}</div>
            </div>
            <button onClick={() => copiar(c.codigo)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">
              {copiado === c.codigo ? '✅ Copiado' : '📋 Copiar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🔐 PANEL DE PERMISOS POR ROL — NUEVO
// Llama a /estructura/permisos (GET/PUT/DELETE) — esos endpoints
// deben existir en el backend para que esto funcione de verdad.
// ═══════════════════════════════════════════════════════════════
const TODOS_LOS_MODULOS = [
  { clave: 'promovidos', label: 'Promovidos' }, { clave: 'priorizacion', label: 'Priorización' },
  { clave: 'estructura', label: 'Estructura' }, { clave: 'reportes', label: 'Reportes' },
  { clave: 'agenda', label: 'Agenda' }, { clave: 'dia-eleccion', label: 'Día de la Elección' },
  { clave: 'incidencias', label: 'Incidencias' }, { clave: 'finanzas', label: 'Finanzas' },
  { clave: 'activos', label: 'Activos' }, { clave: 'marketing', label: 'Marketing' },
  { clave: 'juridico', label: 'Jurídico' },
];
const ROLES_PARA_PERMISOS = Object.keys(ROL_LABEL).filter((r) => r !== 'candidato');

function PanelPermisosPorRol() {
  const [excepciones, setExcepciones] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = () => {
    api.get('/estructura/permisos')
      .then((r) => { setExcepciones(r.data.data || {}); setCargando(false); })
      .catch((err) => { setError(err.response?.data?.error || 'No se pudieron cargar los permisos'); setCargando(false); });
  };
  useEffect(cargar, []);

  const alternarPermiso = async (rol, modulo) => {
    const actual = excepciones[rol]?.[modulo];
    const nuevoValor = actual === undefined ? false : !actual;
    try {
      await api.put('/estructura/permisos', { rol, modulo, permitido: nuevoValor });
      setExcepciones((prev) => ({ ...prev, [rol]: { ...prev[rol], [modulo]: nuevoValor } }));
    } catch (err) {
      alert('No se pudo guardar: ' + (err.response?.data?.error || err.message));
    }
  };

  const restaurarDefault = async (rol, modulo) => {
    try {
      await api.delete('/estructura/permisos', { data: { rol, modulo } });
      setExcepciones((prev) => {
        const copia = { ...prev, [rol]: { ...prev[rol] } };
        delete copia[rol][modulo];
        return copia;
      });
    } catch (err) {
      alert('No se pudo restaurar: ' + (err.response?.data?.error || err.message));
    }
  };

  if (cargando) return <div className="text-center text-slate-500 text-sm py-10">⏳ Cargando permisos...</div>;
  if (error) return <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-4">{error}</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Prende o apaga módulos por rol — el punto morado marca que ya lo personalizaste distinto al default. El Candidato nunca se puede restringir, por seguridad.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-slate-500 sticky left-0 bg-slate-950">Rol</th>
              {TODOS_LOS_MODULOS.map((m) => (
                <th key={m.clave} className="px-2 py-2 text-slate-500 font-bold text-center whitespace-nowrap">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES_PARA_PERMISOS.map((rol) => (
              <tr key={rol} className="border-t border-slate-800">
                <td className="px-2 py-2 text-white font-bold sticky left-0 bg-slate-950 whitespace-nowrap">{ROL_LABEL[rol]}</td>
                {TODOS_LOS_MODULOS.map((m) => {
                  const personalizado = excepciones[rol]?.[m.clave];
                  const activo = personalizado !== undefined ? personalizado : true;
                  return (
                    <td key={m.clave} className="px-2 py-2 text-center">
                      <button onClick={() => alternarPermiso(rol, m.clave)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${activo ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${activo ? 'left-3.5' : 'left-0.5'}`} />
                      </button>
                      {personalizado !== undefined && (
                        <button onClick={() => restaurarDefault(rol, m.clave)} className="block mx-auto mt-1 text-[9px] text-purple-400" title="Restaurar default">
                          ● reset
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🔁 PANEL DE DUPLICADOS — NUEVO
// Mismo nombre + misma sección, capturado por 2 o más personas
// distintas — para detectar de un vistazo cuando varios promotores
// están trabajando la misma calle sin saberlo.
// ═══════════════════════════════════════════════════════════════
function PanelDuplicados() {
  const [duplicados, setDuplicados] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/estructura/duplicados')
      .then((r) => setDuplicados(r.data.data))
      .catch((err) => setError(err.response?.data?.error || 'No se pudieron cargar los duplicados'));
  }, []);

  if (error) return <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-4">{error}</div>;
  if (!duplicados) return <div className="text-center text-slate-500 text-sm py-10">⏳ Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Mismo nombre + misma sección, capturado por más de una persona — útil para saber si dos promotores están trabajando la misma calle sin darse cuenta.
      </p>
      {duplicados.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-10">✅ Sin duplicados detectados por ahora</div>
      ) : (
        <div className="space-y-1.5">
          {duplicados.map((d, i) => (
            <div key={i} className="bg-slate-900/60 border border-orange-800/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{d.nombre}</div>
                  <div className="text-[10px] text-slate-500">Sección {d.seccion_numero}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-orange-400">{d.personas_distintas} {d.personas_distintas == 1 ? 'persona' : 'personas'}</div>
                  <div className="text-[9px] text-slate-500">{d.veces_registrado} intentos en total</div>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(d.registrado_por_nombres || []).filter(Boolean).map((n, j) => (
                  <span key={j} className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 🆕 Panel de Representantes de Casilla — vive en Estructura porque es
 * información sensible del equipo (quién está asignado dónde), no en
 * Día D donde cualquiera con acceso a captura podía verla.
 *
 * Combina 3 cosas en un solo lugar:
 * 1. Cuántas casillas le tocan a cada sección (regla INE: 750 electores)
 * 2. Asignar representante Y suplente — con alta rápida si la persona
 *    no existe todavía en tu Estructura (se crea con su cargo solo)
 * 3. Generar el nombramiento oficial con los datos que pide la LGIPE
 *    (Art. 259 y 397): partido, nombre, propietario/suplente, distrito,
 *    sección, casilla, domicilio, clave de elector.
 */
function PanelCasillas() {
  const [datos, setDatos] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [generando, setGenerando] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [casillasReales, setCasillasReales] = useState([]);
  const [seccionExpandida, setSeccionExpandida] = useState(null);
  const [altaRapidaPara, setAltaRapidaPara] = useState(null); // {seccion, numeroCasilla, tipo: 'representante'|'suplente'}
  const [formAlta, setFormAlta] = useState({ nombre: '', email: '', password: '', telefono: '', clave_elector: '', domicilio: '' });
  const [guardandoAlta, setGuardandoAlta] = useState(false);

  const cargar = () => {
    api.get('/dia-eleccion/casillas-sugeridas').then((r) => { setDatos(r.data.data); setResumen(r.data.resumen); });
    api.get('/dia-eleccion/casillas').then((r) => setCasillasReales(r.data.data));
  };
  useEffect(() => {
    cargar();
    api.get('/estructura').then((r) => setEquipo(r.data.data)).catch(() => setEquipo([]));
  }, []);

  const generarCasillas = async (seccion) => {
    setGenerando(seccion);
    try {
      await api.post(`/dia-eleccion/casillas-sugeridas/${seccion}/generar`);
      cargar();
      setSeccionExpandida(seccion);
    } catch (e) { alert(e.response?.data?.error || 'No se pudo generar'); }
    setGenerando(null);
  };

  const asignarRepresentante = async (seccion, numeroCasilla, representanteId) => {
    if (representanteId === '__nuevo__') { setAltaRapidaPara({ seccion, numeroCasilla, tipo: 'representante' }); return; }
    await api.post('/dia-eleccion/casillas', { seccion_numero: seccion, numero: numeroCasilla, representante_id: representanteId || null });
    cargar();
  };
  const asignarSuplente = async (seccion, numeroCasilla, suplenteId) => {
    if (suplenteId === '__nuevo__') { setAltaRapidaPara({ seccion, numeroCasilla, tipo: 'suplente' }); return; }
    await api.post('/dia-eleccion/casillas', { seccion_numero: seccion, numero: numeroCasilla, suplente_id: suplenteId || null });
    cargar();
  };

  // 🆕 Alta rápida — crea a la persona en Estructura (con su cargo
  // automático, tal como pediste) Y de una vez la asigna a la casilla,
  // sin tener que ir a otra pantalla y volver.
  const guardarAltaRapida = async () => {
    if (!formAlta.nombre || !formAlta.email || !formAlta.password) {
      alert('Nombre, correo y contraseña son obligatorios para dar de alta a la persona.');
      return;
    }
    setGuardandoAlta(true);
    try {
      const cargo = `Representante de Casilla — Sección ${altaRapidaPara.seccion}, Casilla ${altaRapidaPara.numeroCasilla}`;
      const { data } = await api.post('/estructura', {
        nombre: formAlta.nombre, email: formAlta.email, password: formAlta.password,
        telefono: formAlta.telefono || undefined, rol: 'representante_casilla', puesto: cargo,
      });
      const nuevoUsuarioId = data.data.id;

      const campo = altaRapidaPara.tipo === 'representante' ? 'representante_id' : 'suplente_id';
      await api.post('/dia-eleccion/casillas', {
        seccion_numero: altaRapidaPara.seccion, numero: altaRapidaPara.numeroCasilla,
        [campo]: nuevoUsuarioId,
      });
      // Datos que pide la LGIPE para el nombramiento — se guardan en
      // la propia casilla, junto con quién es el representante.
      if (formAlta.clave_elector || formAlta.domicilio) {
        await api.patch(`/dia-eleccion/casillas/${casillasReales.find((c) => c.seccion_numero === altaRapidaPara.seccion && c.numero === altaRapidaPara.numeroCasilla)?.id}/datos-nombramiento`, {
          representante_clave_elector: formAlta.clave_elector || undefined,
          representante_domicilio: formAlta.domicilio || undefined,
        }).catch(() => {});
      }

      setAltaRapidaPara(null);
      setFormAlta({ nombre: '', email: '', password: '', telefono: '', clave_elector: '', domicilio: '' });
      cargar();
      api.get('/estructura').then((r) => setEquipo(r.data.data));
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo dar de alta');
    }
    setGuardandoAlta(false);
  };

  const descargarNombramiento = (seccion, casilla) => {
    window.open(`${api.defaults.baseURL}/dia-eleccion/casillas/${casilla.id}/nombramiento-pdf`, '_blank');
  };

  if (!datos) return <div className="text-center text-slate-500 text-xs py-6">⏳ Calculando casillas por sección...</div>;

  return (
    <div className="space-y-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-white">🗳️ Representante de Casilla</h2>
          <p className="text-[9px] text-slate-500 mt-0.5">1 casilla por cada 750 electores o fracción (Art. 253, 258 y 284 LGIPE). Cada representante necesita nombre, carácter de propietario/suplente, sección, casilla, domicilio y clave de elector (Art. 259 y Lineamientos de Registro de Representantes) — esos 2 últimos se piden aquí para poder generar su nombramiento.</p>
        </div>
        {resumen && (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center bg-slate-800/50 rounded-lg p-2">
              <div className="text-lg font-black text-white">{resumen.total_casillas_sugeridas}</div>
              <div className="text-[9px] text-slate-500">Casillas que te tocan</div>
            </div>
            <div className="text-center bg-emerald-500/10 rounded-lg p-2">
              <div className="text-lg font-black text-emerald-400">{resumen.total_casillas_registradas}</div>
              <div className="text-[9px] text-slate-500">Ya registradas</div>
            </div>
            <div className={`text-center rounded-lg p-2 ${resumen.total_faltantes > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              <div className={`text-lg font-black ${resumen.total_faltantes > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{resumen.total_faltantes}</div>
              <div className="text-[9px] text-slate-500">Faltan por dar de alta</div>
            </div>
          </div>
        )}
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {datos.map((s) => {
            const casillasDeEstaSeccion = casillasReales.filter((c) => c.seccion_numero === s.seccion);
            return (
              <div key={s.seccion} className="bg-slate-800/40 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={() => setSeccionExpandida(seccionExpandida === s.seccion ? null : s.seccion)} className="flex-1 text-left">
                    <div className="text-xs font-bold text-white">Sección {String(s.seccion).padStart(3, '0')} <span className="text-slate-500 font-normal">· {s.municipio}</span></div>
                    <div className="text-[9px] text-slate-500">{s.lista_nominal.toLocaleString()} electores · {s.casillas_sugeridas} casilla(s) necesaria(s)</div>
                  </button>
                  {s.faltantes > 0 ? (
                    <button onClick={() => generarCasillas(s.seccion)} disabled={generando === s.seccion}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-50 flex-shrink-0">
                      {generando === s.seccion ? '⏳' : `+ Generar ${s.faltantes}`}
                    </button>
                  ) : (
                    <span className="text-[9px] text-emerald-400 font-bold flex-shrink-0">✅ Completo</span>
                  )}
                </div>
                {/* 🆕 Aviso de riesgo de llenado — basado en datos reales
                    del estudio del ITE Tlaxcala 2024 sobre esta misma
                    zona (distrito local), no una suposición genérica. */}
                {casillasDeEstaSeccion[0]?.riesgo_llenado_nivel && (casillasDeEstaSeccion[0].riesgo_llenado_nivel === 'alto' || casillasDeEstaSeccion[0].riesgo_llenado_nivel === 'muy_alto') && (
                  <div className={`mx-3 mb-2 px-2.5 py-1.5 rounded-lg text-[9px] ${casillasDeEstaSeccion[0].riesgo_llenado_nivel === 'muy_alto' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
                    {casillasDeEstaSeccion[0].riesgo_llenado_nivel === 'muy_alto' ? '🔴' : '🟠'} Este distrito tuvo solo {casillasDeEstaSeccion[0].riesgo_llenado_pct}% de actas bien llenadas en 2024 (estudio ITE) — refuerza la capacitación aquí.
                  </div>
                )}
                {seccionExpandida === s.seccion && casillasDeEstaSeccion.length > 0 && (
                  <div className="px-3 pb-2 space-y-2 border-t border-slate-700/50 pt-2">
                    {casillasDeEstaSeccion.map((c) => (
                      <div key={c.id} className="bg-slate-900/40 rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-300 font-bold">Casilla {c.numero}</span>
                          <div className="flex items-center gap-2">
                            {c.personas_esperadas && <span className="text-[9px] text-slate-500">👥 ~{c.personas_esperadas.toLocaleString()}</span>}
                            {c.representante_id && (
                              <button onClick={() => descargarNombramiento(s.seccion, c)} className="text-[9px] text-indigo-400 font-bold">📄 Nombramiento</button>
                            )}
                          </div>
                        </div>
                        <select value={c.representante_id || ''} onChange={(e) => asignarRepresentante(s.seccion, c.numero, e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[10px]">
                          <option value="">👤 Sin representante asignado</option>
                          <option value="__nuevo__">➕ Dar de alta a alguien nuevo...</option>
                          {equipo.map((u) => <option key={u.id} value={u.id}>👤 {u.nombre}</option>)}
                        </select>
                        <select value={c.suplente_id || ''} onChange={(e) => asignarSuplente(s.seccion, c.numero, e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[10px]">
                          <option value="">🔁 Sin suplente asignado</option>
                          <option value="__nuevo__">➕ Dar de alta a alguien nuevo...</option>
                          {equipo.map((u) => <option key={u.id} value={u.id}>🔁 {u.nombre}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 🆕 Modal de alta rápida */}
      {altaRapidaPara && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-white">
              ➕ Nuevo {altaRapidaPara.tipo === 'representante' ? 'Representante' : 'Suplente'} — Sección {altaRapidaPara.seccion}, Casilla {altaRapidaPara.numeroCasilla}
            </h2>
            <p className="text-[10px] text-slate-500">Se da de alta en tu Estructura (con el cargo ya puesto) y queda asignado a esta casilla en un solo paso.</p>
            <input placeholder="Nombre completo" value={formAlta.nombre} onChange={(e) => setFormAlta({ ...formAlta, nombre: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Correo (para su acceso al sistema)" value={formAlta.email} onChange={(e) => setFormAlta({ ...formAlta, email: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Contraseña temporal (mín. 8 caracteres)" value={formAlta.password} onChange={(e) => setFormAlta({ ...formAlta, password: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <input placeholder="Teléfono" value={formAlta.telefono} onChange={(e) => setFormAlta({ ...formAlta, telefono: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">📋 Para el nombramiento oficial (LGIPE)</div>
              <input placeholder="Clave de elector (de su credencial INE)" value={formAlta.clave_elector} onChange={(e) => setFormAlta({ ...formAlta, clave_elector: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              <input placeholder="Domicilio" value={formAlta.domicilio} onChange={(e) => setFormAlta({ ...formAlta, domicilio: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAltaRapidaPara(null)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
              <button onClick={guardarAltaRapida} disabled={guardandoAlta} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                {guardandoAlta ? '⏳ Guardando...' : 'Dar de alta y asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 🆕 Panel de Regiones — para campañas grandes (Gobernador, Dip.
 * Federal) que necesitan agrupar los 60 municipios en bloques
 * manejables, cada uno con su propio Coordinador Regional al mando,
 * en vez de que 60 coordinadores municipales reporten todos directo
 * al Jefe de Campaña.
 */
function PanelRegiones() {
  const [regiones, setRegiones] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [creando, setCreando] = useState(false);
  const [formNueva, setFormNueva] = useState({ nombre: '', municipios_ids: [] });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => api.get('/estructura/regiones').then((r) => setRegiones(r.data.data));
  useEffect(() => {
    cargar();
    api.get('/geo/municipios/29').then((r) => setMunicipios(r.data.data.sort((a, b) => a.nombre.localeCompare(b.nombre))));
  }, []);

  // Municipios que ya están en OTRA región — para no dejar que se repitan por accidente
  const municipiosYaAsignados = new Set(regiones.flatMap((r) => r.municipios_ids));

  const alternarMunicipio = (claveIne) => {
    setFormNueva((f) => ({
      ...f,
      municipios_ids: f.municipios_ids.includes(claveIne)
        ? f.municipios_ids.filter((id) => id !== claveIne)
        : [...f.municipios_ids, claveIne],
    }));
  };

  const guardarRegion = async () => {
    if (!formNueva.nombre || formNueva.municipios_ids.length === 0) return;
    setGuardando(true);
    try {
      await api.post('/estructura/regiones', formNueva);
      setFormNueva({ nombre: '', municipios_ids: [] });
      setCreando(false);
      cargar();
    } catch (e) { alert(e.response?.data?.error || 'No se pudo crear'); }
    setGuardando(false);
  };

  const borrarRegion = async (id) => {
    if (!confirm('¿Borrar esta región?')) return;
    try {
      await api.delete(`/estructura/regiones/${id}`);
      cargar();
    } catch (e) { alert(e.response?.data?.error || 'No se pudo borrar'); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-bold text-white">🌎 Regiones de campaña</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Agrupa municipios en bloques manejables — útil para campañas grandes (Gobernador, Diputación Federal) donde 60 coordinadores municipales reportando directo al Jefe de Campaña es demasiado. Cada región puede tener su propio Coordinador Regional al mando.</p>
      </div>

      {regiones.map((r) => (
        <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">{r.nombre}</div>
              <div className="text-[10px] text-slate-500">
                {r.municipios_ids.length} municipios
                {r.coordinador_nombre ? ` · 👤 ${r.coordinador_nombre}` : ' · ⚠️ Sin coordinador asignado'}
                {r.total_equipo > 0 && ` · ${r.total_equipo} en el equipo`}
              </div>
            </div>
            <button onClick={() => borrarRegion(r.id)} className="text-red-500 text-xs">🗑️</button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {r.municipios_ids.map((claveIne) => {
              const m = municipios.find((mu) => mu.clave_ine === claveIne);
              return <span key={claveIne} className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{m?.nombre || claveIne}</span>;
            })}
          </div>
        </div>
      ))}

      {!creando ? (
        <button onClick={() => setCreando(true)} className="w-full py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-bold">+ Nueva región</button>
      ) : (
        <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-4 space-y-2">
          <input placeholder="Nombre de la región (ej: Zona Norte)" value={formNueva.nombre} onChange={(e) => setFormNueva({ ...formNueva, nombre: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          <div className="text-[10px] text-slate-500 font-bold uppercase mt-2">Elige los municipios de esta región</div>
          <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto">
            {municipios.map((m) => {
              const yaEnOtra = municipiosYaAsignados.has(m.clave_ine);
              return (
                <label key={m.clave_ine} className={`flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg ${yaEnOtra ? 'opacity-40' : 'cursor-pointer hover:bg-slate-800'}`}>
                  <input type="checkbox" disabled={yaEnOtra} checked={formNueva.municipios_ids.includes(m.clave_ine)} onChange={() => alternarMunicipio(m.clave_ine)} />
                  <span className="text-slate-300">{m.nombre}{yaEnOtra && ' (ya asignado)'}</span>
                </label>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setCreando(false); setFormNueva({ nombre: '', municipios_ids: [] }); }} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
            <button onClick={guardarRegion} disabled={guardando || !formNueva.nombre || formNueva.municipios_ids.length === 0}
              className="flex-1 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold disabled:opacity-40">
              {guardando ? '⏳...' : `Crear con ${formNueva.municipios_ids.length} municipio(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Estructura() {
  const [miembros, setMiembros] = useState([]);
  const [salud, setSalud] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const [miembroDetalle, setMiembroDetalle] = useState(null);
  const [vista, setVista] = useState('organigrama');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [vacantes, setVacantes] = useState([]);
  const [alertasRama, setAlertasRama] = useState([]);
  const [ranking, setRanking] = useState([]);
  const { usuario } = useAuth();
  // 🆕 Estos 2 paneles muestran quién está asignado en CADA casilla —
  // información sensible de estructura. Solo Candidato, Jefe de
  // Campaña y Coord. General deben verla.
  const esAltoMando = ['candidato', 'jefe_campana', 'coord_general'].includes(usuario?.rol);
  const [gamificacion, setGamificacion] = useState([]);
  const [cobertura, setCobertura] = useState(null);
  const [seccionExpandida, setSeccionExpandida] = useState(null);
  const [soloIncompletas, setSoloIncompletas] = useState(true);
  const [nuevaCasilla, setNuevaCasilla] = useState({ tipo: 'especial', electores_estimados: '' });
  const [expandido, setExpandido] = useState(null);
  const [exportando, setExportando] = useState(false);
  const refOrganigrama = useRef(null);
  const cargar = () => {
    setErrorCarga('');
    Promise.all([api.get('/estructura'), api.get('/estructura/salud')])
      .then(([m, s]) => {
        setMiembros(m.data.data); setSalud(s.data.data); setCargando(false);
      })
      .catch((err) => {
        console.error('Error cargando estructura:', err);
        setErrorCarga(err.response?.data?.error || err.message || 'Error desconocido al cargar la estructura');
        setCargando(false);
      });
    api.get('/estructura/vacantes/catalogo').then((r) => setVacantes(r.data.data)).catch(() => setVacantes([]));
    api.get('/estructura/alertas/rama-dormida').then((r) => setAlertasRama(r.data.data)).catch(() => setAlertasRama([]));
    api.get('/estructura/ranking/coordinadores').then((r) => setRanking(r.data.data)).catch(() => setRanking([]));
    api.get('/estructura/representantes-ine').then((r) => setRepresentantesIne(r.data.data)).catch(() => setRepresentantesIne([]));
    api.get('/estructura/gamificacion').then((r) => setGamificacion(r.data.data)).catch(() => setGamificacion([]));
    api.get('/estructura/cobertura-casillas').then((r) => setCobertura(r.data.data)).catch(() => setCobertura(null));
  };
  useEffect(cargar, []);
  const agregarCasillaOficial = async (seccionNumero) => {
    if (!nuevaCasilla.tipo) return;
    await api.post('/estructura/casillas-oficiales', {
      seccion_numero: seccionNumero, tipo: nuevaCasilla.tipo,
      electores_estimados: nuevaCasilla.electores_estimados ? parseInt(nuevaCasilla.electores_estimados) : undefined,
    });
    setNuevaCasilla({ tipo: 'especial', electores_estimados: '' });
    cargar();
  };
  const quitarCasillaOficial = async (id) => {
    if (!confirm('¿Quitar esta casilla de la base oficial?')) return;
    await api.delete(`/estructura/casillas-oficiales/${id}`);
    cargar();
  };
  const exportarImagen = async () => {
    if (!refOrganigrama.current) return;
    setExportando(true);
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(refOrganigrama.current, { backgroundColor: '#020617', scale: 2 });
    const enlace = document.createElement('a');
    enlace.download = `organigrama-${new Date().toISOString().slice(0, 10)}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
    setExportando(false);
  };
  const nombreCoincide = (m) => !busqueda || m.nombre.toLowerCase().includes(busqueda.toLowerCase()) || m.puesto?.toLowerCase().includes(busqueda.toLowerCase());
  if (cargando) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando...</div>;
  if (errorCarga) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-sm text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm text-red-300 font-bold">No se pudo cargar la estructura</p>
          <p className="text-xs text-slate-400">{errorCarga}</p>
          <button onClick={cargar} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">Reintentar</button>
        </div>
      </div>
    );
  }
  const raiz = miembros.filter((m) => !m.parent_id);
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">🗂️ Organigrama de Campaña</h1>
            <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
          </div>
          <div className="flex gap-2">
            {/* 🆕 Botón de ayuda — visible siempre, para que quien se
                sienta perdido con la lógica de niveles/reportes/
                territorio tenga una explicación clara a un toque de
                distancia, sin tener que preguntarte a ti directamente. */}
            <button onClick={() => setMostrarAyuda(true)} className="px-3 py-2.5 rounded-xl bg-slate-800 text-indigo-300 text-sm font-bold" title="¿Cómo funciona esto?">
              ❓ Ayuda
            </button>
            <button onClick={() => setMostrarModal(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">+ Agregar</button>
          </div>
        </div>

        {/* 🆕 Aviso breve, siempre visible arriba del organigrama —
            para quien ni siquiera sepa que existe el botón de ayuda,
            la idea más importante (jerarquía + "a quién reporta")
            queda dicha de entrada, en una sola línea. */}
        {raiz.length === 0 && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-200 flex items-start gap-2">
            <span className="text-base flex-shrink-0">💡</span>
            <span>Cada persona que agregues necesita un <strong>nivel</strong> y decir <strong>a quién le reporta</strong> — así se arma el árbol solo. Si no le entiendes a la lógica, toca "❓ Ayuda" arriba — tiene un ejemplo paso a paso.</span>
          </div>
        )}

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
        {alertasRama.length > 0 && (
          <div className="space-y-1.5">
            {alertasRama.map((a) => (
              <div key={a.id} className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-purple-300">
                🌙 Toda la rama de <strong>{a.nombre}</strong> ({a.puesto}, {a.personas_en_rama} personas) lleva 14+ días sin actividad
              </div>
            ))}
          </div>
        )}
        {vacantes.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <div className="text-[10px] font-bold text-amber-300 uppercase mb-1.5">🈳 Puestos aún vacantes</div>
            <div className="flex flex-wrap gap-1.5">
              {vacantes.map((v) => <span key={v} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full">{v}</span>)}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setVista('organigrama')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'organigrama' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🌳 Organigrama</button>
            <button onClick={() => setVista('lista')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>📋 Lista</button>
            <button onClick={() => setVista('ranking')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'ranking' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🏆 Ranking</button>
            <button onClick={() => setVista('codigos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'codigos' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎟️ Códigos masivos</button>
            {esAltoMando && (
              <>
                <button onClick={() => setVista('representantes-ine')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'representantes-ine' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗳️ Representante de Casilla</button>
              </>
            )}
            <button onClick={() => setVista('gamificacion')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'gamificacion' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🏆 Ranking del Equipo</button>
            {esAltoMando && (
              <button onClick={() => setVista('cobertura-casillas')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'cobertura-casillas' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🗳️ Cobertura de Casillas</button>
            )}
            {esAltoMando && (
              <button onClick={() => setVista('regiones')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'regiones' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🌎 Regiones</button>
            )}
            <button onClick={() => setVista('permisos')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'permisos' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔐 Permisos por Rol</button>
            <button onClick={() => setVista('duplicados')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${vista === 'duplicados' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🔁 Duplicados</button>
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
        {vista === 'codigos' ? (
          <PanelCodigosMasivos />
        ) : vista === 'organigrama' ? (
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
        ) : vista === 'representantes-ine' && esAltoMando ? (
          <PanelCasillas />
        ) : vista === 'gamificacion' ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">Puntos por actividad real: 10 por promovido capturado, 25 si se compromete, 5 por cada seguimiento a un persuadible, 40 si lo convences, 50 por reportar en Día D, 5 por reportar una incidencia.</p>
            {gamificacion.map((p) => (
              <div key={p.id} className={`rounded-xl border p-3 ${p.posicion <= 3 ? 'bg-amber-500/5 border-amber-500/30' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandido(expandido === p.id ? null : p.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-slate-600 w-6">#{p.posicion}</span>
                    <span className="text-xl">{p.nivel.ic}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{p.nombre}</div>
                      <div className="text-[9px] text-slate-500">{p.puesto || p.rol} · Nivel {p.nivel.nombre}</div>
                    </div>
                  </div>
                  <span className="text-lg font-black text-amber-400">{p.puntos} pts</span>
                </div>
                {expandido === p.id && (
                  <div className="mt-2 pt-2 border-t border-slate-800 grid grid-cols-3 gap-1.5 text-[9px] text-slate-400">
                    <div>👥 Promovidos: {p.desglose.promovidos}</div>
                    <div>✅ Comprometidos: {p.desglose.comprometidos}</div>
                    <div>📅 Seguimientos: {p.desglose.seguimientos}</div>
                    <div>🎉 Convertidos: {p.desglose.convertidos}</div>
                    <div>🗳️ Día D: {p.desglose.dia_d}</div>
                    <div>🚨 Incidencias: {p.desglose.incidencias}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : vista === 'cobertura-casillas' && esAltoMando && cobertura ? (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500">Estimado con la regla oficial del INE (máximo ~750 electores por casilla básica) — no es el listado exacto del INE, así que se puede corregir a mano si tu realidad es distinta.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-white">{cobertura.secciones_completas} <span className="text-slate-500 text-sm">de {cobertura.total_secciones}</span></div>
                <div className="text-[9px] text-slate-500">Secciones con TODAS sus casillas cubiertas</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-red-400">{cobertura.secciones_incompletas}</div>
                <div className="text-[9px] text-slate-500">Secciones con representantes faltantes</div>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-slate-300">
              🗳️ {cobertura.total_casillas_cubiertas} de {cobertura.total_casillas_oficiales} casillas oficiales estimadas tienen representante asignado
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={soloIncompletas} onChange={(e) => setSoloIncompletas(e.target.checked)} />
              Mostrar solo secciones incompletas
            </label>
            <div className="space-y-1.5">
              {cobertura.detalle.filter((s) => !soloIncompletas || !s.completa).map((s) => (
                <div key={s.seccion_id} className={`rounded-lg border p-2.5 ${s.completa ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setSeccionExpandida(seccionExpandida === s.seccion_id ? null : s.seccion_id)}>
                    <span className="text-xs font-bold text-white">{s.completa ? '✅' : '⚠️'} Sección {s.seccion_numero}</span>
                    <span className={`text-xs font-bold ${s.completa ? 'text-emerald-400' : 'text-red-400'}`}>{s.cubiertas}/{s.total_oficiales}</span>
                  </div>
                  {seccionExpandida === s.seccion_id && (
                    <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                      {s.casillas_oficiales.map((c) => (
                        <div key={c.id} className="flex justify-between text-[10px] text-slate-400">
                          <span>{c.tipo} {c.electores_estimados ? `(~${c.electores_estimados} electores)` : ''}</span>
                          <button onClick={() => quitarCasillaOficial(c.id)} className="text-red-400 font-bold">Quitar</button>
                        </div>
                      ))}
                      <div className="flex gap-1.5 pt-1.5">
                        <input placeholder="tipo (ej. especial)" value={nuevaCasilla.tipo} onChange={(e) => setNuevaCasilla({ ...nuevaCasilla, tipo: e.target.value })}
                          className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[10px]" />
                        <input placeholder="electores" type="number" value={nuevaCasilla.electores_estimados} onChange={(e) => setNuevaCasilla({ ...nuevaCasilla, electores_estimados: e.target.value })}
                          className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[10px]" />
                        <button onClick={() => agregarCasillaOficial(s.seccion_numero)} className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold">+ Agregar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : vista === 'regiones' && esAltoMando ? (
          <PanelRegiones />
        ) : vista === 'permisos' ? (
          <PanelPermisosPorRol />
        ) : vista === 'duplicados' ? (
          <PanelDuplicados />
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
      {mostrarAyuda && <ModalAyudaEstructura onCerrar={() => setMostrarAyuda(false)} />}
    </div>
  );
}

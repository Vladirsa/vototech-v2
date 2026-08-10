import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const MOTIVO_ESTADO = { pendiente: 'text-amber-400 bg-amber-500/10', ejecutada: 'text-emerald-400 bg-emerald-500/10', cancelada: 'text-slate-500 bg-slate-500/10' };

export default function Respaldos() {
  const [respaldos, setRespaldos] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(null);
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false);
  const [fechaElegida, setFechaElegida] = useState('');
  const [solicitando, setSolicitando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargar = () => {
    api.get('/respaldos').then((r) => setRespaldos(r.data.data)).catch((e) => setError(e.response?.data?.error || 'No se pudieron cargar los respaldos'));
    api.get('/respaldos/solicitudes').then((r) => setSolicitudes(r.data.data)).catch(() => setSolicitudes([]));
  };
  useEffect(cargar, []);

  const descargar = async (nombre) => {
    setDescargando(nombre);
    try {
      const { data } = await api.get(`/respaldos/descargar/${nombre}`);
      window.open(data.url, '_blank');
    } catch (e) {
      alert('No se pudo generar el link de descarga: ' + (e.response?.data?.error || e.message));
    }
    setDescargando(null);
  };

  const solicitarRestauracion = async () => {
    if (!fechaElegida) return;
    setSolicitando(true);
    setMensaje('');
    try {
      const { data } = await api.post('/respaldos/solicitar-restauracion', { fecha_respaldo: fechaElegida });
      setMensaje('✅ ' + data.mensaje);
      setMostrarRestaurar(false);
      setFechaElegida('');
      cargar();
    } catch (e) {
      setMensaje('⚠️ ' + (e.response?.data?.error || e.message));
    }
    setSolicitando(false);
  };

  const aprobar = async (id) => {
    if (!confirm('¿Confirmas que quieres aprobar esta restauración? Esto va a reemplazar los datos actuales de tu campaña por los de esa fecha.')) return;
    try {
      const { data } = await api.post(`/respaldos/aprobar-restauracion/${id}`);
      alert(data.mensaje);
      cargar();
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-black text-white">📦 Mis Respaldos</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>

        <p className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          Cada día se guarda una copia completa de tu campaña — estructura, promovidos, agenda, incidencias, finanzas, activos, casillas, encuestas. Se conservan los últimos <strong className="text-slate-300">90 días</strong>; después se borran solos.
        </p>

        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-3">{error}</div>}

        {/* Solicitudes de restauración — propias o pendientes de tu aprobación */}
        {solicitudes.length > 0 && (
          <div className="bg-slate-900/60 border border-purple-800/40 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-bold text-white">🔁 Solicitudes de restauración</h2>
            {solicitudes.map((s) => (
              <div key={s.id} className="bg-slate-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white font-bold">Fecha: {new Date(s.fecha_respaldo).toLocaleDateString('es-MX')}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MOTIVO_ESTADO[s.estado]}`}>{s.estado}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Pedida por: {s.solicitado_por_admin ? 'Equipo VotoTech' : (s.solicitado_por_nombre || 'ti')} · {s.aprobado_candidato ? '✅' : '⏳'} Candidato · {s.aprobado_admin ? '✅' : '⏳'} VotoTech
                </div>
                {s.estado === 'pendiente' && !s.aprobado_candidato && (
                  <button onClick={() => aprobar(s.id)} className="text-[10px] font-bold text-emerald-400">✅ Aprobar de mi lado</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pedir una restauración */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          {!mostrarRestaurar ? (
            <button onClick={() => setMostrarRestaurar(true)} className="w-full py-2.5 rounded-lg bg-purple-600/80 text-white text-sm font-bold">
              🔁 Solicitar restaurar una fecha
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-amber-400">⚠️ Restaurar reemplaza tu información actual por la de ese día — necesita que tú y el equipo de VotoTech lo aprueben antes de ejecutarse.</p>
              <input type="date" value={fechaElegida} onChange={(e) => setFechaElegida(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setMostrarRestaurar(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">Cancelar</button>
                <button onClick={solicitarRestauracion} disabled={!fechaElegida || solicitando} className="flex-[2] py-2 rounded-lg bg-purple-600 text-white text-xs font-bold disabled:opacity-40">
                  {solicitando ? '⏳...' : 'Solicitar'}
                </button>
              </div>
            </div>
          )}
          {mensaje && <p className="text-[10px] text-slate-300">{mensaje}</p>}
        </div>

        {/* Lista de respaldos disponibles */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">📅 Respaldos disponibles</h2>
          {respaldos === null ? (
            <div className="text-center text-slate-500 text-xs py-8">⏳ Cargando...</div>
          ) : respaldos.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-8">Sin respaldos todavía — se genera el primero en las próximas 24 horas</div>
          ) : (
            <div className="space-y-1.5">
              {respaldos.map((r) => (
                <div key={r.nombre} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-xs font-bold text-white">{r.fecha ? new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : r.nombre}</div>
                    {r.tamano_kb && <div className="text-[9px] text-slate-500">{r.tamano_kb} KB</div>}
                  </div>
                  <button onClick={() => descargar(r.nombre)} disabled={descargando === r.nombre}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40">
                    {descargando === r.nombre ? '⏳...' : '⬇️ Descargar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

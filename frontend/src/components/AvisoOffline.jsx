import { useEffect, useState } from 'react';
import { contarPendientesOffline, sincronizarColaOffline, obtenerRechazadosOffline, descartarOffline } from '../lib/colaOffline';
import { useAuth } from '../lib/authStore';

/**
 * Insignia flotante que avisa cuando hay reportes guardados
 * localmente esperando señal para enviarse — visible en toda la app,
 * para que nadie piense que su reporte "ya se fue" cuando en
 * realidad sigue esperando conexión en el celular.
 */
export default function AvisoOffline() {
  const usuario = useAuth((s) => s.usuario);
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [rechazados, setRechazados] = useState([]);

  const revisar = async () => {
    setPendientes(await contarPendientesOffline());
    setRechazados(await obtenerRechazadosOffline());
  };

  const descartar = async (id) => { await descartarOffline(id); await revisar(); };

  useEffect(() => {
    if (!usuario) return;
    revisar();
    const intervalo = setInterval(revisar, 15000); // revisa cada 15s, por si algo se agregó a la cola
    window.addEventListener('online', revisar);
    return () => { clearInterval(intervalo); window.removeEventListener('online', revisar); };
  }, [usuario]);

  const reintentarAhora = async () => {
    setSincronizando(true);
    await sincronizarColaOffline();
    await revisar();
    setSincronizando(false);
  };

  if (pendientes === 0 && rechazados.length === 0) return null;

  return (
    <>
    {rechazados.length > 0 && (
      <div className="fixed bottom-32 left-3 right-3 z-40 bg-red-700 text-white text-xs rounded-xl shadow-xl p-3 space-y-2 max-h-60 overflow-auto">
        <div className="font-bold">⚠️ {rechazados.length} captura{rechazados.length > 1 ? 's' : ''} guardada{rechazados.length > 1 ? 's' : ''} sin señal NO se aceptó al enviarse:</div>
        {rechazados.map((r) => (
          <div key={r.id} className="bg-white/10 rounded-lg p-2 flex items-start gap-2">
            <div className="flex-1">
              <div className="font-bold">{r.tipo}</div>
              <div className="text-[11px] opacity-90">{r.error}</div>
              <div className="text-[10px] opacity-70">Revísala y vuelve a capturarla, o avisa a tu coordinador.</div>
            </div>
            <button onClick={() => descartar(r.id)} className="bg-white/20 px-2 py-1 rounded-full text-[10px] font-bold">Entendido</button>
          </div>
        ))}
      </div>
    )}
    {pendientes > 0 && (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
      📡 {pendientes} reporte{pendientes > 1 ? 's' : ''} sin enviar (sin señal)
      <button onClick={reintentarAhora} disabled={sincronizando} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full text-[10px] disabled:opacity-50">
        {sincronizando ? '⏳...' : '↻ Reintentar'}
      </button>
    </div>
    )}
    </>
  );
}

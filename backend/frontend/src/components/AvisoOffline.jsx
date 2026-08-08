import { useEffect, useState } from 'react';
import { contarPendientesOffline, sincronizarColaOffline } from '../lib/colaOffline';
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

  const revisar = async () => setPendientes(await contarPendientesOffline());

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

  if (pendientes === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
      📡 {pendientes} reporte{pendientes > 1 ? 's' : ''} sin enviar (sin señal)
      <button onClick={reintentarAhora} disabled={sincronizando} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full text-[10px] disabled:opacity-50">
        {sincronizando ? '⏳...' : '↻ Reintentar'}
      </button>
    </div>
  );
}

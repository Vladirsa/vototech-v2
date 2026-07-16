import { useState } from 'react';
import api from '../lib/api';

/**
 * Botón + panel de asistencia IA que se inserta DENTRO de otros
 * módulos (no es una pantalla aparte que nadie visita). Se le dice
 * en qué contexto está usándose y genera el texto ahí mismo.
 */
export default function AsistenteIA({ contexto, nombreDestinatario, onTextoGenerado }) {
  const [abierto, setAbierto] = useState(false);
  const [detalles, setDetalles] = useState('');
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState('');

  const generar = async () => {
    setGenerando(true);
    try {
      const { data } = await api.post('/ia/redactar', { contexto, detalles, nombre_destinatario: nombreDestinatario });
      setResultado(data.data.mensaje);
    } catch (e) {
      setResultado('⚠️ No se pudo generar el mensaje. Intenta de nuevo.');
    }
    setGenerando(false);
  };

  const usar = () => { onTextoGenerado(resultado); setAbierto(false); setResultado(''); };

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="text-[10px] font-bold text-purple-400 flex items-center gap-1">
        ✨ Ayúdame a redactar
      </button>
    );
  }

  return (
    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
      <div className="text-[10px] font-bold text-purple-300">✨ Asistente de redacción</div>
      <input placeholder="Detalles opcionales (ej: es sobre el mitin del sábado)" value={detalles} onChange={(e) => setDetalles(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-xs" />
      <div className="flex gap-1.5">
        <button onClick={generar} disabled={generando} className="flex-1 py-1.5 rounded bg-purple-600 text-white text-[10px] font-bold disabled:opacity-50">
          {generando ? '⏳ Generando...' : '✨ Generar'}
        </button>
        <button onClick={() => setAbierto(false)} className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 text-[10px]">✕</button>
      </div>
      {resultado && (
        <div className="bg-slate-900 rounded-lg p-2.5 space-y-2">
          <p className="text-xs text-slate-200">{resultado}</p>
          <button onClick={usar} className="w-full py-1.5 rounded bg-emerald-600 text-white text-[10px] font-bold">✅ Usar este mensaje</button>
        </div>
      )}
    </div>
  );
}

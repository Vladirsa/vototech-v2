import { useState } from 'react';
import api from '../lib/api';

/**
 * Botón que le pide a la IA interpretar datos que YA se calcularon
 * con SQL determinista — nunca le pedimos que invente cifras, solo
 * que las traduzca a español sencillo con una lectura práctica.
 */
export default function InterpretarIA({ datos, titulo }) {
  const [interpretacion, setInterpretacion] = useState('');
  const [generando, setGenerando] = useState(false);

  const generar = async () => {
    setGenerando(true);
    try {
      const { data } = await api.post('/ia/interpretar-tendencia', { datos, titulo_seccion: titulo });
      setInterpretacion(data.data.interpretacion);
    } catch (e) {
      setInterpretacion('⚠️ No se pudo generar la interpretación. Intenta de nuevo.');
    }
    setGenerando(false);
  };

  return (
    <div className="space-y-2">
      {!interpretacion ? (
        <button onClick={generar} disabled={generando} className="text-[10px] font-bold text-purple-400 flex items-center gap-1 disabled:opacity-50">
          {generando ? '⏳ Analizando...' : '🧠 Interpretar con IA'}
        </button>
      ) : (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2.5">
          <div className="text-[9px] font-bold text-purple-300 mb-1">🧠 Interpretación</div>
          <p className="text-xs text-slate-200 leading-relaxed">{interpretacion}</p>
          <button onClick={() => setInterpretacion('')} className="text-[9px] text-slate-500 mt-1.5">✕ Cerrar</button>
        </div>
      )}
    </div>
  );
}

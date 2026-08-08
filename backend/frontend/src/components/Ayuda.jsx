import { useState } from 'react';

/**
 * Ícono "?" que muestra una explicación en español sencillo al
 * tocarlo — para usuarios que no son técnicos y no saben para qué
 * sirve un campo o qué significa un resultado. Se usa junto a
 * etiquetas de campos, títulos de sección, o resultados numéricos.
 */
export default function Ayuda({ texto, posicion = 'arriba' }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <span className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        className="w-4 h-4 rounded-full bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white text-[10px] font-bold flex items-center justify-center leading-none transition-colors"
      >
        ?
      </button>
      {abierto && (
        <div
          className={`absolute z-50 w-56 p-2.5 rounded-lg bg-slate-950 border border-slate-700 shadow-xl text-[10px] text-slate-300 leading-relaxed normal-case font-normal
            ${posicion === 'arriba' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : 'top-full left-1/2 -translate-x-1/2 mt-2'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {texto}
        </div>
      )}
    </span>
  );
}

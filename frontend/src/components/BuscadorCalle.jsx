import { useState, useRef } from 'react';

/**
 * Busca calles/direcciones reales usando Nominatim (el buscador
 * gratuito de OpenStreetMap, sin necesidad de API key). Limitado
 * geográficamente a Tlaxcala para resultados más precisos.
 */
export default function BuscadorCalle({ valor, onSeleccion }) {
  const [texto, setTexto] = useState(valor || '');
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const temporizador = useRef(null);

  const buscar = (q) => {
    setTexto(q);
    clearTimeout(temporizador.current);
    if (q.trim().length < 3) { setSugerencias([]); return; }

    // Esperar 400ms sin que la persona siga escribiendo antes de buscar
    // (evita mandar una petición por cada letra)
    temporizador.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Tlaxcala, México')}&limit=6&countrycodes=mx`;
        const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } });
        const data = await resp.json();
        setSugerencias(data);
        setMostrar(true);
      } catch (e) { setSugerencias([]); }
      setBuscando(false);
    }, 400);
  };

  const seleccionar = (s) => {
    setTexto(s.display_name.split(',')[0]);
    setMostrar(false);
    onSeleccion({
      calle: s.display_name.split(',')[0],
      direccion_completa: s.display_name,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
    });
  };

  return (
    <div className="relative">
      <input
        placeholder="Busca la calle real (ej: Av. Juárez)"
        value={texto}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => sugerencias.length && setMostrar(true)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
      />
      {buscando && <div className="absolute right-3 top-3 text-xs text-slate-500">⏳</div>}
      {mostrar && sugerencias.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
          {sugerencias.map((s, i) => (
            <button key={i} onClick={() => seleccionar(s)}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800 last:border-0">
              📍 {s.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

/**
 * Busca calles/direcciones — primero en el catálogo LOCAL (cargado
 * del INEGI, ~17,000 calles reales de Tlaxcala), y solo si no
 * encuentra nada ahí, cae a Nominatim (OpenStreetMap) como respaldo.
 * Mucho más rápido en el caso común, y funciona igual de bien sin
 * depender de qué tan cargada esté la red en ese momento.
 *
 * 🆕 LA CORRECCIÓN REAL DEL "NO SE LLENA CON LA CREDENCIAL" — antes
 * este componente guardaba su propio texto con useState(valor) y
 * SOLO tomaba en cuenta ese valor la primera vez que aparecía en
 * pantalla; si algo de afuera (como la lectura de credencial)
 * cambiaba `valor` después, el componente nunca se enteraba — es un
 * error clásico de React (estado "descontrolado" que ignora cambios
 * del prop). Ahora sí reacciona, Y de paso dispara la búsqueda real
 * automáticamente, para que el domicilio quede geolocalizado (con
 * lat/lng reales) y no solo como texto suelto.
 */
export default function BuscadorCalle({ valor, onSeleccion }) {
  const [texto, setTexto] = useState(valor || '');
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const temporizador = useRef(null);
  // Guarda el último valor que EL PROPIO componente generó (al
  // seleccionar una sugerencia) — así se distingue "esto lo cambié
  // yo" de "esto lo cambiaron de afuera", y no se dispara una
  // búsqueda en bucle cada vez que el usuario elige una opción.
  const ultimoValorPropio = useRef(valor || '');

  const buscarDirecciones = async (q) => {
    setBuscando(true);
    try {
      // 🆕 Primero el catálogo local — rápido, tuyo, sin depender de
      // ningún servicio externo.
      const { data } = await api.get(`/calles/buscar?q=${encodeURIComponent(q)}`);
      if (data.data.length > 0) {
        setSugerencias(data.data.map((c) => ({
          fuente: 'local',
          texto_mostrar: `${c.nombre}${c.municipio ? `, ${c.municipio}` : ''}`,
          calle: c.nombre,
          direccion_completa: `${c.nombre}${c.municipio ? `, ${c.municipio}, Tlaxcala` : ', Tlaxcala'}`,
          lat: c.lat, lng: c.lng,
        })));
        setMostrar(true);
        setBuscando(false);
        return;
      }
    } catch (e) { /* si falla la búsqueda local, sigue con el respaldo de abajo */ }

    // Respaldo — Nominatim, solo si el catálogo local no encontró nada.
    try {
      const cajaTlaxcala = '-98.75,19.65,-97.85,19.00'; // izquierda,arriba,derecha,abajo
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&countrycodes=mx&viewbox=${cajaTlaxcala}&bounded=1`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await resp.json();
      setSugerencias(data.map((s) => ({
        fuente: 'nominatim',
        texto_mostrar: s.display_name,
        calle: s.display_name.split(',')[0],
        direccion_completa: s.display_name,
        lat: parseFloat(s.lat), lng: parseFloat(s.lon),
      })));
      setMostrar(data.length > 0);
    } catch (e) { setSugerencias([]); }
    setBuscando(false);
  };

  // 🆕 Cuando `valor` cambia desde AFUERA (ej. la credencial llenó el
  // domicilio), se refleja en el campo Y se busca automático — el
  // usuario solo tiene que tocar la sugerencia correcta para
  // confirmar, en vez de tener que borrar y volver a escribir todo.
  useEffect(() => {
    if (valor && valor !== ultimoValorPropio.current) {
      setTexto(valor);
      if (valor.trim().length >= 3) buscarDirecciones(valor);
    }
  }, [valor]);

  const buscar = (q) => {
    setTexto(q);
    clearTimeout(temporizador.current);
    if (q.trim().length < 3) { setSugerencias([]); return; }

    // Esperar 400ms sin que la persona siga escribiendo antes de buscar
    // (evita mandar una petición por cada letra)
    temporizador.current = setTimeout(() => buscarDirecciones(q), 400);
  };

  const seleccionar = (s) => {
    ultimoValorPropio.current = s.calle; // marca este cambio como propio, no dispara el useEffect de arriba
    setTexto(s.calle);
    setMostrar(false);
    onSeleccion({
      calle: s.calle,
      direccion_completa: s.direccion_completa,
      lat: s.lat,
      lng: s.lng,
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
              {s.fuente === 'local' ? '📍' : '🌐'} {s.texto_mostrar}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

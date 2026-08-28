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
export default function BuscadorCalle({ valor, onSeleccion, seccionNumero }) {
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
  // 🆕 Para mostrar un aviso breve de "ubicación confirmada sola" —
  // solo cosmético, se apaga solo después de unos segundos.
  const [avisoAutomatico, setAvisoAutomatico] = useState(false);

  const buscarDirecciones = async (q, esAutomatico = false) => {
    setBuscando(true);
    // 🆕 LA CORRECCIÓN REAL — antes, cuando la credencial llenaba el
    // domicilio, la lista de sugerencias se abría igual que si el
    // usuario estuviera escribiendo, y se quedaba flotando ENCIMA de
    // los campos de abajo (sección, partido, etc.) hasta que alguien
    // tocaba una opción — parecía que esos campos "desaparecían".
    // Ahora, cuando la búsqueda viene automática (esAutomatico=true),
    // se elige sola la mejor coincidencia y nunca se abre la lista.
    const aplicarAutomatico = (sugerenciasEncontradas) => {
      const mejor = sugerenciasEncontradas[0];
      ultimoValorPropio.current = mejor.calle;
      setTexto(mejor.calle);
      setMostrar(false);
      onSeleccion({ calle: mejor.calle, direccion_completa: mejor.direccion_completa, lat: mejor.lat, lng: mejor.lng });
      setAvisoAutomatico(true);
      setTimeout(() => setAvisoAutomatico(false), 4000);
    };

    try {
      // 🆕 Primero el catálogo local — rápido, tuyo, sin depender de
      // ningún servicio externo. Si ya se eligió una sección, se manda
      // para acotar la búsqueda a ese municipio primero.
      const parametroSeccion = seccionNumero ? `&seccion=${seccionNumero}` : '';
      const { data } = await api.get(`/calles/buscar?q=${encodeURIComponent(q)}${parametroSeccion}`);
      if (data.data.length > 0) {
        const mapeadas = data.data.map((c) => ({
          fuente: 'local',
          texto_mostrar: `${c.nombre}${c.municipio ? `, ${c.municipio}` : ''}`,
          calle: c.nombre,
          direccion_completa: `${c.nombre}${c.municipio ? `, ${c.municipio}, Tlaxcala` : ', Tlaxcala'}`,
          lat: c.lat, lng: c.lng,
        }));
        setSugerencias(mapeadas);
        if (esAutomatico) { aplicarAutomatico(mapeadas); } else { setMostrar(true); }
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
      const mapeadas = data.map((s) => ({
        fuente: 'nominatim',
        texto_mostrar: s.display_name,
        calle: s.display_name.split(',')[0],
        direccion_completa: s.display_name,
        lat: parseFloat(s.lat), lng: parseFloat(s.lon),
      }));
      setSugerencias(mapeadas);
      if (esAutomatico && mapeadas.length > 0) { aplicarAutomatico(mapeadas); } else { setMostrar(mapeadas.length > 0); }
    } catch (e) { setSugerencias([]); }
    setBuscando(false);
  };

  // 🆕 Cuando `valor` cambia desde AFUERA (ej. la credencial llenó el
  // domicilio), se refleja en el campo Y se busca automático — ahora
  // elige sola la mejor coincidencia (ver aplicarAutomatico arriba),
  // en vez de dejar la lista abierta esperando un clic.
  useEffect(() => {
    if (valor && valor !== ultimoValorPropio.current) {
      setTexto(valor);
      if (valor.trim().length >= 3) buscarDirecciones(valor, true);
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
      {avisoAutomatico && (
        <p className="text-[10px] text-emerald-400 mt-1">✅ Ubicación confirmada automáticamente desde la credencial — revisa que sea correcta.</p>
      )}
    </div>
  );
}

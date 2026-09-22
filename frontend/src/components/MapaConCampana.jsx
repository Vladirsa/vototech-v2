import { useEffect, useState } from 'react';
import api from '../lib/api';
import MapaElectoral from './MapaElectoral';

/**
 * Antes el mapa recibía el territorio "quemado" en el código
 * (siempre Apizaco, siempre Ayuntamiento) sin importar la campaña
 * real de quien entrara. Este componente carga primero los datos
 * verdaderos de LA campaña del usuario logueado, y solo entonces
 * monta el mapa con su territorio y tipo de elección reales.
 */
export default function MapaConCampana() {
  const [campana, setCampana] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/auth/mi-campana')
      .then((r) => setCampana(r.data.data))
      .catch(() => setError(true));
  }, []);

  // 🆕 Respaldo por JavaScript para navegadores móviles que aún no
  // soportan "dvh" — calcula la altura REAL visible con
  // window.innerHeight (que sí se actualiza cuando la barra de
  // direcciones aparece/desaparece), y la guarda como variable CSS.
  const [alturaRealPx, setAlturaRealPx] = useState(null);
  useEffect(() => {
    const actualizar = () => setAlturaRealPx(window.innerHeight);
    actualizar();
    window.addEventListener('resize', actualizar);
    window.addEventListener('orientationchange', actualizar);
    return () => {
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('orientationchange', actualizar);
    };
  }, []);

  if (error) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 text-sm">⚠️ No se pudo cargar la información de tu campaña</div>;
  }
  if (!campana) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando tu territorio...</div>;
  }

  return (
    // 🆕 LA CORRECCIÓN REAL — antes MapaElectoral se ponía directo
    // aquí, sin ningún contenedor con una altura fija de verdad. El
    // mapa por dentro usa "h-full" (100% de su papá), pero sin este
    // div, ese "100%" nunca tenía un número real del cual partir —
    // así que el mapa (y cualquier panel flotante dentro de él, como
    // el de Coloreado) podía crecer sin límite, y ESO era lo que
    // empujaba el scroll de toda la pantalla, sin importar hacia qué
    // lado se arrastrara un panel.
    //
    // "calc(100vh-45px)" le da una altura FIJA y calculada en
    // pixeles reales (toda la pantalla, menos el NavBar de arriba) —
    // no depende de que el resto de la app tenga su estructura de
    // flexbox perfecta, funciona sola sin importar el contexto donde
    // se monte. Y overflow-hidden asegura que nada de lo que esté
    // adentro se pueda salir de esa caja hacia el resto de la página.
    // 🆕 CORREGIDO — "100vh" en navegadores móviles NO es la altura
    // real visible: incluye el espacio de la barra de direcciones
    // aunque esté mostrándose, así que el contenido calculado con
    // 100vh queda MÁS ALTO que lo que en verdad se ve en pantalla —
    // por eso el mapa se veía cortado en celular. "100dvh" (dynamic
    // viewport height) sí se ajusta al alto real visible en cada
    // momento, tanto si la barra de direcciones está mostrada como
    // oculta.
    <div className="h-[calc(100dvh-45px)] overflow-hidden" style={alturaRealPx ? { height: `${alturaRealPx - 45}px` } : undefined}>
      <MapaElectoral
        estadoId={campana.estado_id}
        territorioTipo={campana.territorio_tipo}
        territorioId={campana.territorio_id}
        tipoEleccion={campana.tipo_eleccion}
      />
    </div>
  );
}

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

  if (error) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 text-sm">⚠️ No se pudo cargar la información de tu campaña</div>;
  }
  if (!campana) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">⏳ Cargando tu territorio...</div>;
  }

  return (
    <MapaElectoral
      territorioTipo={campana.territorio_tipo}
      territorioId={campana.territorio_id}
      tipoEleccion={campana.tipo_eleccion}
    />
  );
}

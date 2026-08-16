import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';

const CENTRO_TLAXCALA = [19.32, -98.24];

function ManejadorClic({ onClic }) {
  useMapEvents({
    click(e) { onClic(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/**
 * 🆕 Selector de ubicación por mapa — para bardas, espectaculares y
 * mantas que no tienen una dirección clara que buscar (ej. carretera
 * Apizaco-Huamantla km 5). Se toca el punto exacto en el mapa y
 * quedan las coordenadas reales, sin depender de un domicilio.
 *
 * Funciona junto con BuscadorCalle, no en su lugar — si el activo SÍ
 * tiene una dirección clara, sigue siendo más rápido buscarla; este
 * mapa es para cuando no la hay, o para afinar el punto exacto
 * después de una búsqueda aproximada.
 */
export default function SelectorUbicacionMapa({ lat, lng, onCambio }) {
  const tienePunto = lat != null && lng != null;
  const centro = tienePunto ? [lat, lng] : CENTRO_TLAXCALA;

  return (
    <div>
      <div className="rounded-lg overflow-hidden border border-slate-700" style={{ height: 200 }}>
        <MapContainer center={centro} zoom={tienePunto ? 16 : 10} style={{ height: '100%', width: '100%' }} key={tienePunto ? 'con-punto' : 'sin-punto'}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <ManejadorClic onClic={onCambio} />
          {tienePunto && <Marker position={[lat, lng]} />}
        </MapContainer>
      </div>
      <p className="text-[9px] text-slate-500 text-center mt-1">
        {tienePunto ? '📍 Toca otro punto del mapa para moverlo' : '👆 Toca el mapa para marcar la ubicación exacta'}
      </p>
    </div>
  );
}

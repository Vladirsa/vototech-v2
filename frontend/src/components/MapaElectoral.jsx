import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import axios from 'axios';
import api from '../lib/api';

// Colores por clasificación estratégica (Base/Persuadible/Adversario) —
// mismo lenguaje visual que ya usamos en Dashboard y Promovidos.
const COLOR_CLASIFICACION = {
  base: '#10b981', persuadible: '#f59e0b', adversario: '#64748b',
};

/**
 * Capa de mapa de calor — usa leaflet.heat directamente sobre el mapa
 * (no hay wrapper de react-leaflet para esto, así que se maneja con
 * useMap + efecto manual).
 */
function CapaCalor({ puntos, activa }) {
  const map = useMap();
  const capaRef = useRef(null);

  useEffect(() => {
    if (capaRef.current) { map.removeLayer(capaRef.current); capaRef.current = null; }
    if (activa && puntos.length > 0) {
      capaRef.current = L.heatLayer(puntos.map(p => [p.lat, p.lng, 0.6]), {
        radius: 28, blur: 20, maxZoom: 16,
        gradient: { 0.2: '#312e81', 0.5: '#7c3aed', 0.8: '#ec4899', 1: '#f43f5e' },
      }).addTo(map);
    }
    return () => { if (capaRef.current) map.removeLayer(capaRef.current); };
  }, [activa, puntos, map]);

  return null;
}

// ── COLORES OFICIALES DE PARTIDOS (con degradado, no plano) ──
const PARTIDOS = {
  morena:  { color: '#8B0000', color2: '#B91C1C', nombre: 'MORENA' },
  pan:     { color: '#003DA5', color2: '#1D4ED8', nombre: 'PAN' },
  pri:     { color: '#006847', color2: '#059669', nombre: 'PRI' },
  pvem:    { color: '#2D7D27', color2: '#16A34A', nombre: 'PVEM' },
  pt:      { color: '#CC0000', color2: '#DC2626', nombre: 'PT' },
  mc:      { color: '#F26522', color2: '#F97316', nombre: 'MC' },
  prd:     { color: '#FFCB00', color2: '#EAB308', nombre: 'PRD' },
  pac:     { color: '#E91E63', color2: '#EC4899', nombre: 'PAC' },
};

/**
 * Componente que anima el "vuelo" de la cámara del mapa hacia una
 * sección cuando el usuario la selecciona — sensación mucho más
 * fluida que el zoom instantáneo que teníamos en la v1 con SVG.
 */
function VueloCamara({ centro, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (centro) map.flyTo(centro, zoom, { duration: 1.2 });
  }, [centro, zoom, map]);
  return null;
}

export default function MapaElectoral({ campanaId, territorioTipo, territorioId, tipoEleccion = 'ayuntamiento', anio = 2024 }) {
  const [geoSecciones, setGeoSecciones] = useState(null);
  const [localidades, setLocalidades] = useState([]);
  const [resultados, setResultados] = useState({});
  const [manzanas, setManzanas] = useState(null);
  const [promovidos, setPromovidos] = useState([]);
  const [capaPromovidos, setCapaPromovidos] = useState(true);
  const [seccionActiva, setSeccionActiva] = useState(null);
  const [coloreadoActivo, setColoreadoActivo] = useState(true);
  const [capaLocalidades, setCapaLocalidades] = useState(true);
  const [capaCalor, setCapaCalor] = useState(false);
  const [buscarTexto, setBuscarTexto] = useState('');
  const [panelPos, setPanelPos] = useState({ x: 16, y: 16 });
  const arrastrando = useRef(false);

  useEffect(() => {
    api.get('/geo/secciones/29').then(r => setGeoSecciones(r.data.data));
    api.get('/geo/localidades/29').then(r => setLocalidades(r.data.data));
    api.get('/promovidos')
      .then(r => setPromovidos(r.data.data.filter(p => p.lat && p.lng)))
      .catch(() => setPromovidos([]));
  }, []);

  // Cargar resultados reales cada vez que cambia el tipo de elección/año elegido
  useEffect(() => {
    api.get(`/resultados/${tipoEleccion}/${anio}`)
      .then(r => setResultados(r.data.data))
      .catch(() => setResultados({}));
  }, [tipoEleccion, anio]);

  // Cargar manzanas SOLO de la sección activa (carga perezosa, igual que la v1
  // pero ahora con datos reales y sin depender de un archivo de 6MB completo)
  useEffect(() => {
    if (!seccionActiva) { setManzanas(null); return; }
    api.get(`/geo/manzanas/${seccionActiva}`).then(r => setManzanas(r.data.data));
  }, [seccionActiva]);

  // ── CASAS SIMULADAS (control casa por casa dentro de una manzana) ──
  const [manzanaActiva, setManzanaActiva] = useState(null);
  const [casas, setCasas] = useState([]);

  useEffect(() => {
    if (!seccionActiva || !manzanaActiva) { setCasas([]); return; }
    api.get(`/casas/${seccionActiva}/${manzanaActiva}`)
      .then(r => setCasas(r.data.data))
      .catch(() => setCasas([]));
  }, [seccionActiva, manzanaActiva]);

  const ESTADO_CASA_COLOR = {
    sin_visitar: '#64748b', visitado: '#3b82f6', promovido: '#10b981', competencia: '#ef4444', no_toco: '#f59e0b',
  };
  const ESTADO_CASA_LABEL = {
    sin_visitar: 'Sin visitar', visitado: 'Visitada', promovido: '✅ Promovido', competencia: '🚩 Competencia', no_toco: 'No tocó',
  };

  const cicloEstado = async (casa) => {
    const orden = ['sin_visitar', 'visitado', 'promovido', 'competencia', 'no_toco'];
    const siguiente = orden[(orden.indexOf(casa.estado) + 1) % orden.length];
    const body = siguiente === 'competencia'
      ? { estado: siguiente, partido_competencia: prompt('¿De qué partido es esta casa? (ej: pan, pri, morena)') || 'otro' }
      : { estado: siguiente };
    const { data } = await api.patch(`/casas/${casa.id}`, body);
    setCasas((prev) => prev.map((c) => (c.id === casa.id ? data.data : c)));
  };

  const iconoCasa = (estado) => new L.DivIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:${ESTADO_CASA_COLOR[estado]};border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,.6);border-radius:2px"></div>`,
    iconSize: [10, 10],
  });

  // ── PANEL DE COLOREADO REALMENTE MOVIBLE (arrastrar con el mouse/dedo) ──
  const iniciarArrastre = (e) => {
    arrastrando.current = { startX: e.clientX - panelPos.x, startY: e.clientY - panelPos.y };
    const mover = (ev) => {
      setPanelPos({ x: ev.clientX - arrastrando.current.startX, y: ev.clientY - arrastrando.current.startY });
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  // Filtrar solo las secciones del territorio del candidato (municipio/sección fija)
  const seccionesFiltradas = useMemo(() => {
    if (!geoSecciones) return null;
    if (!territorioTipo || territorioTipo === 'estatal') return geoSecciones;
    const filtradas = geoSecciones.features.filter(f => {
      if (territorioTipo === 'municipio') return f.properties.municipio === territorioId;
      if (territorioTipo === 'seccion') return f.properties.seccion === territorioId;
      return true;
    });
    return { ...geoSecciones, features: filtradas };
  }, [geoSecciones, territorioTipo, territorioId]);

  const localidadesFiltradas = useMemo(() => {
    if (!territorioTipo || territorioTipo === 'estatal') return localidades;
    return localidades.filter(l =>
      territorioTipo === 'municipio' ? l.municipio === territorioId : l.seccion === territorioId
    );
  }, [localidades, territorioTipo, territorioId]);

  // ── ESTILO DE CADA SECCIÓN (aquí vive el coloreado por partido) ──
  const estiloSeccion = (feature) => {
    const num = feature.properties.seccion;
    const resultado = resultados[num];
    const esSeleccionada = seccionActiva === num;

    let colorRelleno = '#3730a3';   // color por defecto (índigo neutral, no rojo/guinda)
    let opacidad = 0.35;

    if (coloreadoActivo && resultado?.ganador) {
      colorRelleno = PARTIDOS[resultado.ganador]?.color || colorRelleno;
      opacidad = 0.55;
    }

    return {
      fillColor: colorRelleno,
      fillOpacity: opacidad,
      color: esSeleccionada ? '#fbbf24' : '#ffffff',
      weight: esSeleccionada ? 3 : 1,
      opacity: esSeleccionada ? 1 : 0.4,
    };
  };

  const alPasarMouse = (feature, capa) => {
    capa.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 2.5, fillOpacity: 0.75 });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        e.target.setStyle(estiloSeccion(feature));
      },
      click: () => setSeccionActiva(feature.properties.seccion),
    });
    // Etiqueta permanente con el número de sección (SORPRESA: se ve solo con buen zoom, evita saturar)
    capa.bindTooltip(String(feature.properties.seccion).padStart(3, '0'), {
      permanent: false, direction: 'center', className: 'etiqueta-seccion',
    });
  };

  const iconoPromovido = (clasificacion) => new L.DivIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${COLOR_CLASIFICACION[clasificacion]||'#94a3b8'};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    iconSize: [12, 12],
  });

  const iconoLocalidad = (esCabecera) => new L.DivIcon({
    className: '',
    html: `<div class="${esCabecera ? 'pin-cabecera' : 'pin-localidad'}">${esCabecera ? '🏛️' : '📍'}</div>`,
    iconSize: [28, 28],
  });

  const centroTlaxcala = [19.32, -98.24];

  return (
    <div className="relative w-full h-[calc(100vh-45px)] bg-slate-950">
      <MapContainer center={centroTlaxcala} zoom={11} className="w-full h-full" zoomControl={false}>

        {/* SORPRESA 1: selector de tipo de mapa (satelital, oscuro, calles) — la v1 no tenía NINGÚN mapa base real */}
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="🌙 Oscuro (recomendado de noche)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🗺️ Calles">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🛰️ Satelital">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri'
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {seccionesFiltradas && (
          <GeoJSON
            key={`${coloreadoActivo}-${seccionActiva}-${territorioId}-${tipoEleccion}-${anio}`}
            data={seccionesFiltradas}
            style={estiloSeccion}
            onEachFeature={alPasarMouse}
          />
        )}

        {/* Manzanas reales — solo de la sección seleccionada, carga bajo demanda.
            Clic en una manzana = activarla para ver/marcar sus casas simuladas. */}
        {manzanas && manzanas.features.length > 0 && (
          <GeoJSON
            key={`manzanas-${seccionActiva}`}
            data={manzanas}
            style={(feat) => ({
              color: feat.properties.manzana === manzanaActiva ? '#fbbf24' : '#a78bfa',
              weight: feat.properties.manzana === manzanaActiva ? 2.5 : 1,
              fillColor: '#a78bfa', fillOpacity: feat.properties.manzana === manzanaActiva ? 0.03 : 0.1,
            })}
            onEachFeature={(feat, capa) => {
              capa.on({ click: () => setManzanaActiva(feat.properties.manzana) });
              capa.bindTooltip(`Manzana ${feat.properties.manzana} — toca para ver casas`, { direction: 'center' });
            }}
          />
        )}

        {/* Casas simuladas de la manzana activa — clic para ir cambiando su estado */}
        {casas.map((c) => (
          <Marker key={c.id} position={[c.lat, c.lng]} icon={iconoCasa(c.estado)}
            eventHandlers={{ click: () => cicloEstado(c) }}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{ESTADO_CASA_LABEL[c.estado]}</strong><br />
                {c.partido_competencia && <>Partido: {c.partido_competencia.toUpperCase()}<br /></>}
                {c.promovido_nombre && <>👤 {c.promovido_nombre}<br /></>}
                <em style={{ fontSize: 10, color: '#888' }}>Toca el punto para cambiar su estado</em>
              </div>
            </Popup>
          </Marker>
        ))}

        {capaLocalidades && localidadesFiltradas.map((loc, i) => (
          <Marker key={i} position={[loc.lat, loc.lng]} icon={iconoLocalidad(loc.cabecera)}>
            <Popup>
              <strong>{loc.cabecera ? '🏛️' : '📍'} {loc.nombre}</strong><br />
              Sección {String(loc.seccion).padStart(3, '0')}
            </Popup>
          </Marker>
        ))}

        {/* Promovidos reales — coloreados por clasificación estratégica */}
        {capaPromovidos && !capaCalor && promovidos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={iconoPromovido(p.clasificacion)}>
            <Popup>
              <strong>{p.nombre}</strong><br />
              {p.clasificacion === 'base' ? '✅ Base' : p.clasificacion === 'persuadible' ? '🎯 Persuadible' : '⛔ Adversario'}<br />
              {p.partido && `Partido: ${p.partido.toUpperCase()}`}
            </Popup>
          </Marker>
        ))}

        <CapaCalor puntos={promovidos} activa={capaCalor} />
      </MapContainer>

      {/* ── PANEL DE COLOREADO — AHORA SÍ REALMENTE MOVIBLE ── */}
      <div
        className="absolute bg-slate-900/95 backdrop-blur border border-indigo-500/30 rounded-2xl shadow-2xl w-64 select-none z-[1000]"
        style={{ left: panelPos.x, top: panelPos.y }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 cursor-move border-b border-slate-700"
          onMouseDown={iniciarArrastre}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🎨</span>
            <div>
              <div className="text-sm font-bold text-white">Coloreado por partido</div>
              <div className="text-[10px] text-indigo-400">⠿ Arrastra para mover</div>
            </div>
          </div>
          <button
            onClick={() => setColoreadoActivo(v => !v)}
            className={`w-10 h-5 rounded-full transition-colors ${coloreadoActivo ? 'bg-indigo-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${coloreadoActivo ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaLocalidades} onChange={e => setCapaLocalidades(e.target.checked)} />
            🏘️ Comunidades/Localidades
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaPromovidos} onChange={e => setCapaPromovidos(e.target.checked)} />
            🤝 Promovidos ({promovidos.length})
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaCalor} onChange={e => setCapaCalor(e.target.checked)} />
            🔥 Mapa de calor (densidad de promovidos)
          </label>
        </div>

        {coloreadoActivo && (
          <div className="grid grid-cols-2 gap-1.5 p-3 pt-0">
            {Object.entries(PARTIDOS).map(([id, p]) => (
              <div key={id} className="flex items-center gap-1.5 text-[10px] text-slate-300 font-semibold">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 shadow"
                  style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color2})` }}
                />
                {p.nombre}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leyenda de casas simuladas — solo visible con una manzana activa */}
      {manzanaActiva && (
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-white">🏠 Manzana {manzanaActiva}</span>
            <button onClick={() => setManzanaActiva(null)} className="text-slate-500 text-xs">✕</button>
          </div>
          {Object.entries(ESTADO_CASA_LABEL).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5 text-slate-300 mb-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ESTADO_CASA_COLOR[k] }} />
              {label}
            </div>
          ))}
          <div className="text-[9px] text-slate-500 mt-1">Toca un punto para cambiar su estado</div>
        </div>
      )}

      {/* Buscador de localidades — esquina superior izquierda */}
      <div className="absolute top-4 left-4 z-[1000] w-64">
        <input
          type="text"
          placeholder="🔍 Buscar comunidad..."
          value={buscarTexto}
          onChange={e => setBuscarTexto(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
}

import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, LayersControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
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

/** Captura el siguiente clic en el mapa mientras se está en modo
 * "colocar punto" — solo activo cuando activo=true. */
function CapturaClicMapa({ activo, onClick }) {
  useMapEvents({
    click: (e) => {
      if (activo) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Guarda la instancia del mapa en una ref externa, para poder
 * consultar su centro actual (ej. al soltar un pin nuevo). */
function CapturarRefMapa({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

export default function MapaElectoral({ campanaId, territorioTipo, territorioId, tipoEleccion = 'ayuntamiento', anio = 2024 }) {
  const navigate = useNavigate();

  // Detecta si es pantalla de celular — en mobile se usa un menú
  // consolidado en vez de tener 8 paneles flotando sueltos, que ahí
  // sí se amontonan y se encima todo.
  const [esMobile, setEsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const alRedimensionar = () => setEsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const mapRef = useRef(null);
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
  const [vueloDestino, setVueloDestino] = useState(null);

  const buscarSeccion = (valor) => {
    setBuscarTexto(valor);
    const numero = parseInt(valor);
    if (!numero || !centroidesSeccion[numero]) return;
    setSeccionActiva(numero);
    setVueloDestino({ centro: centroidesSeccion[numero], zoom: 16, key: Date.now() });
  };
  const [panelPos, setPanelPos] = useState({ x: 16, y: 190 });
  const arrastrando = useRef(false);

  // Centroide aproximado de cada sección (promedio de sus puntos) — se
  // usa como posición de respaldo para promovidos que no tienen lat/lng
  // propias (la mayoría, si no se usó el buscador de calles al registrarlos)
  const centroidesSeccion = useMemo(() => {
    if (!geoSecciones) return {};
    const mapa = {};
    geoSecciones.features.forEach((f) => {
      const anillo = f.geometry.coordinates[0];
      let sumaLat = 0, sumaLng = 0;
      anillo.forEach(([lng, lat]) => { sumaLat += lat; sumaLng += lng; });
      mapa[f.properties.seccion] = [sumaLat / anillo.length, sumaLng / anillo.length];
    });
    return mapa;
  }, [geoSecciones]);

  // Promovidos con posición resuelta: su propia lat/lng si la tiene,
  // o si no, el centroide de su sección con un pequeño desplazamiento
  // aleatorio (para que no queden todos apilados en el mismo punto exacto)
  const promovidosConPosicion = useMemo(() => {
    return promovidos
      .map((p) => {
        if (p.lat && p.lng) return { ...p, _lat: p.lat, _lng: p.lng };
        const centro = centroidesSeccion[p.seccion_numero];
        if (!centro) return null;
        const jitter = () => (Math.random() - 0.5) * 0.004; // ~200m de dispersión visual
        return { ...p, _lat: centro[0] + jitter(), _lng: centro[1] + jitter() };
      })
      .filter(Boolean);
  }, [promovidos, centroidesSeccion]);

  useEffect(() => {
    api.get('/geo/secciones/29').then(r => setGeoSecciones(r.data.data));
    api.get('/geo/localidades/29').then(r => setLocalidades(r.data.data));
    api.get('/promovidos')
      .then(r => setPromovidos(r.data.data))
      .catch(() => setPromovidos([]));
  }, []);

  // Cargar resultados reales cada vez que cambia el tipo de elección/año elegido
  useEffect(() => {
    api.get(`/resultados/${tipoEleccion}/${anio}`)
      .then(r => setResultados(r.data.data))
      .catch(() => setResultados({}));
  }, [tipoEleccion, anio]);

  // ── CASAS SIMULADAS (control casa por casa dentro de una manzana) ──
  const [manzanaActiva, setManzanaActiva] = useState(null);
  const [casas, setCasas] = useState([]);
  const [cargandoManzanas, setCargandoManzanas] = useState(false);

  useEffect(() => {
    // Limpiar INMEDIATAMENTE al cambiar de sección — antes este estado
    // se quedaba con las manzanas de la sección anterior mientras
    // llegaba la respuesta nueva, dando la impresión de un error.
    setManzanas(null);
    setManzanaActiva(null);
    setCasas([]);
    if (!seccionActiva) return;
    setCargandoManzanas(true);
    api.get(`/geo/manzanas/${seccionActiva}`)
      .then(r => setManzanas(r.data.data))
      .finally(() => setCargandoManzanas(false));
  }, [seccionActiva]);

  useEffect(() => {
    if (!seccionActiva || !manzanaActiva) { setCasas([]); return; }
    api.get(`/casas/${seccionActiva}/${manzanaActiva}`)
      .then(r => setCasas(r.data.data))
      .catch(() => setCasas([]));
  }, [seccionActiva, manzanaActiva]);

  // ── FICHA TÉCNICA DE SECCIÓN (padrón, históricos, promovidos, déficit) ──
  const [fichaTecnica, setFichaTecnica] = useState(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);

  useEffect(() => {
    if (!seccionActiva) { setFichaTecnica(null); return; }
    setCargandoFicha(true);
    setFichaTecnica(null);
    api.get(`/priorizacion/seccion/${seccionActiva}`)
      .then(r => setFichaTecnica(r.data.data))
      .catch(() => setFichaTecnica(null))
      .finally(() => setCargandoFicha(false));
  }, [seccionActiva]);

  // ── RESUMEN DE MUNICIPIO (ficha técnica completa del territorio) ──
  const [mostrarResumenMunicipio, setMostrarResumenMunicipio] = useState(false);
  const [resumenMunicipio, setResumenMunicipio] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const abrirResumenMunicipio = () => {
    if (territorioTipo !== 'municipio' || !territorioId) return;
    setMostrarResumenMunicipio(true);
    setCargandoResumen(true);
    api.get(`/priorizacion/municipio/${territorioId}`)
      .then(r => setResumenMunicipio(r.data.data))
      .catch(() => setResumenMunicipio(null))
      .finally(() => setCargandoResumen(false));
  };

  // ── FILTRO DE PROMOVIDOS POR PARTIDO ──
  const [filtroPartido, setFiltroPartido] = useState('todos');
  const promovidosFiltrados = useMemo(() => {
    if (filtroPartido === 'todos') return promovidosConPosicion;
    return promovidosConPosicion.filter((p) => p.partido === filtroPartido);
  }, [promovidosConPosicion, filtroPartido]);

  // ── COLOREADO ESTRATÉGICO — trae el Motor de Priorización directo al
  // mapa, para ver de un vistazo dónde pelear sin ir a otra pantalla ──
  const [modoColoreado, setModoColoreado] = useState('partido'); // 'partido' | 'prioridad'
  const [prioridadPorSeccion, setPrioridadPorSeccion] = useState({});

  useEffect(() => {
    if (modoColoreado !== 'prioridad') return;
    api.get('/priorizacion').then(r => {
      const mapa = {};
      r.data.data.forEach((f) => { mapa[f.seccion] = f; });
      setPrioridadPorSeccion(mapa);
    }).catch(() => setPrioridadPorSeccion({}));
  }, [modoColoreado]);

  const COLOR_PRIORIDAD = {
    critica: '#dc2626', recuperable: '#f97316', disputa: '#eab308', consolidar: '#10b981', perdida: '#475569',
  };
  const LABEL_PRIORIDAD = {
    critica: '🔴 Crítica', recuperable: '🟠 Recuperable', disputa: '🟡 Disputa', consolidar: '🟢 Consolidar', perdida: '⚫ Sin esperanza',
  };

  // ── COBERTURA DE ESTRUCTURA — qué secciones tienen coordinador
  // seccional asignado y cuáles están descubiertas ──
  const [mostrarCobertura, setMostrarCobertura] = useState(false);
  const [seccionesCubiertas, setSeccionesCubiertas] = useState(new Set());

  useEffect(() => {
    if (!mostrarCobertura) return;
    api.get('/estructura').then(r => {
      const cubiertas = new Set(
        r.data.data
          .filter((u) => u.rol === 'coord_seccional' && u.territorio_id)
          .map((u) => u.territorio_id)
      );
      setSeccionesCubiertas(cubiertas);
    }).catch(() => setSeccionesCubiertas(new Set()));
  }, [mostrarCobertura]);

  // ── ACTIVOS DE CAMPAÑA (bardas, espectaculares, mantas, representantes) ──
  const [activos, setActivos] = useState([]);
  const [capaActivos, setCapaActivos] = useState(false);

  useEffect(() => {
    api.get('/activos').then(r => setActivos(r.data.data.filter(a => a.lat && a.lng))).catch(() => setActivos([]));
  }, []);

  const ICONO_ACTIVO = { espectacular: '📺', barda: '🧱', manta: '🎏', ine_representante: '🗳️' };
  const iconoActivo = (tipo) => new L.DivIcon({
    className: '',
    html: `<div style="font-size:18px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">${ICONO_ACTIVO[tipo] || '📍'}</div>`,
    iconSize: [22, 22],
  });

  // ── INCIDENCIAS EN EL MAPA (ya se capturan con GPS, faltaba mostrarlas) ──
  const [incidencias, setIncidencias] = useState([]);
  const [capaIncidencias, setCapaIncidencias] = useState(false);

  useEffect(() => {
    api.get('/incidencias').then(r => setIncidencias(r.data.data.filter(i => i.lat && i.lng && i.estado === 'activa'))).catch(() => setIncidencias([]));
  }, []);

  const ICONO_URGENCIA = { urgente: '#dc2626', alta: '#f97316', media: '#eab308', baja: '#64748b' };
  const iconoIncidencia = (urgencia) => new L.DivIcon({
    className: '',
    html: `<div style="width:16px;height:16px;background:${ICONO_URGENCIA[urgencia]};border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.6)"></div>`,
    iconSize: [16, 16],
  });

  // ── LISTA DE CACERÍA GEOLOCALIZADA (día D: confirmados que no han votado) ──
  const [caceria, setCaceria] = useState([]);
  const [capaCaceria, setCapaCaceria] = useState(false);

  useEffect(() => {
    if (!capaCaceria) return;
    api.get('/dia-eleccion/caceria').then(r => setCaceria(r.data.data)).catch(() => setCaceria([]));
  }, [capaCaceria]);

  const caceriaConPosicion = useMemo(() => {
    return caceria.map((p) => {
      const centro = centroidesSeccion[p.seccion_numero];
      if (!centro) return null;
      const jitter = () => (Math.random() - 0.5) * 0.003;
      return { ...p, _lat: centro[0] + jitter(), _lng: centro[1] + jitter() };
    }).filter(Boolean);
  }, [caceria, centroidesSeccion]);

  const iconoCaceria = new L.DivIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:#dc2626;border:2px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(220,38,38,.3)"></div>`,
    iconSize: [12, 12],
  });

  // ── CONFIRMADOS (verde) — complemento de la cacería (rojo): los que
  // YA marcaron que votaron, para ver de un vistazo qué zonas van bien ──
  const [confirmados, setConfirmados] = useState([]);
  const [capaConfirmados, setCapaConfirmados] = useState(false);

  useEffect(() => {
    if (!capaConfirmados) return;
    api.get('/dia-eleccion/confirmados').then(r => setConfirmados(r.data.data)).catch(() => setConfirmados([]));
  }, [capaConfirmados]);

  const confirmadosConPosicion = useMemo(() => {
    return confirmados.map((p) => {
      const centro = centroidesSeccion[p.seccion_numero];
      if (!centro) return null;
      const jitter = () => (Math.random() - 0.5) * 0.003;
      return { ...p, _lat: centro[0] + jitter(), _lng: centro[1] + jitter() };
    }).filter(Boolean);
  }, [confirmados, centroidesSeccion]);

  const iconoConfirmado = new L.DivIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(34,197,94,.3)"></div>`,
    iconSize: [12, 12],
  });

  // ── UBICACIÓN DE CASILLAS — registrada por el equipo (no viene del
  // INE automáticamente), para ver cobertura real de representantes ──
  const [casillas, setCasillas] = useState([]);
  const [capaCasillas, setCapaCasillas] = useState(false);

  useEffect(() => {
    api.get('/dia-eleccion/casillas').then(r => setCasillas(r.data.data.filter(c => c.lat && c.lng))).catch(() => setCasillas([]));
  }, []);

  const iconoCasilla = (conRepresentante) => new L.DivIcon({
    className: '',
    html: `<div style="font-size:18px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">${conRepresentante ? '🗳️' : '❗'}</div>`,
    iconSize: [22, 22],
  });

  // ── ACTIVIDAD RECIENTE ("pulso") — secciones con/sin contactos en 7 días ──
  const [capaPulso, setCapaPulso] = useState(false);
  const [seccionesActivas7d, setSeccionesActivas7d] = useState(new Set());

  useEffect(() => {
    if (!capaPulso) return;
    api.get('/promovidos').then(r => {
      const haceUnaSemana = Date.now() - 7 * 86400000;
      const activas = new Set();
      r.data.data.forEach((p) => {
        const fechaRef = p.ultimo_contacto || p.creado_en;
        if (fechaRef && new Date(fechaRef).getTime() > haceUnaSemana && p.seccion_numero) {
          activas.add(p.seccion_numero);
        }
      });
      setSeccionesActivas7d(activas);
    }).catch(() => setSeccionesActivas7d(new Set()));
  }, [capaPulso]);

  // ── AGENDA EN EL MAPA — eventos con ubicación (recorridos, mítines) ──
  const [eventosAgenda, setEventosAgenda] = useState([]);
  const [capaAgenda, setCapaAgenda] = useState(false);

  useEffect(() => {
    api.get('/agenda').then(r => setEventosAgenda(r.data.data.filter(e => e.lat && e.lng))).catch(() => setEventosAgenda([]));
  }, []);

  const ICONO_EVENTO = { evento: '🎪', reunion: '👥', recorrido: '🚶', entrevista: '🎤' };
  const iconoEvento = (tipo) => new L.DivIcon({
    className: '',
    html: `<div style="font-size:18px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">${ICONO_EVENTO[tipo] || '📅'}</div>`,
    iconSize: [22, 22],
  });

  // ── AGREGAR PUNTO INTERACTIVO — clic en el botón, elige qué tipo de
  // punto quieres poner, luego clic en el mapa donde va, y se llena
  // un formulario corto que guarda directo en la capa correspondiente ──
  const [menuAgregarAbierto, setMenuAgregarAbierto] = useState(false);
  const [tipoColocando, setTipoColocando] = useState(null);
  const [puntoNuevo, setPuntoNuevo] = useState(null);
  const [posicionConfirmada, setPosicionConfirmada] = useState(false);
  const [formPunto, setFormPunto] = useState({});

  const TIPOS_PUNTO = [
    { id: 'barda', ic: '🧱', label: 'Barda' },
    { id: 'espectacular', ic: '📺', label: 'Espectacular' },
    { id: 'manta', ic: '🎏', label: 'Manta/Lona' },
    { id: 'ine_representante', ic: '🗳️', label: 'Representante INE' },
    { id: 'utilitario', ic: '👕', label: 'Material (playeras, etc)' },
    { id: 'evento', ic: '📅', label: 'Evento/Reunión' },
    { id: 'promovido', ic: '🤝', label: 'Promovido' },
    { id: 'casilla', ic: '🗳️', label: 'Ubicación de casilla' },
  ];

  const iniciarColocacion = (tipo) => {
    setTipoColocando(tipo);
    setMenuAgregarAbierto(false);
    setFormPunto({});
    // El pin arranca en el centro de lo que se está viendo ahora mismo
    // en el mapa — de ahí se arrastra a su lugar exacto, como en Google
    // Maps, en vez de tener que adivinar con un solo toque.
    const centro = mapRef.current?.getCenter();
    setPuntoNuevo(centro ? { lat: centro.lat, lng: centro.lng } : { lat: 19.32, lng: -98.24 });
  };

  const cancelarColocacion = () => {
    setTipoColocando(null);
    setPuntoNuevo(null);
    setPosicionConfirmada(false);
    setFormPunto({});
  };

  const guardarPunto = async () => {
    if (!puntoNuevo) return;
    try {
      if (tipoColocando === 'evento') {
        await api.post('/agenda', {
          titulo: formPunto.titulo, tipo: formPunto.tipoEvento || 'evento',
          fecha_inicio: formPunto.fecha_inicio, lugar: formPunto.lugar || '',
          lat: puntoNuevo.lat, lng: puntoNuevo.lng,
        });
        api.get('/agenda').then(r => setEventosAgenda(r.data.data.filter(e => e.lat && e.lng)));
      } else if (tipoColocando === 'casilla') {
        await api.post('/dia-eleccion/casillas', {
          seccion_numero: parseInt(formPunto.seccion_numero), numero: formPunto.numero_casilla || 'B',
          direccion: formPunto.direccion || '', lat: puntoNuevo.lat, lng: puntoNuevo.lng,
        });
        api.get('/dia-eleccion/casillas').then(r => setCasillas(r.data.data.filter(c => c.lat && c.lng)));
      } else if (tipoColocando === 'promovido') {
        await api.post('/promovidos', {
          nombre: formPunto.nombre, telefono: formPunto.telefono,
          lat: puntoNuevo.lat, lng: puntoNuevo.lng, consentimiento: true,
        });
        api.get('/promovidos').then(r => setPromovidos(r.data.data));
      } else {
        await api.post('/activos', {
          tipo: tipoColocando, direccion: formPunto.direccion || '',
          empresa: formPunto.empresa, costo: formPunto.costo ? parseFloat(formPunto.costo) : undefined,
          cantidad: formPunto.cantidad ? parseInt(formPunto.cantidad) : undefined,
          nombre_rep: formPunto.nombre_rep, telefono_rep: formPunto.telefono_rep,
          lat: puntoNuevo.lat, lng: puntoNuevo.lng,
        });
        api.get('/activos').then(r => setActivos(r.data.data.filter(a => a.lat && a.lng)));
      }
      cancelarColocacion();
    } catch (e) {
      alert('Error al guardar: ' + (e.response?.data?.error || e.message));
    }
  };


  // ── SECTORIZACIÓN: seleccionar varias secciones y asignarlas de un jalón ──
  const [modoSectorizacion, setModoSectorizacion] = useState(false);
  const [seccionesSeleccionadas, setSeccionesSeleccionadas] = useState(new Set());
  const [coordinadores, setCoordinadores] = useState([]);
  const [zonasAsignadas, setZonasAsignadas] = useState([]);

  useEffect(() => {
    if (!modoSectorizacion) return;
    api.get('/estructura').then(r => setCoordinadores(r.data.data.filter(u => u.rol !== 'promotor')));
    api.get('/zonas').then(r => setZonasAsignadas(r.data.data));
  }, [modoSectorizacion]);

  const alClickSeccion = (numero) => {
    if (!modoSectorizacion) { setSeccionActiva(numero); return; }
    setSeccionesSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      nuevo.has(numero) ? nuevo.delete(numero) : nuevo.add(numero);
      return nuevo;
    });
  };

  const asignarZona = async (usuarioId) => {
    if (seccionesSeleccionadas.size === 0) return;
    const { data } = await api.post('/zonas/asignar', { usuario_id: usuarioId, secciones: [...seccionesSeleccionadas] });
    alert(`✅ ${data.asignadas} secciones asignadas`);
    setSeccionesSeleccionadas(new Set());
    api.get('/zonas').then(r => setZonasAsignadas(r.data.data));
  };

  // Lookup rápido: sección -> quién ya la tiene asignada (para mostrarlo
  // ANTES de seleccionar, no después — antes esto no se veía en ningún lado)
  const seccionAsignadaA = useMemo(() => {
    const mapa = {};
    zonasAsignadas.forEach((z) => { mapa[z.seccion_numero] = z.usuario_nombre; });
    return mapa;
  }, [zonasAsignadas]);

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
      if (territorioTipo === 'distrito_local') return f.properties.distrito_local === territorioId;
      if (territorioTipo === 'distrito_federal') return f.properties.distrito_federal === territorioId;
      return true;
    });
    return { ...geoSecciones, features: filtradas };
  }, [geoSecciones, territorioTipo, territorioId]);

  const localidadesFiltradas = useMemo(() => {
    if (!territorioTipo || territorioTipo === 'estatal') return localidades;
    if (territorioTipo === 'distrito_local' || territorioTipo === 'distrito_federal') {
      // Las localidades no traen distrito directo — se filtran por las
      // secciones que sí quedaron dentro del distrito ya filtrado arriba.
      const seccionesValidas = new Set((seccionesFiltradas?.features || []).map(f => f.properties.seccion));
      return localidades.filter(l => seccionesValidas.has(l.seccion));
    }
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

    if (coloreadoActivo && modoColoreado === 'prioridad') {
      const prio = prioridadPorSeccion[num];
      if (prio) { colorRelleno = COLOR_PRIORIDAD[prio.prioridad] || colorRelleno; opacidad = 0.55; }
    } else if (coloreadoActivo && resultado?.ganador) {
      colorRelleno = PARTIDOS[resultado.ganador]?.color || colorRelleno;
      opacidad = 0.55;
    }

    // Pulso de actividad: verde si hubo contacto en los últimos 7 días, gris apagado si no
    if (capaPulso) {
      colorRelleno = seccionesActivas7d.has(num) ? '#22c55e' : '#3f3f46';
      opacidad = seccionesActivas7d.has(num) ? 0.5 : 0.6;
    }

    // Cobertura de estructura: borde punteado rojo si NO tiene coordinador
    // seccional asignado — para detectar huecos de un vistazo
    const sinCobertura = mostrarCobertura && !seccionesCubiertas.has(num);
    const seleccionadaParaZona = modoSectorizacion && seccionesSeleccionadas.has(num);
    const yaAsignada = modoSectorizacion && seccionAsignadaA[num];

    if (seleccionadaParaZona) {
      return { fillColor: '#a855f7', fillOpacity: 0.6, color: '#c084fc', weight: 3, opacity: 1 };
    }
    if (yaAsignada) {
      return { fillColor: '#0ea5e9', fillOpacity: 0.25, color: '#38bdf8', weight: 1.5, opacity: 0.8 };
    }

    return {
      fillColor: colorRelleno,
      fillOpacity: opacidad,
      color: esSeleccionada ? '#fbbf24' : sinCobertura ? '#ef4444' : '#ffffff',
      weight: esSeleccionada ? 3 : sinCobertura ? 2 : 1,
      opacity: esSeleccionada ? 1 : sinCobertura ? 0.9 : 0.4,
      dashArray: sinCobertura && !esSeleccionada ? '4,3' : null,
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
      click: () => alClickSeccion(feature.properties.seccion),
    });
    // Etiqueta: número de sección normalmente, o "quién ya la tiene" si
    // estamos en modo Sectorización — antes esto era invisible hasta
    // después de asignar, ahora se ve ANTES de seleccionar.
    const numero = feature.properties.seccion;
    const asignadaA = seccionAsignadaA[numero];
    const textoTooltip = modoSectorizacion
      ? (asignadaA ? `Sección ${String(numero).padStart(3, '0')} — ya es de ${asignadaA}` : `Sección ${String(numero).padStart(3, '0')} — sin asignar`)
      : String(numero).padStart(3, '0');
    capa.bindTooltip(textoTooltip, {
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
          <LayersControl.BaseLayer name="🌙 Oscuro (recomendado de noche)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked name="🗺️ Calles (con nombres)">
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
            key={`${coloreadoActivo}-${seccionActiva}-${territorioId}-${tipoEleccion}-${anio}-${modoColoreado}-${mostrarCobertura}-${Object.keys(prioridadPorSeccion).length}-${seccionesCubiertas.size}-${modoSectorizacion}-${seccionesSeleccionadas.size}-${capaPulso}-${seccionesActivas7d.size}-${zonasAsignadas.length}`}
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

        {/* Agenda con ubicación — recorridos, mítines, reuniones en el mapa */}
        {capaAgenda && eventosAgenda.map((e) => (
          <Marker key={e.id} position={[e.lat, e.lng]} icon={iconoEvento(e.tipo)}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 160 }}>
                <strong>{ICONO_EVENTO[e.tipo]} {e.titulo}</strong><br />
                📅 {new Date(e.fecha_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}<br />
                {e.lugar && <>📍 {e.lugar}<br /></>}
                {e.seccion_numero && <>🗳️ Sección {e.seccion_numero}<br /></>}
                {e.descripcion && <span style={{ color: '#888' }}>{e.descripcion}<br /></span>}
                <span style={{ fontSize: 10, color: e.realizado ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                  {e.realizado ? '✅ Ya realizado' : '⏳ Pendiente'}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Incidencias activas con GPS — urgencia por color */}
        {capaIncidencias && incidencias.map((inc) => (
          <Marker key={inc.id} position={[inc.lat, inc.lng]} icon={iconoIncidencia(inc.urgencia)}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{inc.urgencia === 'urgente' ? '🚨' : '⚠️'} {inc.tipo.replace('_', ' ')}</strong><br />
                {inc.descripcion}<br />
                <em style={{ fontSize: 10, color: '#888' }}>{inc.reportado_por_nombre}</em>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Lista de cacería geolocalizada — Base confirmados sin votar (Día D) */}
        {capaCaceria && caceriaConPosicion.map((p) => (
          <Marker key={p.id} position={[p._lat, p._lng]} icon={iconoCaceria}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>🎯 {p.nombre}</strong><br />
                Sección {p.seccion_numero}{p.telefono && ` · ${p.telefono}`}<br />
                <em style={{ fontSize: 10, color: '#888' }}>Confirmado, aún no ha votado</em>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Confirmados (verde) — ya votaron */}
        {capaConfirmados && confirmadosConPosicion.map((p) => (
          <Marker key={p.id} position={[p._lat, p._lng]} icon={iconoConfirmado}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>✅ {p.nombre}</strong><br />
                Sección {p.seccion_numero}<br />
                <em style={{ fontSize: 10, color: '#888' }}>Ya votó{p.hora_voto && ` · ${new Date(p.hora_voto).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</em>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Ubicación de casillas registradas */}
        {capaCasillas && casillas.map((c) => (
          <Marker key={c.id} position={[c.lat, c.lng]} icon={iconoCasilla(!!c.representante_id)}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>🗳️ Sección {c.seccion_numero} · Casilla {c.numero}</strong><br />
                {c.direccion && <>📍 {c.direccion}<br /></>}
                {c.representante_nombre
                  ? <>👤 {c.representante_nombre} {c.confirmado_asistencia ? '✅ Confirmado' : '⏳ Sin confirmar'}</>
                  : <span style={{ color: '#dc2626' }}>❗ Sin representante asignado</span>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Activos de campaña (bardas, espectaculares, mantas, representantes) */}
        {capaActivos && activos.map((a) => (
          <Marker key={a.id} position={[a.lat, a.lng]} icon={iconoActivo(a.tipo)}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{ICONO_ACTIVO[a.tipo]} {a.tipo === 'ine_representante' ? a.nombre_rep : a.direccion}</strong><br />
                {a.tipo !== 'ine_representante' && a.empresa && <>Empresa: {a.empresa}<br /></>}
                Estado: {a.estado}
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
        {capaPromovidos && !capaCalor && promovidosFiltrados.map((p) => (
          <Marker key={p.id} position={[p._lat, p._lng]} icon={iconoPromovido(p.clasificacion)}>
            <Popup>
              <strong>{p.nombre}</strong><br />
              {p.clasificacion === 'base' ? '✅ Base' : p.clasificacion === 'persuadible' ? '🎯 Persuadible' : '⛔ Adversario'}<br />
              {p.partido && `Partido: ${p.partido.toUpperCase()}`}
              {!p.lat && <><br /><em style={{ fontSize: 10, color: '#888' }}>Posición aproximada (sin dirección exacta registrada)</em></>}
            </Popup>
          </Marker>
        ))}

        <CapaCalor puntos={promovidosConPosicion.map(p => ({ lat: p._lat, lng: p._lng }))} activa={capaCalor} />
        {vueloDestino && <VueloCamara key={vueloDestino.key} centro={vueloDestino.centro} zoom={vueloDestino.zoom} />}
        <CapturarRefMapa mapRef={mapRef} />
        <CapturaClicMapa activo={!!tipoColocando} onClick={(lat, lng) => setPuntoNuevo({ lat, lng })} />

        {/* Pin del punto nuevo — ARRASTRABLE, como en Google Maps: se
            suelta y se va moviendo con el dedo hasta el lugar exacto
            (una calle, una esquina) antes de confirmar los datos. */}
        {puntoNuevo && (
          <Marker
            position={[puntoNuevo.lat, puntoNuevo.lng]}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                setPuntoNuevo({ lat, lng });
              },
            }}
            icon={new L.DivIcon({
              className: '',
              html: `<div style="font-size:30px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.6));cursor:grab">📍</div>`,
              iconSize: [34, 34], iconAnchor: [17, 34],
            })}
          />
        )}
      </MapContainer>

      {/* ── PANEL DE COLOREADO — solo en escritorio, en móvil vive dentro del menú ── */}
      {!esMobile && (
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
              <div className="text-sm font-bold text-white">Coloreado del mapa</div>
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

        {coloreadoActivo && (
          <div className="flex gap-1 p-3 pb-0">
            <button onClick={() => setModoColoreado('partido')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${modoColoreado === 'partido' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              🏛️ Por partido
            </button>
            <button onClick={() => setModoColoreado('prioridad')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${modoColoreado === 'prioridad' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              🎯 Por prioridad
            </button>
          </div>
        )}

        <div className="p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaLocalidades} onChange={e => setCapaLocalidades(e.target.checked)} />
            🏘️ Comunidades/Localidades
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaPromovidos} onChange={e => setCapaPromovidos(e.target.checked)} />
            🤝 Promovidos ({promovidosFiltrados.length})
          </label>
          {capaPromovidos && (
            <select value={filtroPartido} onChange={(e) => setFiltroPartido(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[10px]">
              <option value="todos">Todos los partidos</option>
              {Object.keys(PARTIDOS).map((p) => <option key={p} value={p}>Solo {p.toUpperCase()}</option>)}
              <option value="independiente">Solo independientes</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaCalor} onChange={e => setCapaCalor(e.target.checked)} />
            🔥 Mapa de calor (densidad de promovidos)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaActivos} onChange={e => setCapaActivos(e.target.checked)} />
            📺 Activos ({activos.length}: bardas, espectaculares...)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaAgenda} onChange={e => setCapaAgenda(e.target.checked)} />
            📅 Agenda con ubicación ({eventosAgenda.length})
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaIncidencias} onChange={e => setCapaIncidencias(e.target.checked)} />
            🚨 Incidencias activas ({incidencias.length})
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaCaceria} onChange={e => setCapaCaceria(e.target.checked)} />
            🎯 Lista de cacería (Día D)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaConfirmados} onChange={e => setCapaConfirmados(e.target.checked)} />
            ✅ Ya votaron (Día D)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={capaCasillas} onChange={e => setCapaCasillas(e.target.checked)} />
            🗳️ Ubicación de casillas ({casillas.length})
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer border-t border-slate-800 pt-2">
            <input type="checkbox" checked={capaPulso} onChange={e => setCapaPulso(e.target.checked)} />
            💓 Pulso de actividad (últimos 7 días)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer border-t border-slate-800 pt-2">
            <input type="checkbox" checked={mostrarCobertura} onChange={e => setMostrarCobertura(e.target.checked)} />
            🗂️ Cobertura de estructura (borde rojo = sin coordinador)
          </label>
        </div>

        {coloreadoActivo && modoColoreado === 'partido' && (
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

        {coloreadoActivo && modoColoreado === 'prioridad' && (
          <div className="p-3 pt-0 space-y-1.5">
            {Object.entries(LABEL_PRIORIDAD).map(([k, label]) => (
              <div key={k} className="flex items-center gap-1.5 text-[10px] text-slate-300 font-semibold">
                <span className="w-4 h-4 rounded-full flex-shrink-0 shadow" style={{ background: COLOR_PRIORIDAD[k] }} />
                {label}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Indicador de carga de manzanas — antes no había, daba la impresión de que no pasaba nada */}
      {seccionActiva && cargandoManzanas && (
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300">
          ⏳ Cargando manzanas de la sección...
        </div>
      )}

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

      {/* 📋 FICHA TÉCNICA DE LA SECCIÓN — aparece al tocar una sección en el mapa */}
      {seccionActiva && (
        <div className="absolute bottom-4 right-4 left-4 md:left-auto z-[1000] md:w-80 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl p-4 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-white text-sm">📋 Sección {String(seccionActiva).padStart(3, '0')}</span>
            <button onClick={() => setSeccionActiva(null)} className="text-slate-500 hover:text-white text-sm">✕</button>
          </div>

          {cargandoFicha && <div className="text-xs text-slate-500 py-4 text-center">⏳ Cargando datos reales...</div>}

          {!cargandoFicha && fichaTecnica && (
            <div className="space-y-3 text-xs">
              <div className="text-slate-400">{fichaTecnica.municipio} · Distrito Local {fichaTecnica.distrito_local} · Distrito Federal {fichaTecnica.distrito_federal}</div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">👥 Padrón electoral</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center"><div className="text-base font-black text-white">{fichaTecnica.lista_nominal?.toLocaleString() || 'N/D'}</div><div className="text-[8px] text-slate-500">Lista nominal</div></div>
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center"><div className="text-base font-black text-white">{fichaTecnica.casillas || 'N/D'}</div><div className="text-[8px] text-slate-500">Casillas</div></div>
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center"><div className="text-base font-black text-indigo-400">{fichaTecnica.participacion_pct != null ? `${fichaTecnica.participacion_pct}%` : 'N/D'}</div><div className="text-[8px] text-slate-500">Participación</div></div>
                </div>
              </div>

              {fichaTecnica.anio_historico ? (
                <div className="bg-slate-800/60 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Resultados históricos {fichaTecnica.anio_historico}</div>
                  <div className="space-y-1">
                    {Object.entries(fichaTecnica.votos_historicos).sort((a, b) => b[1] - a[1]).map(([p, v]) => {
                      const esTuPartido = p === fichaTecnica.partido_campana;
                      const esGanador = p === fichaTecnica.ganador_historico;
                      return (
                        <div key={p} className={`flex items-center justify-between rounded px-1.5 py-0.5 ${esTuPartido ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40' : ''}`}>
                          <span className={`font-bold ${esGanador ? 'text-amber-400' : esTuPartido ? 'text-indigo-300' : 'text-slate-400'}`}>
                            {esGanador && '👑 '}{esTuPartido && !esGanador && '⭐ '}{p.toUpperCase()}
                          </span>
                          <span className="text-white">{v.toLocaleString()} ({fichaTecnica.total_votos_historico ? Math.round(v / fichaTecnica.total_votos_historico * 100) : 0}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Comparador directo: tú vs quien gobierna ahora */}
                  {fichaTecnica.partido_campana && fichaTecnica.ganador_historico && fichaTecnica.partido_campana !== fichaTecnica.ganador_historico && (
                    <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-300">
                      Vas <strong className="text-red-400">
                        {((fichaTecnica.votos_historicos[fichaTecnica.ganador_historico] || 0) - (fichaTecnica.votos_historicos[fichaTecnica.partido_campana] || 0)).toLocaleString()} votos abajo
                      </strong> de {fichaTecnica.ganador_historico.toUpperCase()} (quien gobierna actualmente)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-amber-400 bg-amber-500/10 rounded-lg p-2">⚠️ Sin datos históricos cargados para este tipo de elección</div>
              )}

              <div className="bg-slate-800/60 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Tu avance en esta sección</div>
                <div className="grid grid-cols-3 gap-2 text-center mb-2">
                  <div><div className="text-emerald-400 font-black">{fichaTecnica.promovidos.base}</div><div className="text-[9px] text-slate-500">Base</div></div>
                  <div><div className="text-amber-400 font-black">{fichaTecnica.promovidos.persuadible}</div><div className="text-[9px] text-slate-500">Persuad.</div></div>
                  <div><div className="text-slate-400 font-black">{fichaTecnica.promovidos.adversario}</div><div className="text-[9px] text-slate-500">Advers.</div></div>
                </div>
                {fichaTecnica.deficit_votos > 0 ? (
                  <div className="text-[10px] text-slate-300 border-t border-slate-700 pt-2">
                    Faltan <strong className="text-white">{fichaTecnica.deficit_votos.toLocaleString()}</strong> votos para ganar ·
                    necesitas <strong className="text-white">{fichaTecnica.promovidos_necesarios.toLocaleString()}</strong> promovidos más
                    {fichaTecnica.ritmo_diario && <> (<strong className="text-amber-400">{fichaTecnica.ritmo_diario}/día</strong>)</>}
                  </div>
                ) : fichaTecnica.total_votos_historico > 0 ? (
                  <div className="text-[10px] text-emerald-400 border-t border-slate-700 pt-2">✅ Meta cubierta con tus promovidos actuales</div>
                ) : null}
              </div>

              {/* 🗣️ CONTEXTO HUMANO — para que el candidato llegue empático, no
                  solo con datos duros. Esto es lo que hace la diferencia entre
                  "pedir el voto" y "entender a la gente". */}
              {(Object.keys(fichaTecnica.necesidades_declaradas || {}).length > 0 || fichaTecnica.situaciones_graves?.length > 0) && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5 space-y-2">
                  <div className="text-[10px] font-bold text-amber-300 uppercase">🗣️ Antes de venir a esta sección</div>
                  {Object.keys(fichaTecnica.necesidades_declaradas || {}).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(fichaTecnica.necesidades_declaradas).sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                        <span key={n} className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">{n} ({c})</span>
                      ))}
                    </div>
                  )}
                  {fichaTecnica.situaciones_graves?.length > 0 && (
                    <div className="space-y-1">
                      {fichaTecnica.situaciones_graves.map((s, i) => (
                        <div key={i} className="text-[10px] text-slate-300 bg-slate-800/60 rounded p-1.5">
                          <strong className="text-amber-400">{s.nombre}:</strong> {s.situacion_grave}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ACCIONES RÁPIDAS — conectan directo con otros módulos ── */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => navigate(`/promovidos?seccion=${seccionActiva}`)}
                  className="py-2 rounded-lg bg-indigo-600/80 text-white text-[10px] font-bold">
                  👁️ Ver promovidos aquí
                </button>
                <button onClick={() => navigate(`/promovidos?seccion=${seccionActiva}&agregar=1`)}
                  className="py-2 rounded-lg bg-emerald-600/80 text-white text-[10px] font-bold">
                  + Agregar promovido aquí
                </button>
                <button onClick={() => navigate(`/agenda?seccion=${seccionActiva}`)}
                  className="py-2 rounded-lg bg-amber-600/80 text-white text-[10px] font-bold">
                  📅 Agendar evento aquí
                </button>
                <button onClick={() => navigate(`/incidencias?seccion=${seccionActiva}`)}
                  className="py-2 rounded-lg bg-red-600/80 text-white text-[10px] font-bold">
                  🚨 Reportar incidencia
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Buscador de sección — solo escritorio */}
      {!esMobile && (
      <div className="absolute top-4 left-4 z-[1000] w-64 space-y-2">
        <input
          type="number"
          placeholder="🔍 Buscar sección (ej: 12)..."
          value={buscarTexto}
          onChange={e => buscarSeccion(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        {buscarTexto && !centroidesSeccion[parseInt(buscarTexto)] && (
          <div className="text-[10px] text-amber-400 px-1">Esa sección no está en tu territorio</div>
        )}
        <button onClick={() => { setModoSectorizacion(v => !v); setSeccionesSeleccionadas(new Set()); }}
          className={`w-full px-4 py-2.5 rounded-xl backdrop-blur text-sm font-bold shadow-lg ${modoSectorizacion ? 'bg-purple-600 text-white' : 'bg-slate-900/90 text-slate-300'}`}>
          ✂️ {modoSectorizacion ? 'Salir de Sectorización' : 'Modo Sectorización'}
        </button>
      </div>
      )}

      {/* Ficha técnica de municipio — solo escritorio, en móvil vive en el menú */}
      {!esMobile && territorioTipo === 'municipio' && !modoSectorizacion && (
        <button onClick={abrirResumenMunicipio}
          className="absolute bottom-4 left-4 z-[1000] px-4 py-2.5 rounded-xl bg-indigo-600/90 backdrop-blur text-sm text-white font-bold shadow-lg">
          📊 Ficha técnica del municipio
        </button>
      )}

      {/* ☰ MENÚ MÓVIL — consolida todos los controles de arriba en un
          solo botón, para no amontonar paneles sueltos en pantalla chica */}
      {esMobile && (
        <>
          <button onClick={() => setMenuMobileAbierto(true)}
            className="absolute top-4 left-4 z-[1000] w-12 h-12 rounded-full bg-slate-900/95 backdrop-blur border border-slate-700 text-white text-xl shadow-lg flex items-center justify-center">
            ☰
          </button>

          {menuMobileAbierto && (
            <div className="absolute inset-0 z-[3000] bg-black/70 flex items-end" onClick={() => setMenuMobileAbierto(false)}>
              <div className="bg-slate-900 border-t border-slate-700 rounded-t-2xl w-full max-h-[80vh] overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-white">🗺️ Controles del mapa</span>
                  <button onClick={() => setMenuMobileAbierto(false)} className="text-slate-400 text-xl">✕</button>
                </div>

                <input
                  type="number"
                  placeholder="🔍 Buscar sección (ej: 12)..."
                  value={buscarTexto}
                  onChange={e => buscarSeccion(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500"
                />

                {territorioTipo === 'municipio' && (
                  <button onClick={() => { abrirResumenMunicipio(); setMenuMobileAbierto(false); }}
                    className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-sm text-white font-bold">
                    📊 Ficha técnica del municipio
                  </button>
                )}

                <button onClick={() => { setModoSectorizacion(v => !v); setSeccionesSeleccionadas(new Set()); setMenuMobileAbierto(false); }}
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold ${modoSectorizacion ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  ✂️ {modoSectorizacion ? 'Salir de Sectorización' : 'Modo Sectorización'}
                </button>

                <div className="border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">🎨 Coloreado del mapa</span>
                    <button onClick={() => setColoreadoActivo(v => !v)}
                      className={`w-10 h-5 rounded-full transition-colors ${coloreadoActivo ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${coloreadoActivo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  {coloreadoActivo && (
                    <div className="flex gap-1.5">
                      <button onClick={() => setModoColoreado('partido')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold ${modoColoreado === 'partido' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🏛️ Partido</button>
                      <button onClick={() => setModoColoreado('prioridad')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold ${modoColoreado === 'prioridad' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>🎯 Prioridad</button>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2.5">
                  <span className="text-xs font-bold text-white block mb-1">📍 Capas visibles</span>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaLocalidades} onChange={e => setCapaLocalidades(e.target.checked)} /> 🏘️ Comunidades/Localidades</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaPromovidos} onChange={e => setCapaPromovidos(e.target.checked)} /> 🤝 Promovidos ({promovidosFiltrados.length})</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaCalor} onChange={e => setCapaCalor(e.target.checked)} /> 🔥 Mapa de calor</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaActivos} onChange={e => setCapaActivos(e.target.checked)} /> 📺 Activos ({activos.length})</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaAgenda} onChange={e => setCapaAgenda(e.target.checked)} /> 📅 Agenda ({eventosAgenda.length})</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaIncidencias} onChange={e => setCapaIncidencias(e.target.checked)} /> 🚨 Incidencias ({incidencias.length})</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaCaceria} onChange={e => setCapaCaceria(e.target.checked)} /> 🎯 Cacería (Día D)</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaConfirmados} onChange={e => setCapaConfirmados(e.target.checked)} /> ✅ Ya votaron (Día D)</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaCasillas} onChange={e => setCapaCasillas(e.target.checked)} /> 🗳️ Ubicación de casillas</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={capaPulso} onChange={e => setCapaPulso(e.target.checked)} /> 💓 Pulso de actividad</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={mostrarCobertura} onChange={e => setMostrarCobertura(e.target.checked)} /> 🗂️ Cobertura de estructura</label>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Panel de control de sectorización — aparece solo en ese modo */}
      {modoSectorizacion && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto z-[1500] md:w-72 bg-slate-900/95 backdrop-blur border border-purple-700/40 rounded-2xl p-4 space-y-2.5">
          <div className="text-sm font-bold text-white">✂️ Modo Sectorización</div>
          <p className="text-[10px] text-slate-400">Toca varias secciones en el mapa para seleccionarlas, luego elige a quién se las asignas.</p>
          <div className="flex items-center gap-3 text-[9px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/60 border border-sky-400" /> Ya asignada</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> Seleccionada</span>
          </div>
          <div className="text-xs text-purple-300 font-bold">{seccionesSeleccionadas.size} secciones seleccionadas</div>
          {seccionesSeleccionadas.size > 0 && (
            <select onChange={(e) => e.target.value && asignarZona(e.target.value)} defaultValue=""
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs">
              <option value="" disabled>Asignar a...</option>
              {coordinadores.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.rol})</option>)}
            </select>
          )}
          {zonasAsignadas.length > 0 && (
            <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
              {zonasAsignadas.length} secciones ya tienen zona asignada en total
            </div>
          )}
        </div>
      )}

      {/* ➕ BOTÓN DE AGREGAR PUNTO INTERACTIVO — flotante, centro-inferior */}
      {!tipoColocando ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1600]">
          {menuAgregarAbierto && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl p-2 w-56 space-y-1 shadow-2xl">
              {TIPOS_PUNTO.map((t) => (
                <button key={t.id} onClick={() => iniciarColocacion(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                  <span className="text-lg">{t.ic}</span>
                  <span className="text-xs text-white font-bold">{t.label}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setMenuAgregarAbierto(v => !v)}
            className="w-14 h-14 rounded-full bg-indigo-600 text-white text-2xl font-bold shadow-2xl flex items-center justify-center hover:bg-indigo-500 transition">
            {menuAgregarAbierto ? '✕' : '➕'}
          </button>
        </div>
      ) : !posicionConfirmada ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1600] bg-indigo-600 text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3">
          <span className="text-sm font-bold">✋ Arrastra el pin 📍 hasta la calle o esquina exacta</span>
          <button onClick={() => setPosicionConfirmada(true)} className="text-xs bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 rounded-lg font-bold">✅ Confirmar aquí</button>
          <button onClick={cancelarColocacion} className="text-xs bg-indigo-800 px-2 py-1 rounded-lg font-bold">Cancelar</button>
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/70 z-[2500] flex items-end md:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-3">
            <h2 className="text-lg font-black text-white">
              {TIPOS_PUNTO.find(t => t.id === tipoColocando)?.ic} Nuevo {TIPOS_PUNTO.find(t => t.id === tipoColocando)?.label}
            </h2>
            <p className="text-[10px] text-slate-500">📍 {puntoNuevo.lat.toFixed(5)}, {puntoNuevo.lng.toFixed(5)}</p>

            {tipoColocando === 'evento' && (
              <>
                <input placeholder="Título del evento" value={formPunto.titulo || ''} onChange={(e) => setFormPunto({ ...formPunto, titulo: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <select value={formPunto.tipoEvento || 'evento'} onChange={(e) => setFormPunto({ ...formPunto, tipoEvento: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
                  <option value="evento">🎪 Evento</option>
                  <option value="reunion">👥 Reunión</option>
                  <option value="recorrido">🚶 Recorrido</option>
                  <option value="entrevista">🎤 Entrevista</option>
                </select>
                <input type="datetime-local" value={formPunto.fecha_inicio || ''} onChange={(e) => setFormPunto({ ...formPunto, fecha_inicio: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            {tipoColocando === 'promovido' && (
              <>
                <input placeholder="Nombre completo" value={formPunto.nombre || ''} onChange={(e) => setFormPunto({ ...formPunto, nombre: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Teléfono" value={formPunto.telefono || ''} onChange={(e) => setFormPunto({ ...formPunto, telefono: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            {tipoColocando === 'casilla' && (
              <>
                <input placeholder="Número de sección" type="number" value={formPunto.seccion_numero || ''} onChange={(e) => setFormPunto({ ...formPunto, seccion_numero: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Número de casilla (ej: B, C1)" value={formPunto.numero_casilla || ''} onChange={(e) => setFormPunto({ ...formPunto, numero_casilla: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Dirección/referencia" value={formPunto.direccion || ''} onChange={(e) => setFormPunto({ ...formPunto, direccion: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            {tipoColocando === 'ine_representante' && (
              <>
                <input placeholder="Nombre del representante" value={formPunto.nombre_rep || ''} onChange={(e) => setFormPunto({ ...formPunto, nombre_rep: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Teléfono" value={formPunto.telefono_rep || ''} onChange={(e) => setFormPunto({ ...formPunto, telefono_rep: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            {['barda', 'espectacular', 'manta'].includes(tipoColocando) && (
              <>
                <input placeholder="Dirección (ej: Calle Francisco I. Madero)" value={formPunto.direccion || ''} onChange={(e) => setFormPunto({ ...formPunto, direccion: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Empresa/proveedor" value={formPunto.empresa || ''} onChange={(e) => setFormPunto({ ...formPunto, empresa: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Costo" type="number" value={formPunto.costo || ''} onChange={(e) => setFormPunto({ ...formPunto, costo: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            {tipoColocando === 'utilitario' && (
              <>
                <input placeholder="¿Qué es? (ej: Playeras talla M)" value={formPunto.direccion || ''} onChange={(e) => setFormPunto({ ...formPunto, direccion: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
                <input placeholder="Cantidad entregada" type="number" value={formPunto.cantidad || ''} onChange={(e) => setFormPunto({ ...formPunto, cantidad: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={cancelarColocacion} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">Cancelar</button>
              <button onClick={guardarPunto} className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">✅ Guardar en el mapa</button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 RESUMEN COMPLETO DE MUNICIPIO — modal grande con todo el detalle */}
      {mostrarResumenMunicipio && (
        <div className="fixed inset-0 bg-black/70 z-[2500] flex items-center justify-center p-4" onClick={() => setMostrarResumenMunicipio(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            {cargandoResumen && <div className="text-center text-slate-500 py-10">⏳ Calculando ficha técnica...</div>}

            {!cargandoResumen && resumenMunicipio && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">{resumenMunicipio.municipio}</h2>
                    <p className="text-xs text-slate-500">{resumenMunicipio.total_secciones} secciones electorales</p>
                  </div>
                  <button onClick={() => setMostrarResumenMunicipio(false)} className="text-slate-500 hover:text-white">✕</button>
                </div>

                {resumenMunicipio.gobierna_actualmente && (
                  <div className="inline-block px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: `${PARTIDOS[resumenMunicipio.gobierna_actualmente]?.color}22`, color: PARTIDOS[resumenMunicipio.gobierna_actualmente]?.color }}>
                    👑 Gobierna: {resumenMunicipio.gobierna_actualmente.toUpperCase()}
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">👥 Población electoral</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/60 rounded-lg p-2.5"><div className="text-lg font-black text-white">{resumenMunicipio.poblacion_electoral.lista_nominal?.toLocaleString()}</div><div className="text-[9px] text-slate-500">Lista nominal</div></div>
                    <div className="bg-slate-800/60 rounded-lg p-2.5"><div className="text-lg font-black text-white">{resumenMunicipio.poblacion_electoral.votos_totales?.toLocaleString()}</div><div className="text-[9px] text-slate-500">Votos totales</div></div>
                    <div className="bg-slate-800/60 rounded-lg p-2.5"><div className="text-lg font-black text-white">{resumenMunicipio.poblacion_electoral.participacion_pct ?? 'N/D'}%</div><div className="text-[9px] text-slate-500">Participación</div></div>
                    <div className="bg-slate-800/60 rounded-lg p-2.5"><div className="text-lg font-black text-white">{resumenMunicipio.poblacion_electoral.casillas}</div><div className="text-[9px] text-slate-500">Casillas</div></div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">🚦 Semáforo electoral ({resumenMunicipio.total_secciones} secciones)</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-500/10 rounded-lg p-2"><div className="text-lg font-black text-emerald-400">{resumenMunicipio.semaforo.ganamos}</div><div className="text-[9px] text-slate-400">Ganamos</div></div>
                    <div className="bg-amber-500/10 rounded-lg p-2"><div className="text-lg font-black text-amber-400">{resumenMunicipio.semaforo.disputa}</div><div className="text-[9px] text-slate-400">Disputa</div></div>
                    <div className="bg-red-500/10 rounded-lg p-2"><div className="text-lg font-black text-red-400">{resumenMunicipio.semaforo.recuperar}</div><div className="text-[9px] text-slate-400">Recuperar</div></div>
                  </div>
                </div>

                {resumenMunicipio.resultados_historicos.anio ? (
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">📊 Resultados acumulados ({resumenMunicipio.resultados_historicos.anio})</div>
                    <div className="space-y-1.5">
                      {Object.entries(resumenMunicipio.resultados_historicos.votos_por_partido).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
                        <div key={p}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="font-bold text-slate-300">{p.toUpperCase()}</span>
                            <span className="text-slate-400">{v.toLocaleString()} ({Math.round(v / resumenMunicipio.resultados_historicos.total_votos * 100)}%)</span>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${v / resumenMunicipio.resultados_historicos.total_votos * 100}%`, background: PARTIDOS[p]?.color || '#64748b' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2">⚠️ Sin datos históricos para este tipo de elección</div>
                )}

                <div className="border-t border-slate-800 pt-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">🎯 Tu avance</div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-2">
                    <div><div className="text-emerald-400 font-black">{resumenMunicipio.promovidos.base}</div><div className="text-[9px] text-slate-500">Base</div></div>
                    <div><div className="text-amber-400 font-black">{resumenMunicipio.promovidos.persuadible}</div><div className="text-[9px] text-slate-500">Persuad.</div></div>
                    <div><div className="text-slate-400 font-black">{resumenMunicipio.promovidos.adversario}</div><div className="text-[9px] text-slate-500">Advers.</div></div>
                  </div>
                  <div className="text-xs text-slate-300 text-center">
                    <strong className="text-white">{resumenMunicipio.total_promovidos}</strong> promovidos ·
                    <strong className="text-indigo-400"> {resumenMunicipio.penetracion_pct}%</strong> de penetración sobre el padrón
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

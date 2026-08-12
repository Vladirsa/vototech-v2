import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * Calcula distancia entre 2 puntos (fórmula haversine) — se usa como
 * respaldo si la API de rutas no responde, para que la función
 * jamás se quede completamente rota por una falla externa.
 */
function distanciaHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Manda los puntos dibujados a mano a OpenRouteService — "pega" el
 * trazo libre a las calles reales más cercanas, y regresa la
 * geometría ya corregida junto con distancia y tiempo caminando
 * reales (no un estimado a ojo).
 *
 * Si la API falla por cualquier motivo (llave inválida, límite
 * diario alcanzado, puntos demasiado lejos uno del otro), se usa un
 * respaldo simple: la línea tal cual se dibujó, con distancia por
 * haversine y tiempo estimado a 4.5 km/h (paso caminando normal) —
 * así la función SIEMPRE entrega algo, nunca truena por completo.
 */
async function pegarRutaACalles(puntos) {
  const llave = process.env.ORS_API_KEY;
  const coordenadas = puntos.map((p) => [p.lng, p.lat]); // ORS pide [lng, lat], al revés de lo normal

  if (llave) {
    try {
      const respuesta = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
        method: 'POST',
        headers: { Authorization: llave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: coordenadas }),
      });
      if (respuesta.ok) {
        const datos = await respuesta.json();
        const feature = datos.features?.[0];
        if (feature) {
          return {
            geojson: feature.geometry, // ya viene en [lng, lat], formato GeoJSON estándar
            distancia_km: +(feature.properties.summary.distance / 1000).toFixed(2),
            tiempo_min: Math.round(feature.properties.summary.duration / 60),
            pegado_a_calles: true,
          };
        }
      }
    } catch (e) {
      console.error('Error llamando a OpenRouteService, se usa respaldo:', e.message);
    }
  }

  // ── Respaldo — línea recta entre los puntos tal como se dibujaron ──
  let distanciaTotal = 0;
  for (let i = 1; i < puntos.length; i++) {
    distanciaTotal += distanciaHaversineKm(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng);
  }
  return {
    geojson: { type: 'LineString', coordinates: coordenadas },
    distancia_km: +distanciaTotal.toFixed(2),
    tiempo_min: Math.round((distanciaTotal / 4.5) * 60), // 4.5 km/h, paso caminando normal
    pegado_a_calles: false,
  };
}

const esquemaCaminata = z.object({
  titulo: z.string().max(200).optional(),
  calle_inicio: z.string().max(200).optional(),
  calle_fin: z.string().max(200).optional(),
  calles_intermedias: z.string().max(500).optional(),
  puntos: z.array(z.object({ lat: z.number(), lng: z.number() })).min(2, 'Traza al menos 2 puntos en el mapa'),
  acompanantes: z.string().max(500).optional(),
  fecha: z.string().optional(),
  seccion_id: z.number().int().optional(),
  agregar_a_agenda: z.boolean().default(false),
});

/** GET /api/caminatas — todas las caminatas de la campaña, para pintarlas en el mapa como capa */
router.get('/', async (req, res) => {
  const resultado = await query(
    `SELECT c.*, u.nombre as creado_por_nombre FROM caminatas c
     LEFT JOIN usuarios u ON u.id = c.creado_por
     WHERE c.campana_id=$1 ORDER BY c.fecha DESC NULLS LAST, c.creado_en DESC`,
    [req.usuario.campana_id]
  );
  res.json({ ok: true, data: resultado.rows });
});

/** POST /api/caminatas — crea la caminata, pega la ruta a las calles reales, y opcionalmente la agrega a la Agenda */
router.post('/', async (req, res) => {
  const parseado = esquemaCaminata.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const d = parseado.data;

  const ruta = await pegarRutaACalles(d.puntos);

  let agendaId = null;
  if (d.agregar_a_agenda && d.fecha) {
    const eventoAgenda = await query(
      `INSERT INTO agenda (campana_id, titulo, tipo, fecha_inicio, descripcion, seccion_id, creado_por, duracion_minutos, lat, lng)
       VALUES ($1,$2,'caminata',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        req.usuario.campana_id,
        d.titulo || `Caminata${d.calle_inicio ? ` — ${d.calle_inicio}` : ''}`,
        d.fecha,
        [d.calles_intermedias, d.acompanantes ? `Acompañan: ${d.acompanantes}` : null].filter(Boolean).join(' · ') || null,
        d.seccion_id || null,
        req.usuario.sub,
        ruta.tiempo_min,
        d.puntos[0].lat,
        d.puntos[0].lng,
      ]
    );
    agendaId = eventoAgenda.rows[0].id;
  }

  const resultado = await query(
    `INSERT INTO caminatas (campana_id, titulo, calle_inicio, calle_fin, calles_intermedias, ruta_geojson, distancia_km, tiempo_estimado_min, acompanantes, fecha, seccion_id, agenda_id, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      req.usuario.campana_id, d.titulo || null, d.calle_inicio || null, d.calle_fin || null, d.calles_intermedias || null,
      JSON.stringify(ruta.geojson), ruta.distancia_km, ruta.tiempo_min, d.acompanantes || null,
      d.fecha || null, d.seccion_id || null, agendaId, req.usuario.sub,
    ]
  );

  res.status(201).json({
    ok: true,
    data: resultado.rows[0],
    pegado_a_calles: ruta.pegado_a_calles, // el frontend avisa si se usó el respaldo, para que el usuario lo sepa
  });
});

router.delete('/:id', async (req, res) => {
  const actual = await query('SELECT agenda_id FROM caminatas WHERE id=$1 AND campana_id=$2', [req.params.id, req.usuario.campana_id]);
  if (!actual.rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada' });
  if (actual.rows[0].agenda_id) {
    await query('DELETE FROM agenda WHERE id=$1', [actual.rows[0].agenda_id]);
  }
  await query('DELETE FROM caminatas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;

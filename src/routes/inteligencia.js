import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * GET /api/inteligencia/alertas
 *
 * El "Motor de Inteligencia Electoral" — en vez de que el candidato
 * tenga que interpretar veinte pantallas de números, este endpoint
 * cruza los datos que YA existen (promovidos, estructura, casillas,
 * histórico) y arma una lista de avisos en español llano, ordenados
 * por qué tan urgente es cada uno.
 *
 * Deliberadamente NO usa IA generativa aquí — son reglas fijas sobre
 * datos reales, para que la alerta sea siempre exacta y repetible,
 * no una interpretación que pueda variar o alucinar un número.
 */
router.get('/alertas', async (req, res) => {
  const campanaId = req.usuario.campana_id;
  const alertas = [];

  // ── 1. SECCIONES CON CAÍDA DE ACTIVIDAD ──
  // Compara promovidos de los últimos 7 días vs los 7 anteriores. Solo
  // avisa si ya había volumen antes (evita ruido con secciones que
  // apenas empiezan a trabajarse).
  const caidas = await query(
    `WITH actividad AS (
       SELECT s.numero,
         COUNT(*) FILTER (WHERE p.creado_en > now() - interval '7 days') as semana_actual,
         COUNT(*) FILTER (WHERE p.creado_en <= now() - interval '7 days' AND p.creado_en > now() - interval '14 days') as semana_anterior
       FROM promovidos p JOIN secciones s ON s.id = p.seccion_id
       WHERE p.campana_id = $1
       GROUP BY s.numero
     )
     SELECT * FROM actividad WHERE semana_anterior >= 3 AND semana_actual < semana_anterior * 0.6
     ORDER BY (semana_anterior - semana_actual) DESC LIMIT 3`,
    [campanaId]
  );
  caidas.rows.forEach((c) => {
    const caidaPct = Math.round((1 - c.semana_actual / c.semana_anterior) * 100);
    alertas.push({
      tipo: 'caida_actividad', severidad: caidaPct >= 60 ? 'alta' : 'media',
      icono: '📉',
      mensaje: `La sección ${c.numero} cayó ${caidaPct}% en actividad esta semana (${c.semana_actual} promovidos) comparado con la semana pasada (${c.semana_anterior}).`,
      modulo: 'promovidos', enlace: `/promovidos?seccion=${c.numero}`,
    });
  });

  // ── 2. COORDINADORES CON MUCHOS PROMOTORES INACTIVOS ──
  const coordsInactivos = await query(
    `SELECT u.nombre, u.puesto, u.rol, COUNT(h.id) as inactivos
     FROM usuarios u
     JOIN usuarios h ON h.parent_id = u.id AND h.rol='promotor' AND h.activo != false
     LEFT JOIN promovidos p ON p.registrado_por = h.id AND p.creado_en > now() - interval '7 days'
     WHERE u.campana_id=$1 AND u.activo != false AND p.id IS NULL
     GROUP BY u.id, u.nombre, u.puesto, u.rol
     HAVING COUNT(h.id) >= 3
     ORDER BY inactivos DESC LIMIT 3`,
    [campanaId]
  );
  coordsInactivos.rows.forEach((c) => {
    alertas.push({
      tipo: 'coordinador_inactivos', severidad: c.inactivos >= 6 ? 'alta' : 'media',
      icono: '😴',
      mensaje: `${c.puesto || c.nombre} tiene ${c.inactivos} promotores sin registrar un solo promovido en 7 días — vale la pena revisar qué está pasando en ese equipo.`,
      modulo: 'estructura', enlace: '/estructura',
    });
  });

  // ── 3. CASILLAS SIN REPRESENTANTE (Día D) ──
  const casillasRes = await query(
    `SELECT COUNT(*) as total FROM casillas WHERE campana_id=$1 AND representante_id IS NULL`,
    [campanaId]
  );
  const sinRepresentante = parseInt(casillasRes.rows[0].total);
  if (sinRepresentante > 0) {
    alertas.push({
      tipo: 'casillas_sin_representante', severidad: sinRepresentante >= 5 ? 'alta' : 'media',
      icono: '🗳️',
      mensaje: `Tienes ${sinRepresentante} casilla${sinRepresentante > 1 ? 's' : ''} sin representante asignado todavía — hay que resolverlo antes del día de la elección.`,
      modulo: 'dia-eleccion', enlace: '/dia-eleccion',
    });
  }

  // ── 4. "SI HOY FUERA LA ELECCIÓN" — con los datos históricos disponibles ──
  const campanaRes = await query('SELECT partido, tipo_eleccion, territorio_tipo, territorio_id, meta_votos FROM campanas WHERE id=$1', [campanaId]);
  const campana = campanaRes.rows[0];
  if (campana) {
    let filtroTerritorio = '';
    const paramsTerr = [];
    if (campana.territorio_tipo === 'municipio' && campana.territorio_id) {
      filtroTerritorio = `AND s.municipio_id = (SELECT id FROM municipios WHERE estado_id=${req.usuario.estado_id} AND clave_ine=$1)`;
      paramsTerr.push(campana.territorio_id);
    }
    const anioRes = await query('SELECT MAX(anio) as anio FROM resultados_historicos WHERE tipo_eleccion=$1', [campana.tipo_eleccion]);
    const anio = anioRes.rows[0]?.anio;
    if (anio) {
      const hist = await query(
        `SELECT r.partido, SUM(r.votos) as votos FROM resultados_historicos r
         JOIN secciones s ON s.id=r.seccion_id
         WHERE r.tipo_eleccion=$${paramsTerr.length + 1} AND r.anio=$${paramsTerr.length + 2} AND s.estado_id=${req.usuario.estado_id} ${filtroTerritorio}
         GROUP BY r.partido`,
        [...paramsTerr, campana.tipo_eleccion, anio]
      );
      const votosPorPartido = {};
      hist.rows.forEach((r) => { votosPorPartido[r.partido] = parseInt(r.votos); });
      const propios = votosPorPartido[campana.partido] || 0;
      const oponente = Object.entries(votosPorPartido).filter(([p]) => p !== campana.partido).sort((a, b) => b[1] - a[1])[0];
      if (oponente) {
        const diferencia = propios - oponente[1];
        alertas.push({
          tipo: 'proyeccion_actual', severidad: diferencia < 0 ? 'alta' : 'info',
          icono: diferencia < 0 ? '⚠️' : '✅',
          mensaje: diferencia < 0
            ? `Con los datos históricos más recientes, hoy perderías por aproximadamente ${Math.abs(diferencia).toLocaleString()} votos frente a ${oponente[0].toUpperCase()}.`
            : `Con los datos históricos más recientes, hoy irías arriba por aproximadamente ${diferencia.toLocaleString()} votos frente a ${oponente[0].toUpperCase()} — hay que sostenerlo, no relajarse.`,
          modulo: 'reportes', enlace: '/reportes',
        });
      }
    }
  }

  // Ordenar por severidad: alta primero, luego media, luego info
  const ORDEN_SEVERIDAD = { alta: 0, media: 1, info: 2 };
  alertas.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);

  res.json({ ok: true, data: alertas, total: alertas.length });
});

export default router;

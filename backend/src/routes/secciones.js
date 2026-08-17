import { Router } from 'express';
import { query } from '../db/pool.js';
import { requiereAuth } from '../middleware/auth.js';

const router = Router();
router.use(requiereAuth);

/**
 * 🆕 GET /api/secciones/:numero/info
 * Dado un número de sección, regresa su municipio, distrito local y
 * distrito federal — para que al capturar la sección en un
 * formulario, esos 3 campos se llenen solos, en vez de que la
 * persona los busque o los tenga que saber de memoria.
 */
router.get('/:numero/info', async (req, res) => {
  const numero = parseInt(req.params.numero);
  if (isNaN(numero)) return res.status(400).json({ ok: false, error: 'Número de sección inválido' });

  const resultado = await query(
    `SELECT s.numero, s.distrito_local, s.distrito_federal, s.lista_nominal,
            m.nombre as municipio, m.clave_ine as municipio_clave
     FROM secciones s
     JOIN municipios m ON m.id = s.municipio_id
     WHERE s.estado_id=$1 AND s.numero=$2`,
    [req.usuario.estado_id, numero]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Sección no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

export default router;

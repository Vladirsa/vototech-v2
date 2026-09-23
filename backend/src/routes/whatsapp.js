import { Router } from 'express';
import twilio from 'twilio';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requiereAuth, requiereRol } from '../middleware/auth.js';
import { esCampanaDemo } from '../lib/limiteIA.js';

const router = Router();
router.use(requiereAuth);

router.get('/config', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const resultado = await query('SELECT account_sid, numero_whatsapp FROM whatsapp_config WHERE campana_id=$1', [req.usuario.campana_id]);
  res.json({ ok: true, configurado: resultado.rows.length > 0, data: resultado.rows[0] || null });
});

const esquemaConfig = z.object({
  account_sid: z.string().min(5),
  auth_token: z.string().min(5),
  numero_whatsapp: z.string().min(8),
});

router.post('/config', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const parseado = esquemaConfig.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: 'Datos incompletos' });
  const d = parseado.data;

  await query(
    `INSERT INTO whatsapp_config (campana_id, account_sid, auth_token, numero_whatsapp)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (campana_id) DO UPDATE SET account_sid=$2, auth_token=$3, numero_whatsapp=$4, actualizado_en=now()`,
    [req.usuario.campana_id, d.account_sid, d.auth_token, d.numero_whatsapp]
  );
  res.json({ ok: true });
});

/**
 * POST /api/whatsapp/enviar
 * Envío masivo real (sin abrir pestañas, sin clics manuales) si la
 * campaña configuró Twilio. destinatarios = [{telefono, mensaje}]
 */
const esquemaEnvio = z.object({
  destinatarios: z.array(z.object({ telefono: z.string().max(20), mensaje: z.string().min(1).max(1000) })).min(1).max(200),
});

/**
 * 🔒 Antes CUALQUIER usuario (hasta un promotor o un celular robado)
 * podía mandar hasta 500 WhatsApps por petición, a CUALQUIER número y
 * con CUALQUIER texto, desde el número oficial de la campaña y a costa
 * de su cuenta de Twilio (fraude, spam, suplantación). Ahora:
 *  - solo candidato y jefe de campaña;
 *  - solo a teléfonos de ciudadanos registrados en SU campaña;
 *  - máximo 200 por envío y nunca desde la cuenta demo.
 * (Ninguna pantalla usa este envío hoy — el marketing actual va por
 * enlaces de WhatsApp — pero seguía abierto.)
 */
router.post('/enviar', requiereRol('candidato', 'jefe_campana'), async (req, res) => {
  const parseado = esquemaEnvio.safeParse(req.body);
  if (!parseado.success) return res.status(400).json({ ok: false, error: 'Destinatarios inválidos' });
  if (await esCampanaDemo(req.usuario.campana_id)) {
    return res.status(403).json({ ok: false, error: 'La cuenta demo no puede enviar mensajes reales.' });
  }
  const ultimos10 = (t) => String(t).replace(/\D/g, '').slice(-10);
  const telefonosCampana = await query(
    `SELECT DISTINCT right(regexp_replace(telefono, '\\D', '', 'g'), 10) AS tel FROM promovidos WHERE campana_id=$1 AND telefono IS NOT NULL`,
    [req.usuario.campana_id]
  );
  const permitidos = new Set(telefonosCampana.rows.map((r) => r.tel));
  const ajenos = parseado.data.destinatarios.filter((d) => !permitidos.has(ultimos10(d.telefono)));
  if (ajenos.length > 0) {
    return res.status(400).json({ ok: false, error: `${ajenos.length} número(s) no pertenecen a ciudadanos registrados en tu campaña. Solo se puede enviar a tus promovidos.` });
  }

  const config = await query('SELECT * FROM whatsapp_config WHERE campana_id=$1', [req.usuario.campana_id]);
  if (!config.rows[0]) {
    return res.status(400).json({ ok: false, error: 'WhatsApp Business API no configurado. Ve a Configuración > WhatsApp.' });
  }
  const { account_sid, auth_token, numero_whatsapp } = config.rows[0];
  const cliente = twilio(account_sid, auth_token);
  const from = numero_whatsapp.startsWith('whatsapp:') ? numero_whatsapp : `whatsapp:${numero_whatsapp}`;

  let enviados = 0, fallidos = 0;
  for (const d of parseado.data.destinatarios) {
    let tel = d.telefono.replace(/\D/g, '');
    if (tel.length === 10) tel = '52' + tel; // México por defecto
    try {
      await cliente.messages.create({ from, to: `whatsapp:+${tel}`, body: d.mensaje });
      enviados++;
    } catch (e) {
      fallidos++;
    }
    await new Promise((r) => setTimeout(r, 300)); // evitar rate limit de Twilio
  }

  res.json({ ok: true, enviados, fallidos, total: parseado.data.destinatarios.length });
});

export default router;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db/pool.js';
import { generarToken, requiereAuth, generarRefreshToken, validarYRotarRefreshToken, revocarRefreshToken } from '../middleware/auth.js';

const router = Router();

// ── VALIDACIÓN DE ENTRADA (zod) ──────────────────────────────
// Nunca confiar en lo que manda el cliente sin validar forma y tipo.
const esquemaRegistroCampana = z.object({
  nombre_candidato: z.string().min(3).max(200),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  partido: z.string().max(50).optional(),
  tipo_eleccion: z.enum(['ayuntamiento', 'dip_local', 'dip_federal', 'gobernador', 'pres_comunidad', 'senador']),
  estado_id: z.number().int(),
  subdominio: z.string().regex(/^[a-z0-9-]{3,63}$/, 'Solo minúsculas, números y guiones'),
  territorio_tipo: z.enum(['municipio', 'seccion', 'distrito_local', 'distrito_federal', 'estatal']).optional(),
  territorio_id: z.number().int().optional(),
  fecha_eleccion: z.string().optional(),
  codigo_acceso: z.string().min(3, 'Se requiere un código de acceso válido'),
  acepta_terminos: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar' }) }),
});

/**
 * POST /api/auth/registrar-campana
 * Crea una nueva campaña + su primer usuario (candidato/jefe de campaña).
 * Este es el punto de entrada para que un candidato nuevo se dé de alta
 * con su propio subdominio.
 */
router.post('/registrar-campana', async (req, res) => {
  const parseado = esquemaRegistroCampana.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const datos = parseado.data;

  try {
    // ── VALIDAR CÓDIGO DE ACCESO ────────────────────────────
    // Sin un código válido y sin usar todavía, no se puede registrar
    // ninguna campaña — esto es lo que evita que cualquiera en
    // internet cree cuentas sin que el dueño de la plataforma lo sepa.
    const codigoRow = await query(
      'SELECT * FROM codigos_acceso_campana WHERE codigo=$1 AND usado=false',
      [datos.codigo_acceso]
    );
    if (codigoRow.rows.length === 0) {
      return res.status(403).json({ ok: false, error: 'Código de acceso inválido o ya utilizado. Contacta a VotoTech para obtener uno.' });
    }

    // ¿El subdominio ya existe?
    const existente = await query('SELECT id FROM campanas WHERE subdominio = $1', [datos.subdominio]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ese subdominio ya está en uso, elige otro' });
    }

    // Crear la campaña — nace en estado "pendiente", activa=false,
    // hasta que el dueño de la plataforma la apruebe manualmente.
    // La aceptación de términos queda registrada con fecha/hora exacta,
    // como respaldo — ya se validó arriba que venga en true, aquí
    // solo se deja la constancia.
    const campana = await query(
      `INSERT INTO campanas (nombre_candidato, partido, tipo_eleccion, estado_id, subdominio, territorio_tipo, territorio_id, fecha_eleccion, activa, estado_aprobacion, terminos_aceptados_en, terminos_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, 'pendiente', now(), 'v1') RETURNING id, subdominio`,
      [datos.nombre_candidato, datos.partido || null, datos.tipo_eleccion, datos.estado_id, datos.subdominio,
       datos.territorio_tipo || null, datos.territorio_id || null, datos.fecha_eleccion || null]
    );
    const campanaId = campana.rows[0].id;

    // Marcar el código como usado, ligado a esta campaña
    await query(
      'UPDATE codigos_acceso_campana SET usado=true, usado_por_campana_id=$1, usado_en=now() WHERE id=$2',
      [campanaId, codigoRow.rows[0].id]
    );

    // Crear el primer usuario (candidato) con contraseña segura (bcrypt, nunca texto plano)
    const passwordHash = await bcrypt.hash(datos.password, 12);
    const usuario = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'candidato') RETURNING id, nombre, rol`,
      [campanaId, datos.nombre_candidato, datos.email, passwordHash]
    );

    // NO se da token de acceso todavía — la campaña queda pendiente
    // de aprobación manual. La persona tendrá que intentar iniciar
    // sesión después, y el sistema le dirá si ya fue aprobada.
    res.status(201).json({
      ok: true,
      pendiente: true,
      campana: { id: campanaId, subdominio: datos.subdominio },
      mensaje: 'Tu registro fue recibido correctamente. Un administrador de VotoTech revisará tu solicitud — te avisaremos cuando puedas entrar al sistema.',
    });
  } catch (e) {
    console.error('Error registrando campaña:', e);
    res.status(500).json({ ok: false, error: 'Error interno al crear la campaña' });
  }
});

/**
 * POST /api/auth/login
 * Inicio de sesión normal por email + contraseña, DENTRO de una campaña
 * específica (identificada por subdominio, que el frontend ya sabe por
 * la URL desde la que se está accediendo).
 */
const esquemaLogin = z.object({
  subdominio: z.string(),
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req, res) => {
  const parseado = esquemaLogin.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: 'Datos de login inválidos' });
  }
  const { subdominio, email, password } = parseado.data;

  try {
    const resultado = await query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.rol, u.activo,
              u.dos_factores_activo, u.dos_factores_secreto,
              c.id as campana_id, c.activa as campana_activa, c.estado_aprobacion,
              c.fecha_vencimiento, c.es_demo, c.estado_id
       FROM usuarios u
       JOIN campanas c ON c.id = u.campana_id
       WHERE c.subdominio = $1 AND u.email = $2`,
      [subdominio, email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    const usuario = resultado.rows[0];

    if (!usuario.activo) {
      return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada. Contacta al Jefe de Campaña.' });
    }

    // La campaña completa puede estar pendiente de aprobación o
    // rechazada por el dueño de la plataforma — sin importar que
    // el usuario/contraseña sean correctos, no se deja entrar.
    if (usuario.estado_aprobacion === 'pendiente') {
      return res.status(403).json({ ok: false, error: '⏳ Tu campaña todavía está en revisión. Te avisaremos por correo cuando puedas entrar.' });
    }
    if (usuario.estado_aprobacion === 'rechazada' || !usuario.campana_activa) {
      return res.status(403).json({ ok: false, error: 'Esta campaña no está activa. Contacta a VotoTech para más información.' });
    }

    // La demo nunca vence (para presentaciones); las campañas reales sí,
    // si no han renovado su mensualidad.
    if (!usuario.es_demo && usuario.fecha_vencimiento && new Date(usuario.fecha_vencimiento) < new Date()) {
      return res.status(403).json({ ok: false, error: '💳 Tu suscripción venció. Contacta a VotoTech para renovar tu servicio.' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    // Si tiene 2FA activo, la contraseña correcta NO es suficiente
    // todavía — se detiene aquí y se pide el código de la app
    // autenticadora en un segundo paso, con un token temporal de
    // solo 5 minutos que únicamente sirve para ese propósito.
    if (usuario.dos_factores_activo) {
      const tokenPreAuth = jwt.sign(
        { sub: usuario.id, tipo: 'pre_2fa' },
        process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION',
        { expiresIn: '5m' }
      );
      return res.json({ ok: true, requiere_2fa: true, token_pre_auth: tokenPreAuth });
    }

    await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);

    const token = generarToken(usuario);
    const refreshToken = await generarRefreshToken(usuario.id);
    res.json({
      ok: true,
      token,
      refresh_token: refreshToken,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
  } catch (e) {
    console.error('Error en login:', e);
    res.status(500).json({ ok: false, error: 'Error interno al iniciar sesión' });
  }
});

/**
 * POST /api/auth/registrar-con-codigo
 * Un promotor se registra usando un código de invitación — sin que
 * el Jefe de Campaña tenga que crear su cuenta manualmente uno por uno.
 */
const esquemaRegistroPromotor = z.object({
  codigo: z.string(),
  nombre: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  telefono: z.string().optional(),
});

/**
 * POST /api/auth/2fa/verificar-login
 * Segundo paso del login cuando 2FA está activo — toma el token
 * temporal de 5 minutos del primer paso + el código de 6 dígitos de
 * la app autenticadora, y si coincide, ahí sí entrega los tokens
 * reales de sesión.
 */
router.post('/2fa/verificar-login', async (req, res) => {
  const { token_pre_auth, codigo } = req.body;
  if (!token_pre_auth || !codigo) return res.status(400).json({ ok: false, error: 'Faltan datos' });

  let payload;
  try {
    payload = jwt.verify(token_pre_auth, process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION');
    if (payload.tipo !== 'pre_2fa') throw new Error('tipo incorrecto');
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Sesión de verificación expirada, inicia sesión de nuevo' });
  }

  const resultado = await query(
    `SELECT u.*, c.estado_id FROM usuarios u JOIN campanas c ON c.id=u.campana_id WHERE u.id=$1`,
    [payload.sub]
  );
  const usuario = resultado.rows[0];
  if (!usuario || !usuario.dos_factores_activo) return res.status(401).json({ ok: false, error: 'No válido' });

  const codigoValido = speakeasy.totp.verify({ secret: usuario.dos_factores_secreto, encoding: 'base32', token: codigo, window: 1 });
  if (!codigoValido) return res.status(401).json({ ok: false, error: 'Código incorrecto. Revisa tu app autenticadora.' });

  await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);
  const token = generarToken(usuario);
  const refreshToken = await generarRefreshToken(usuario.id);
  res.json({ ok: true, token, refresh_token: refreshToken, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
});

/**
 * POST /api/auth/2fa/generar-secreto
 * Primer paso para ACTIVAR 2FA — genera un secreto nuevo y un código
 * QR para escanear con Google Authenticator, Authy, etc. Todavía no
 * se activa: eso pasa hasta que la persona confirme con un código
 * real en /2fa/activar (así no se puede quedar bloqueada por un
 * error al escanear el QR).
 */
router.post('/2fa/generar-secreto', requiereAuth, async (req, res) => {
  const usuarioRes = await query('SELECT email FROM usuarios WHERE id=$1', [req.usuario.sub]);
  const secreto = speakeasy.generateSecret({ length: 20, name: `VotoTech (${usuarioRes.rows[0].email})`, issuer: 'VotoTech' });
  const qrDataUrl = await QRCode.toDataURL(secreto.otpauth_url);

  // Se guarda como "pendiente" en una columna temporal — no se activa
  // hasta confirmar con un código real.
  await query('UPDATE usuarios SET dos_factores_secreto=$1 WHERE id=$2', [secreto.base32, req.usuario.sub]);

  res.json({ ok: true, data: { qr: qrDataUrl, secreto_manual: secreto.base32 } });
});

/**
 * POST /api/auth/2fa/activar
 * Confirma el código generado por la app autenticadora y, si es
 * correcto, ACTIVA 2FA de verdad.
 */
router.post('/2fa/activar', requiereAuth, async (req, res) => {
  const { codigo } = req.body;
  const usuarioRes = await query('SELECT dos_factores_secreto FROM usuarios WHERE id=$1', [req.usuario.sub]);
  const secreto = usuarioRes.rows[0]?.dos_factores_secreto;
  if (!secreto) return res.status(400).json({ ok: false, error: 'Primero genera el código QR' });

  const valido = speakeasy.totp.verify({ secret: secreto, encoding: 'base32', token: codigo, window: 1 });
  if (!valido) return res.status(400).json({ ok: false, error: 'Código incorrecto. Verifica la hora de tu celular y vuelve a intentar.' });

  await query('UPDATE usuarios SET dos_factores_activo=true WHERE id=$1', [req.usuario.sub]);
  res.json({ ok: true, mensaje: '✅ Verificación en dos pasos activada' });
});

/**
 * POST /api/auth/2fa/desactivar
 * Requiere la contraseña actual — no basta con estar dentro de la
 * sesión, porque si alguien roba una sesión activa no debe poder
 * quitar la segunda capa de seguridad tan fácilmente.
 */
router.post('/2fa/desactivar', requiereAuth, async (req, res) => {
  const { password } = req.body;
  const usuarioRes = await query('SELECT password_hash FROM usuarios WHERE id=$1', [req.usuario.sub]);
  const passwordOk = await bcrypt.compare(password || '', usuarioRes.rows[0].password_hash);
  if (!passwordOk) return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });

  await query('UPDATE usuarios SET dos_factores_activo=false, dos_factores_secreto=NULL WHERE id=$1', [req.usuario.sub]);
  res.json({ ok: true, mensaje: 'Verificación en dos pasos desactivada' });
});

router.post('/registrar-con-codigo', async (req, res) => {
  const parseado = esquemaRegistroPromotor.safeParse(req.body);
  if (!parseado.success) {
    return res.status(400).json({ ok: false, error: parseado.error.errors[0].message });
  }
  const datos = parseado.data;

  try {
    const codigoRow = await query(
      `SELECT * FROM codigos_invitacion
       WHERE codigo = $1 AND activo = true
         AND (expira_en IS NULL OR expira_en > now())
         AND usos_actuales < usos_maximos`,
      [datos.codigo]
    );

    if (codigoRow.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Código de invitación inválido, expirado o ya usado' });
    }
    const invitacion = codigoRow.rows[0];

    const passwordHash = await bcrypt.hash(datos.password, 12);
    const nuevoUsuario = await query(
      `INSERT INTO usuarios (campana_id, nombre, email, telefono, password_hash, rol, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nombre, rol`,
      [invitacion.campana_id, datos.nombre, datos.email, datos.telefono || null,
       passwordHash, invitacion.rol_asignado, invitacion.creado_por]
    );

    await query(
      'UPDATE codigos_invitacion SET usos_actuales = usos_actuales + 1 WHERE id = $1',
      [invitacion.id]
    );

    const campanaDatos = await query('SELECT estado_id FROM campanas WHERE id=$1', [invitacion.campana_id]);

    const token = generarToken({
      id: nuevoUsuario.rows[0].id,
      campana_id: invitacion.campana_id,
      rol: invitacion.rol_asignado,
      nombre: datos.nombre,
      estado_id: campanaDatos.rows[0]?.estado_id,
    });

    const refreshToken = await generarRefreshToken(nuevoUsuario.rows[0].id);
    res.status(201).json({
      ok: true, token, refresh_token: refreshToken,
      // CRÍTICO: sin esto, el frontend no tiene el id real de la
      // persona — cualquier función que dependa de saber quién eres
      // (el chat armando conversaciones directas, por ejemplo) se
      // rompe silenciosamente. Este bug exacto causaba "canal
      // inválido" al platicar con un promotor recién registrado así.
      usuario: { id: nuevoUsuario.rows[0].id, nombre: datos.nombre, rol: invitacion.rol_asignado },
      mensaje: '¡Bienvenido al equipo! Tu cuenta fue creada.',
    });
  } catch (e) {
    console.error('Error registrando con código:', e);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

/**
 * GET /api/auth/mi-campana
 * El territorio y tipo de elección REALES de la campaña del usuario
 * logueado — antes el mapa traía un municipio fijo en el código sin
 * importar la campaña de quién entrara, esto lo corrige.
 */
router.get('/mi-campana', requiereAuth, async (req, res) => {
  const resultado = await query(
    `SELECT nombre_candidato, partido, tipo_eleccion, territorio_tipo, territorio_id, fecha_eleccion, fecha_vencimiento, es_demo
     FROM campanas WHERE id=$1`,
    [req.usuario.campana_id]
  );
  if (!resultado.rows[0]) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
  res.json({ ok: true, data: resultado.rows[0] });
});

/**
 * POST /api/auth/refrescar
 * Cambia un refresh token vigente por un token de acceso NUEVO
 * (30 min) + un refresh token NUEVO (rotación) — así la sesión se
 * mantiene viva sin que la persona tenga que volver a poner su
 * contraseña cada 30 minutos, pero cada token de acceso individual
 * dura poco si alguien lo llegara a robar.
 */
router.post('/refrescar', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ ok: false, error: 'Falta el refresh token' });

  const resultado = await validarYRotarRefreshToken(refresh_token);
  if (!resultado) {
    return res.status(401).json({ ok: false, error: 'Sesión expirada o inválida, inicia sesión de nuevo' });
  }

  const nuevoToken = generarToken(resultado.usuario);
  res.json({ ok: true, token: nuevoToken, refresh_token: resultado.refresh_token });
});

/**
 * POST /api/auth/cerrar-sesion
 * Revoca el refresh token actual — a partir de aquí ya no se puede
 * usar para renovar, aunque todavía no haya expirado por sí solo.
 */
router.post('/cerrar-sesion', async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) await revocarRefreshToken(refresh_token);
  res.json({ ok: true });
});

const TIPO_ELECCION_LABEL = {
  ayuntamiento: 'Presidente Municipal', pres_comunidad: 'Presidente de Comunidad',
  dip_local: 'Diputado Local', dip_federal: 'Diputado Federal', gobernador: 'Gobernador', senador: 'Senador',
};

/**
 * GET /api/auth/mi-contrato-pdf
 * Genera el Contrato de Prestación de Servicios personalizado con
 * los datos reales de la campaña — mismo texto base que el borrador
 * revisado (Cláusulas Primera a Décima Primera), con los datos del
 * candidato y la fecha de aceptación ya insertados donde antes había
 * llaves {{...}}.
 *
 * AVISO: esto es un borrador generado automáticamente, no un
 * documento legal validado por un abogado — se le recuerda al
 * usuario en la propia pantalla, no solo aquí.
 */
router.get('/mi-contrato-pdf', requiereAuth, async (req, res) => {
  const campanaRes = await query(
    'SELECT nombre_candidato, tipo_eleccion, fecha_eleccion, terminos_aceptados_en FROM campanas WHERE id=$1',
    [req.usuario.campana_id]
  );
  const c = campanaRes.rows[0];
  if (!c) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });

  const doc = new PDFDocument({ margin: 55 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=contrato_vototech.pdf');
  doc.pipe(res);

  const titulo = (t) => { doc.moveDown(0.8); doc.fontSize(11).fillColor('#1e1b4b').font('Helvetica-Bold').text(t); doc.moveDown(0.2); doc.fontSize(9.5).fillColor('#334155').font('Helvetica'); };
  const parrafo = (t) => { doc.text(t, { align: 'justify' }); doc.moveDown(0.4); };
  const bullet = (t) => { doc.text(`•  ${t}`, { align: 'justify', indent: 10 }); doc.moveDown(0.2); };

  doc.fontSize(16).fillColor('#1e1b4b').font('Helvetica-Bold').text('CONTRATO DE PRESTACIÓN DE SERVICIOS', { align: 'center' });
  doc.fontSize(11).fillColor('#64748b').font('Helvetica').text('PLATAFORMA TECNOLÓGICA VOTOTECH', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(9.5).fillColor('#334155');
  parrafo(`Contrato de prestación de servicios que celebran, por una parte VotoTech (en adelante "EL PRESTADOR"), y por la otra ${c.nombre_candidato}, en su calidad de candidato a ${TIPO_ELECCION_LABEL[c.tipo_eleccion] || c.tipo_eleccion} (en adelante "EL CLIENTE"), al tenor de las siguientes declaraciones y cláusulas:`);

  titulo('DECLARACIONES');
  parrafo('I. EL PRESTADOR declara ser una plataforma tecnológica de gestión de campañas electorales, con capacidad técnica para prestar el servicio objeto de este contrato.');
  parrafo(`II. EL CLIENTE declara ser candidato o representante legalmente facultado de la campaña "${c.nombre_candidato}", para el proceso de ${TIPO_ELECCION_LABEL[c.tipo_eleccion] || c.tipo_eleccion}${c.fecha_eleccion ? `, con fecha de jornada electoral ${new Date(c.fecha_eleccion).toLocaleDateString('es-MX')}` : ''}, y contar con capacidad legal para obligarse en los términos de este contrato.`);
  parrafo('III. Ambas partes declaran conocer y sujetarse a la Ley General de Instituciones y Procedimientos Electorales, la legislación electoral local aplicable, y la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.');

  titulo('CLÁUSULAS');
  titulo('PRIMERA. OBJETO.');
  parrafo('EL PRESTADOR otorga a EL CLIENTE una licencia de uso, no exclusiva e intransferible, de la plataforma VotoTech, conforme al plan contratado, para su uso exclusivo en la operación interna de la campaña señalada en las Declaraciones.');

  titulo('SEGUNDA. VIGENCIA.');
  parrafo('El presente contrato tendrá vigencia conforme al plan y periodo de suscripción contratado por EL CLIENTE, renovable por periodos iguales previo acuerdo de las partes.');

  titulo('TERCERA. CONTRAPRESTACIÓN.');
  parrafo('EL CLIENTE se obliga a cubrir la contraprestación correspondiente al plan contratado, en los términos, monto y modalidad de pago acordados por separado. La falta de pago oportuno faculta a EL PRESTADOR a suspender el acceso al servicio sin responsabilidad alguna.');

  titulo('CUARTA. OBLIGACIONES DE EL CLIENTE.');
  parrafo('EL CLIENTE se obliga expresamente a:');
  bullet('Utilizar la plataforma exclusivamente para fines lícitos de organización interna de campaña, conforme a la legislación electoral aplicable.');
  bullet('No importar, cargar ni distribuir el padrón electoral oficial del INE dentro de la plataforma.');
  bullet('No utilizar la plataforma para actos de compra o coacción del voto, ni para verificar o inferir por quién votó cualquier persona.');
  bullet('Contar con su propio Aviso de Privacidad frente a los ciudadanos cuyos datos capture, y obtener el consentimiento correspondiente conforme a la LFPDPPP.');
  bullet('Cumplir con sus propias obligaciones de fiscalización, registro de gastos, y reporte ante el INE/OPLE.');
  bullet('Ser el único responsable del uso que su equipo de campaña dé a la plataforma.');

  doc.addPage();
  doc.fontSize(9.5).fillColor('#334155');
  titulo('QUINTA. LIMITACIÓN DE RESPONSABILIDAD.');
  parrafo('EL PRESTADOR no será responsable, en ningún caso, por:');
  bullet('El uso indebido, ilícito o contrario a la legislación electoral que EL CLIENTE o su equipo den a la plataforma.');
  bullet('Interrupciones del servicio derivadas de fallas de proveedores de infraestructura tecnológica ajenos a EL PRESTADOR.');
  bullet('Decisiones estratégicas o de campaña tomadas con base en la información, reportes o proyecciones estadísticas generadas por la plataforma, las cuales constituyen estimaciones y no garantías de resultado.');
  bullet('Pérdida, alteración o divulgación de información derivada de negligencia de EL CLIENTE en el resguardo de sus credenciales de acceso.');
  bullet('Sanciones, multas o procedimientos derivados de infracciones a la legislación electoral cometidas por EL CLIENTE en el uso de la plataforma.');
  parrafo('La responsabilidad total y máxima de EL PRESTADOR no excederá el monto efectivamente pagado por EL CLIENTE durante los tres meses previos al hecho que la origine.');

  titulo('SEXTA. CAPACIDAD TÉCNICA Y DISPONIBILIDAD.');
  parrafo('EL PRESTADOR hará su mejor esfuerzo técnico para mantener el servicio disponible, sin garantizar disponibilidad ininterrumpida. EL CLIENTE reconoce que la plataforma opera bajo límites técnicos razonables de uso concurrente conforme al plan contratado.');

  titulo('SÉPTIMA. PROTECCIÓN DE DATOS Y CONFIDENCIALIDAD.');
  parrafo('EL PRESTADOR actuará como Encargado del tratamiento de los datos personales que EL CLIENTE capture en la plataforma, conforme a la LFPDPPP, siendo EL CLIENTE el Responsable de dichos datos frente a los titulares.');

  titulo('OCTAVA. PROPIEDAD DE LA INFORMACIÓN.');
  parrafo('EL CLIENTE conserva la propiedad de los datos que captura en la plataforma. EL PRESTADOR conserva la propiedad del software, código, diseño y marca VotoTech.');

  titulo('NOVENA. CASO FORTUITO O FUERZA MAYOR.');
  parrafo('Ninguna de las partes será responsable por incumplimientos derivados de caso fortuito o fuerza mayor.');

  titulo('DÉCIMA. TERMINACIÓN.');
  parrafo('Este contrato podrá darse por terminado por cualquiera de las partes con aviso previo, o de forma inmediata por EL PRESTADOR en caso de incumplimiento grave de EL CLIENTE a las obligaciones de la Cláusula Cuarta.');

  titulo('DÉCIMA PRIMERA. JURISDICCIÓN.');
  parrafo('Para la interpretación y cumplimiento de este contrato, las partes se someten a las leyes federales de los Estados Unidos Mexicanos, renunciando a cualquier otro fuero que pudiera corresponderles.');

  doc.moveDown(1);
  doc.fontSize(9).fillColor('#1e1b4b').font('Helvetica-Bold').text(`Términos y Condiciones y Aviso de Privacidad aceptados electrónicamente el: ${c.terminos_aceptados_en ? new Date(c.terminos_aceptados_en).toLocaleString('es-MX') : 'No registrado'}`);
  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#94a3b8').font('Helvetica').text('Este documento es un borrador generado automáticamente y no sustituye la revisión de un abogado. Para uso formal, se recomienda validación legal previa.', { align: 'center' });

  doc.end();
});

export default router;

import 'dotenv/config';
import 'express-async-errors'; // ⚠️ CRÍTICO: sin esto, un error en cualquier
// ruta "async" (casi todas) se escapa del manejo de errores de Express y
// puede tumbar el proceso completo del servidor — como pasó al borrar una
// campaña con datos relacionados. Esto lo arregla para TODAS las rutas
// de una vez, no una por una.
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { setIo } from './io.js';
import { query } from './db/pool.js';
import { requiereAuth } from './middleware/auth.js';
import { requiereModulo, requiereModuloMarketing } from './middleware/permisos.js';
import { correrSeed, cargarHistorico2021 } from '../seed.js';

import authRoutes from './routes/auth.js';
import geoRoutes from './routes/geo.js';
import resultadosRoutes from './routes/resultados.js';
import promovidosRoutes from './routes/promovidos.js';
import respaldosRoutes from './routes/respaldos.js';
import priorizacionRoutes from './routes/priorizacion.js';
import estructuraRoutes from './routes/estructura.js';
import reportesRoutes from './routes/reportes.js';
import agendaRoutes from './routes/agenda.js';
import codigosRoutes from './routes/codigos.js';
import diaEleccionRoutes from './routes/dia-eleccion.js';
import incidenciasRoutes from './routes/incidencias.js';
import finanzasRoutes from './routes/finanzas.js';
import iaRoutes from './routes/ia.js';
import whatsappRoutes from './routes/whatsapp.js';
import casasRoutes from './routes/casas.js';
import fotosRoutes from './routes/fotos.js';
import exportarRoutes from './routes/exportar.js';
import activosRoutes from './routes/activos.js';
import zonasRoutes from './routes/zonas.js';
import dashboardRoutes from './routes/dashboard.js';
import promovidosAnaliticaRoutes from './routes/promovidos-analitica.js';
import publicoRoutes from './routes/publico.js';
import marketingRoutes from './routes/marketing.js';
import encuestasRoutes from './routes/encuestas.js';
import juridicoRoutes from './routes/juridico.js';
import chatRoutes from './routes/chat.js';
import pushRoutes, { enviarPush } from './routes/push.js';
import { respaldarTodasLasCampanas } from './lib/respaldoAutomatico.js';
import inteligenciaRoutes from './routes/inteligencia.js';
import documentosRoutes from './routes/documentos.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ── SEGURIDAD ANTI-HACKEO ────────────────────────────────────
// helmet agrega ~15 headers de seguridad automáticamente (protección
// contra XSS, clickjacking, sniffing de tipo MIME, etc.) — esto es
// exactamente lo que NO teníamos control fino en el hosting compartido.
app.use(helmet());
// Sirve la página de ventas (public-marketing) en la raíz del sitio
app.use(express.static(require('path').join(__dirname, '../public-marketing')));
// CORS: solo se permite acceso desde los dominios de VotoTech
// (los subdominios de cada candidato + dominios propios que registren)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // peticiones sin origin (Postman, apps móviles)
    const permitido =
      origin.endsWith('.vototech.mx') ||
      origin.endsWith('.vercel.app') ||          // dominio temporal de Vercel (mientras no haya dominio propio)
      origin === 'http://localhost:5173' || // desarrollo local
      process.env.DOMINIOS_PERMITIDOS?.split(',').includes(origin);
    callback(permitido ? null : new Error('Origen no permitido por CORS'), permitido);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

// Rate limiting general: máximo 300 peticiones por IP cada 15 min.
// Esto es justo lo que nos hacía falta contra abuso/ataques de fuerza bruta,
// y no se podía controlar bien en hosting compartido.
// 300/15min (20/min) era demasiado bajo: protege contra ataques, pero
// en el día de la elección varios representantes pueden compartir IP
// (misma red WiFi, o el mismo operador celular con IP compartida —
// muy común en México) y se bloqueaban entre ellos sin culpa. Subido
// a un nivel que sigue frenando abuso real pero no golpea uso legítimo.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});
app.use('/api/', limiteGeneral);

// El día de la elección necesita su propio límite, más alto todavía,
// porque ahí es exactamente cuando MÁS gente concurrente comparte red
// y MÁS importa que nadie se quede bloqueado.
const limiteDiaEleccion = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});
app.use('/api/dia-eleccion/', limiteDiaEleccion);

// Rate limiting MÁS estricto específicamente para login (previene fuerza bruta
// de contraseñas — máximo 10 intentos cada 15 min por IP).
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Demasiados intentos de acceso. Espera unos minutos.' },
});
app.use('/api/auth/login', limiteLogin);

// ── RUTAS ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/resultados', resultadosRoutes);
app.use('/api/promovidos', requiereAuth, requiereModulo('promovidos'), promovidosRoutes);
// Respaldos maneja su propia autenticación adentro — por eso no
// lleva requiereModulo (no es uno de los 11 módulos normales, es
// una función de mando máximo, sin importar el rol de cada quien).
app.use('/api/respaldos', respaldosRoutes);
app.use('/api/priorizacion', requiereAuth, requiereModulo('priorizacion'), priorizacionRoutes);
app.use('/api/estructura', requiereAuth, requiereModulo('estructura'), estructuraRoutes);
app.use('/api/reportes', requiereAuth, requiereModulo('reportes'), reportesRoutes);
app.use('/api/agenda', requiereAuth, requiereModulo('agenda'), agendaRoutes);
app.use('/api/codigos', requiereAuth, requiereModulo('estructura'), codigosRoutes);
app.use('/api/dia-eleccion', requiereAuth, requiereModulo('dia-eleccion'), diaEleccionRoutes);
app.use('/api/incidencias', requiereAuth, requiereModulo('incidencias'), incidenciasRoutes);
app.use('/api/finanzas', requiereAuth, requiereModulo('finanzas'), finanzasRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/casas', casasRoutes);
app.use('/api/fotos', fotosRoutes);
app.use('/api/exportar', exportarRoutes);
app.use('/api/activos', requiereAuth, requiereModulo('activos'), activosRoutes);
app.use('/api/zonas', zonasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/promovidos-analitica', requiereAuth, requiereModulo('promovidos'), promovidosAnaliticaRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api/marketing', requiereAuth, requiereModuloMarketing(), marketingRoutes);
app.use('/api/encuestas', requiereAuth, requiereModulo('promovidos'), encuestasRoutes);
app.use('/api/juridico', requiereAuth, requiereModulo('juridico'), juridicoRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/inteligencia', inteligenciaRoutes);
app.use('/api/documentos', requiereAuth, requiereModulo('juridico'), documentosRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/salud', (req, res) => {
  res.json({ ok: true, servicio: 'VotoTech Backend', hora: new Date().toISOString() });
});

// Manejo de errores centralizado — nunca exponer detalles internos al cliente
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

// Última red de seguridad: si algo se escapa incluso de Express (por
// ejemplo, dentro de un manejador de Socket.io), se registra el error
// pero el servidor NO se cae — mejor una función que falla una vez
// que toda la plataforma caída para todos los candidatos.
process.on('unhandledRejection', (razon) => {
  console.error('⚠️ Promesa rechazada sin manejar (el servidor sigue corriendo):', razon);
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-cambiar-en-produccion';
const httpServer = createServer(app);

// Socket.io: cada campaña tiene su propia "sala" — un cliente de la
// campaña A JAMÁS recibe eventos de la campaña B, aislamiento
// multi-tenant también en tiempo real, no solo en las consultas REST.
export const io = new Server(httpServer, {
  cors: { origin: '*', credentials: true }, // TODO: restringir en producción a dominios reales
});
setIo(io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    socket.usuario = payload;
    next();
  } catch (e) {
    next(new Error('Token inválido'));
  }
});

// Quién está conectado ahora mismo, por campaña — en memoria, se
// resetea si el servidor reinicia (aceptable: se reconstruye solo
// en cuanto la gente vuelve a abrir la app).
const usuariosEnLinea = new Map(); // campana_id -> Set(usuario_id)

io.on('connection', (socket) => {
  const { campana_id, sub } = socket.usuario;
  const sala = `campana:${campana_id}`;
  socket.join(sala);
  console.log(`🔌 ${socket.usuario.nombre} conectado a ${sala}`);

  if (!usuariosEnLinea.has(campana_id)) usuariosEnLinea.set(campana_id, new Set());
  usuariosEnLinea.get(campana_id).add(sub);
  io.to(sala).emit('usuarios_en_linea', [...usuariosEnLinea.get(campana_id)]);

  socket.on('disconnect', () => {
    console.log(`🔌 ${socket.usuario.nombre} desconectado`);
    const set = usuariosEnLinea.get(campana_id);
    if (set) {
      set.delete(sub);
      io.to(sala).emit('usuarios_en_linea', [...set]);
    }
  });
});

httpServer.listen(PORT, async () => {
  console.log(`✅ VotoTech Backend + WebSockets corriendo en http://localhost:${PORT}`);

  // Auto-carga de datos: si la tabla de secciones está vacía, significa
  // que es la primera vez que el servidor arranca en este ambiente
  // (ej. recién desplegado en Render) — carga todo automáticamente,
  // sin necesitar acceso a una terminal manual.
  try {
    await query(`CREATE TABLE IF NOT EXISTS meta_seed (
      id SMALLINT PRIMARY KEY DEFAULT 1, completado_en TIMESTAMPTZ
    )`);
    const resultado = await query('SELECT completado_en FROM meta_seed WHERE id=1');
    const yaCompletado = resultado.rows[0]?.completado_en;

    if (!yaCompletado) {
      console.log('\n🌱 Carga de datos no completada todavía — cargando datos geográficos y electorales automáticamente...\n');
      await correrSeed();
    } else {
      console.log(`ℹ️  Datos ya cargados completamente el ${yaCompletado} — se omite la carga automática.`);
      // El histórico 2021 se agregó DESPUÉS de que muchas campañas ya
      // habían corrido la siembra original — se checa aparte, con su
      // propia bandera, para no tener que re-sembrar todo desde cero.
      await cargarHistorico2021();
    }
  } catch (e) {
    console.error('⚠️ No se pudo verificar/cargar datos automáticamente:', e.message);
  }

  // ── Tarea diaria: avisar por push a campañas cerca de vencer ──
  // Corre una vez al arrancar y luego cada 24h — nada elegante, pero
  // funciona bien para un solo proceso siempre encendido como este.
  const revisarVencimientos = async () => {
    try {
      const campanas = await query(
        `SELECT id, nombre_candidato, fecha_vencimiento FROM campanas
         WHERE es_demo=false AND fecha_vencimiento IS NOT NULL
           AND fecha_vencimiento BETWEEN now() AND now() + interval '7 days'`
      );
      for (const c of campanas.rows) {
        const dias = Math.ceil((new Date(c.fecha_vencimiento) - new Date()) / 86400000);
        const responsables = await query(
          `SELECT id FROM usuarios WHERE campana_id=$1 AND rol IN ('candidato','jefe_campana')`,
          [c.id]
        );
        for (const r of responsables.rows) {
          await enviarPush(r.id, {
            titulo: '💳 Suscripción por vencer',
            cuerpo: `Tu suscripción de VotoTech vence en ${dias} día(s). Contacta a soporte para renovar.`,
            url: '/dashboard',
          });
        }
      }
    } catch (e) {
      console.error('⚠️ Error revisando vencimientos:', e.message);
    }
  };
  revisarVencimientos();
  setInterval(revisarVencimientos, 24 * 60 * 60 * 1000);

  // Respaldo automático diario de cada campaña — para que nunca se
  // pierda información aunque algo salga mal. Se corre unas horas
  // después del arranque (no de inmediato) para no competir por
  // recursos con el arranque normal del servidor.
  setTimeout(() => {
    respaldarTodasLasCampanas();
    setInterval(respaldarTodasLasCampanas, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
});

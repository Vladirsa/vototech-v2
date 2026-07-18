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
import { correrSeed } from '../seed.js';

import authRoutes from './routes/auth.js';
import geoRoutes from './routes/geo.js';
import resultadosRoutes from './routes/resultados.js';
import promovidosRoutes from './routes/promovidos.js';
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
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ── SEGURIDAD ANTI-HACKEO ────────────────────────────────────
// helmet agrega ~15 headers de seguridad automáticamente (protección
// contra XSS, clickjacking, sniffing de tipo MIME, etc.) — esto es
// exactamente lo que NO teníamos control fino en el hosting compartido.
app.use(helmet());

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
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});
app.use('/api/', limiteGeneral);

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
app.use('/api/promovidos', promovidosRoutes);
app.use('/api/priorizacion', priorizacionRoutes);
app.use('/api/estructura', estructuraRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/codigos', codigosRoutes);
app.use('/api/dia-eleccion', diaEleccionRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/finanzas', finanzasRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/casas', casasRoutes);
app.use('/api/fotos', fotosRoutes);
app.use('/api/exportar', exportarRoutes);
app.use('/api/activos', activosRoutes);
app.use('/api/zonas', zonasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/promovidos-analitica', promovidosAnaliticaRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/encuestas', encuestasRoutes);
app.use('/api/juridico', juridicoRoutes);
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

io.on('connection', (socket) => {
  const sala = `campana:${socket.usuario.campana_id}`;
  socket.join(sala);
  console.log(`🔌 ${socket.usuario.nombre} conectado a ${sala}`);

  socket.on('disconnect', () => {
    console.log(`🔌 ${socket.usuario.nombre} desconectado`);
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
    }
  } catch (e) {
    console.error('⚠️ No se pudo verificar/cargar datos automáticamente:', e.message);
  }
});

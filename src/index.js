import 'dotenv/config';
import 'express-async-errors'; // ⚠️ CRÍTICO: sin esto, un error en cualquier
// ruta "async" (casi todas) se escapa del manejo de errores de Express y
// puede tumbar el proceso completo del servidor — como pasó al borrar una
// campaña con datos relacionados. Esto lo arregla para TODAS las rutas
// de una vez, no una por una.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
import priorizacionRoutes, { guardarSnapshotDiario } from './routes/priorizacion.js';
import blogRoutes from './routes/blog.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// ── SEGURIDAD ANTI-HACKEO ────────────────────────────────────
// helmet agrega ~15 headers de seguridad automáticamente (protección
// contra XSS, clickjacking, sniffing de tipo MIME, etc.) — esto es
// exactamente lo que NO teníamos control fino en el hosting compartido.
app.use(helmet());

// ── SITIO DE MARKETING (www.vototech.com.mx) ─────────────────
// Página de ventas del sistema, completamente estática — no pasa
// por el CSP estricto de la API porque solo sirve archivos, no
// procesa datos. Vive en su propia carpeta, aparte del sistema
// electoral real (que sigue siendo solo API + frontend en Vercel).
// ── BLOG PÚBLICO — renderizado en el servidor (no solo JS del
// cliente) para que Google indexe bien cada artículo, con su propio
// título y descripción únicos. Va ANTES del static para que /blog
// no intente buscar un archivo blog.html que no existe.
// Mismo encabezado exacto de la página principal, para que el blog
// se sienta parte del mismo sitio, no una página aparte. Los anclas
// (#producto, #demo, etc.) apuntan de regreso a "/" porque esas
// secciones viven en la página principal, no en el blog.
const ENCABEZADO_COMPARTIDO = `
<header>
  <nav>
    <a href="/" class="logo"><svg class="logo-mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14123D"/><path d="M16 20 L32 44 L48 20" stroke="#00D4B8" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="14" r="4" fill="#00D4B8"/></svg>VOTOTECH</a>
    <div class="navlinks">
      <a href="/#producto">Producto</a>
      <a href="/#comparativa">Comparativa</a>
      <a href="/#precios">Precios</a>
      <a href="/#faq">Preguntas</a>
      <a href="/blog">Blog</a>
      <a href="/#contacto">Contacto</a>
    </div>
    <div class="navcta">
      <a href="/#demo" class="btn btn-ghost">Ver demo</a>
      <a href="https://vototech-v2.vercel.app/" class="btn btn-primary">Ingresar al sistema →</a>
    </div>
  </nav>
</header>`;

const ESTILO_BLOG = `
  body{background:var(--paper,#F7F5F0);color:var(--ink,#14123D);font-family:'IBM Plex Sans',sans-serif;margin:0;}
  .blog-wrap{max-width:1180px;margin:0 auto;padding:130px 24px 80px;}
  .blog-titulo{font-family:'Space Grotesk',sans-serif;font-size:2.4rem;line-height:1.15;margin:0 0 8px;}
  .blog-sub{color:#6b6890;font-size:15px;margin-bottom:40px;}
  .blog-layout{display:grid;grid-template-columns:1fr 300px;gap:40px;align-items:start;}
  .blog-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
  @media (max-width:760px){.blog-layout{grid-template-columns:1fr;} .blog-grid{grid-template-columns:1fr;}}
  a.volver{color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;}
  .tarjeta{border:1px solid #E3E0D5;background:#fff;border-radius:16px;padding:22px;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:border-color 0.2s, transform 0.2s;}
  .tarjeta:hover{border-color:#0d9488;transform:translateY(-2px);}
  .tarjeta h2{font-family:'Space Grotesk',sans-serif;font-size:1.15rem;margin:0 0 8px;color:#14123D;line-height:1.3;}
  .tarjeta p{color:#565278;font-size:13.5px;line-height:1.5;margin:0 0 12px;flex:1;}
  .tag{display:inline-block;background:#EFEDF9;color:#0d9488;font-size:10.5px;font-weight:600;padding:4px 10px;border-radius:20px;margin:0 5px 5px 0;}
  .sidebar{position:sticky;top:110px;display:flex;flex-direction:column;gap:20px;}
  .side-caja{background:#fff;border:1px solid #E3E0D5;border-radius:16px;padding:20px;}
  .side-caja h3{font-family:'Space Grotesk',sans-serif;font-size:0.95rem;margin:0 0 14px;color:#14123D;}
  .side-post{display:block;text-decoration:none;color:#14123D;font-size:13px;font-weight:600;padding:9px 0;border-bottom:1px solid #EEEBE0;line-height:1.4;}
  .side-post:last-child{border-bottom:0;}
  .side-post:hover{color:#0d9488;}
  .side-contacto p{font-size:13px;color:#565278;margin:6px 0;}
  .side-contacto a{color:#0d9488;text-decoration:none;font-weight:600;}
  .side-cta{display:block;text-align:center;background:#0d9488;color:#fff;padding:12px;border-radius:10px;font-weight:700;text-decoration:none;font-size:13.5px;margin-top:6px;}
  /* Página de artículo individual */
  .art-cont{max-width:720px;}
  a.volver-art{color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;}
  h1.art-h1{font-family:'Space Grotesk',sans-serif;font-size:2.1rem;line-height:1.2;margin:20px 0 10px;}
  .art-meta{color:#6b6890;font-size:13px;margin-bottom:24px;}
  .art-contenido{font-size:16px;line-height:1.75;white-space:pre-wrap;color:#2a2760;}
  .cta{background:#0d9488;color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block;margin-top:30px;}
  iframe{width:100%;aspect-ratio:16/9;border-radius:12px;border:0;}
  .pdf-embed{display:block;background:#14123D;border-radius:12px;padding:30px;text-align:center;text-decoration:none;color:#00D4B8;font-weight:700;margin-bottom:20px;}
`;
function urlVideoEmbed(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // El panel promete "YouTube o Vimeo" pero antes solo se embebía
  // YouTube — un link de Vimeo se veía como simple texto en vez de
  // reproductor, que es justo el bug reportado.
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}
function barraLateralHTML(recientes) {
  return `
    <aside class="sidebar">
      <div class="side-caja">
        <h3>📰 Publicaciones recientes</h3>
        ${recientes.map((r) => `<a class="side-post" href="/blog/${r.slug}">${r.titulo}</a>`).join('') || '<p style="font-size:12px;color:#8583B0;">Sin más publicaciones todavía.</p>'}
      </div>
      <div class="side-caja side-contacto">
        <h3>📞 Contáctanos</h3>
        <p>WhatsApp: <a href="https://wa.me/522461217072" target="_blank" rel="noopener">+52 246 121 7072</a></p>
        <p>¿Listo para ver el sistema completo?</p>
        <a class="side-cta" href="https://calendar.app.google/HbzMQYyXH4THQeAL6" target="_blank" rel="noopener">📅 Agenda tu cita →</a>
      </div>
    </aside>`;
}

app.get('/blog', async (req, res) => {
  const r = await query(`SELECT titulo, slug, tipo, resumen, etiquetas, fecha_publicacion FROM blog_publicaciones WHERE publicado=true ORDER BY fecha_publicacion DESC LIMIT 100`);
  const tarjetas = r.rows.map((p) => `
    <a class="tarjeta" href="/blog/${p.slug}">
      <h2>${p.tipo === 'pdf' ? '📎 ' : p.tipo === 'video' ? '🎬 ' : ''}${p.titulo}</h2>
      <p>${p.resumen || ''}</p>
      <div>${(p.etiquetas || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    </a>`).join('\n');
  res.send(`<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog — VotoTech | Recursos para campañas electorales en México</title>
    <meta name="description" content="Artículos, guías y recursos sobre organización de campañas electorales, estructura territorial, y gestión de campo en México.">
    <link rel="canonical" href="https://www.vototech.com.mx/blog">
    <meta name="robots" content="index, follow">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css?v=2">
    <style>${ESTILO_BLOG}</style></head><body>
    ${ENCABEZADO_COMPARTIDO}
    <div class="blog-wrap">
      <h1 class="blog-titulo">Blog de VotoTech</h1>
      <p class="blog-sub">Recursos para organizar campañas electorales en México</p>
      <div class="blog-layout">
        <div class="blog-grid">${tarjetas || '<p>Todavía no hay publicaciones.</p>'}</div>
        ${barraLateralHTML(r.rows.slice(0, 5))}
      </div>
    </div></body></html>`);
});

app.get('/blog/:slug', async (req, res) => {
  const r = await query('SELECT * FROM blog_publicaciones WHERE slug=$1 AND publicado=true', [req.params.slug]);
  const p = r.rows[0];
  if (!p) return res.status(404).send('<h1>No encontrado</h1><a href="/blog">← Volver al blog</a>');
  query('UPDATE blog_publicaciones SET vistas=vistas+1 WHERE id=$1', [p.id]).catch(() => {});
  const recientes = await query(`SELECT titulo, slug FROM blog_publicaciones WHERE publicado=true AND slug != $1 ORDER BY fecha_publicacion DESC LIMIT 5`, [p.slug]);

  let cuerpoMedia = '';
  if (p.tipo === 'video' && p.url_archivo) {
    const embed = urlVideoEmbed(p.url_archivo);
    cuerpoMedia = embed ? `<iframe src="${embed}" allowfullscreen></iframe>` : `<a class="pdf-embed" href="${p.url_archivo}" target="_blank">▶️ Ver video</a>`;
  } else if (p.tipo === 'pdf' && p.url_archivo) {
    cuerpoMedia = `<a class="pdf-embed" href="${p.url_archivo}" target="_blank">📎 Descargar / ver PDF</a>`;
  }

  const metaDesc = (p.meta_descripcion || p.resumen || '').replace(/"/g, '&quot;');
  res.send(`<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${p.meta_titulo || p.titulo} | Blog VotoTech</title>
    <meta name="description" content="${metaDesc}">
    <link rel="canonical" href="https://www.vototech.com.mx/blog/${p.slug}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${p.titulo}">
    <meta property="og:description" content="${metaDesc}">
    ${p.imagen_portada ? `<meta property="og:image" content="${p.imagen_portada}">` : ''}
    <meta name="robots" content="index, follow">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.titulo, description: metaDesc, datePublished: p.fecha_publicacion })}</script>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css?v=2">
    <style>${ESTILO_BLOG}</style></head><body>
    ${ENCABEZADO_COMPARTIDO}
    <div class="blog-wrap">
      <div class="blog-layout">
        <div class="art-cont">
          <a class="volver-art" href="/blog">← Blog VotoTech</a>
          <h1 class="art-h1">${p.titulo}</h1>
          <p class="art-meta">${new Date(p.fecha_publicacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · ${p.vistas} vistas</p>
          <div>${(p.etiquetas || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
          ${cuerpoMedia}
          <div class="art-contenido">${(p.contenido || '').replace(/</g, '&lt;')}</div>
          <a class="cta" href="/#demo">Probar VotoTech →</a>
        </div>
        ${barraLateralHTML(recientes.rows)}
      </div>
    </div></body></html>`);
});

app.use(express.static(path.join(__dirname, '../public-marketing')));

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
app.use('/api/priorizacion', requiereAuth, requiereModulo('priorizacion'), priorizacionRoutes);
// El blog maneja su propia protección adentro (rutas /admin con
// requiereSuperAdmin, rutas públicas sin nada) — por eso NO lleva
// requiereAuth aquí, a diferencia de los demás módulos.
app.use('/api/blog', blogRoutes);
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

  // Captura diaria automática de qué está prediciendo el Motor de
  // Priorización — la base que se auto-guarda para medir precisión
  // real después de cada elección, sin tocar datos personales.
  setTimeout(() => {
    guardarSnapshotDiario().catch((e) => console.error('⚠️ Error en snapshot diario:', e.message));
    setInterval(() => {
      guardarSnapshotDiario().catch((e) => console.error('⚠️ Error en snapshot diario:', e.message));
    }, 24 * 60 * 60 * 1000);
  }, 2 * 60 * 1000);

  // Respaldo automático diario de cada campaña — para que nunca se
  // pierda información aunque algo salga mal. Se corre unas horas
  // después del arranque (no de inmediato) para no competir por
  // recursos con el arranque normal del servidor.
  setTimeout(() => {
    respaldarTodasLasCampanas();
    setInterval(respaldarTodasLasCampanas, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
});

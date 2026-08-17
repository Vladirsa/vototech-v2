import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
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
import blogRoutes from './routes/blog.js';
import caminatasRoutes from './routes/caminatas.js';
import logisticaRoutes from './routes/logistica.js';
import callesRoutes from './routes/calles.js';
import seccionesRoutes from './routes/secciones.js';
import documentosPersonaRoutes from './routes/documentos-persona.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const permitido =
      origin.endsWith('.vototech.mx') ||
      origin.endsWith('.vercel.app') ||
      origin === 'http://localhost:5173' ||
      process.env.DOMINIOS_PERMITIDOS?.split(',').includes(origin);
    callback(permitido ? null : new Error('Origen no permitido por CORS'), permitido);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});
app.use('/api/', limiteGeneral);

const limiteDiaEleccion = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});
app.use('/api/dia-eleccion/', limiteDiaEleccion);

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Demasiados intentos de acceso. Espera unos minutos.' },
});
app.use('/api/auth/login', limiteLogin);

app.use('/api/auth', authRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/resultados', resultadosRoutes);
app.use('/api/promovidos', requiereAuth, requiereModulo('promovidos'), promovidosRoutes);
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
app.use('/api/blog', blogRoutes);
// 🆕 Caminatas — se protege sola por dentro (router.use(requiereAuth)
// al inicio del archivo), mismo patrón que /respaldos, /whatsapp, /ia.
app.use('/api/caminatas', caminatasRoutes);
// 🆕 Logística — vehículos, choferes, checklist de eventos. Llave
// propia ('logistica'), no reutiliza la de Agenda — así el acceso
// se puede afinar por separado si algún rol necesita una sin la otra.
app.use('/api/logistica', requiereAuth, requiereModulo('logistica'), logisticaRoutes);
// 🆕 Búsqueda local de calles — solo necesita estar autenticado
// (ya lo exige requiereAuth dentro de calles.js), cualquier rol puede
// usarla al capturar un promovido o registrar un activo.
app.use('/api/calles', callesRoutes);
app.use('/api/secciones', seccionesRoutes);
app.use('/api/documentos-persona', documentosPersonaRoutes);

app.get('/api/salud', (req, res) => {
  res.json({ ok: true, servicio: 'VotoTech Backend', hora: new Date().toISOString() });
});

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
  .tarjeta{border:1px solid #E3E0D5;background:#fff;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:border-color 0.2s, transform 0.2s;}
  .tarjeta:hover{border-color:#0d9488;transform:translateY(-2px);}
  .tarjeta-img-cont{position:relative;width:100%;height:160px;overflow:hidden;background:#EFEDF9;}
  .tarjeta-img{width:100%;height:160px;object-fit:cover;display:block;}
  .tarjeta-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;background:rgba(20,18,61,0.75);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;padding-left:3px;}
  .tarjeta-cuerpo{padding:22px;display:flex;flex-direction:column;flex:1;}
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
  .art-cont{max-width:720px;}
  .art-portada{width:100%;max-height:420px;object-fit:cover;border-radius:16px;margin:20px 0;}
  a.volver-art{color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;}
  h1.art-h1{font-family:'Space Grotesk',sans-serif;font-size:2.1rem;line-height:1.2;margin:20px 0 10px;}
  .art-meta{color:#6b6890;font-size:13px;margin-bottom:24px;}
  .compartir{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap;align-items:center;}
  .compartir-label{font-size:12px;color:#8583B0;font-weight:600;margin-right:2px;}
  .compartir a, .compartir button{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;font-size:12.5px;font-weight:700;text-decoration:none;border:1px solid #E3E0D5;background:#fff;color:#14123D;cursor:pointer;font-family:inherit;}
  .compartir a:hover, .compartir button:hover{border-color:#0d9488;}
  .art-contenido{font-size:16px;line-height:1.75;color:#2a2760;}
  .art-contenido p{margin:0 0 18px;}
  .art-contenido h2{font-family:'Space Grotesk',sans-serif;font-size:1.5rem;margin:32px 0 14px;color:#14123D;}
  .art-contenido h3{font-family:'Space Grotesk',sans-serif;font-size:1.2rem;margin:26px 0 12px;color:#14123D;}
  .art-contenido strong{color:#14123D;}
  .art-contenido a{color:#0d9488;text-decoration:underline;}
  .art-contenido img{max-width:100%;border-radius:12px;margin:20px 0;display:block;}
  .cta{background:#0d9488;color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block;margin-top:30px;}
  iframe{width:100%;aspect-ratio:16/9;border-radius:12px;border:0;}
  .pdf-embed{display:block;background:#14123D;border-radius:12px;padding:30px;text-align:center;text-decoration:none;color:#00D4B8;font-weight:700;margin-bottom:20px;}
`;

function urlVideoEmbed(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function miniaturaVideo(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  return null;
}

function markdownAHtml(texto) {
  if (!texto) return '';
  let seguro = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  seguro = seguro.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  seguro = seguro.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  seguro = seguro.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  seguro = seguro.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  seguro = seguro.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  seguro = seguro.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  const bloques = seguro.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return bloques.map((b) => (/^<(h2|h3|img)/.test(b) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`)).join('\n');
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
  const r = await query(`SELECT titulo, slug, tipo, resumen, imagen_portada, url_archivo, etiquetas, fecha_publicacion FROM blog_publicaciones WHERE publicado=true ORDER BY fecha_publicacion DESC LIMIT 100`);
  const tarjetas = r.rows.map((p) => {
    const imagen = p.imagen_portada || (p.tipo === 'video' ? miniaturaVideo(p.url_archivo) : null);
    return `
    <a class="tarjeta" href="/blog/${p.slug}">
      ${imagen ? `<div class="tarjeta-img-cont"><img class="tarjeta-img" src="${imagen}" alt="${p.titulo}" loading="lazy">${p.tipo === 'video' ? '<span class="tarjeta-play">▶</span>' : ''}</div>` : ''}
      <div class="tarjeta-cuerpo">
        <h2>${p.tipo === 'pdf' ? '📎 ' : p.tipo === 'video' ? '🎬 ' : ''}${p.titulo}</h2>
        <p>${p.resumen || ''}</p>
        <div>${(p.etiquetas || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </a>`;
  }).join('\n');
  res.send(`<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog — VotoTech | Recursos para campañas electorales en México</title>
    <meta name="description" content="Artículos, guías y recursos sobre organización de campañas electorales, estructura territorial, y gestión de campo en México.">
    <link rel="canonical" href="https://www.vototech.com.mx/blog">
    <meta name="robots" content="index, follow">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
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

app.get('/sitemap.xml', async (req, res) => {
  const posts = await query(`SELECT slug, actualizado_en, creado_en FROM blog_publicaciones WHERE publicado=true ORDER BY fecha_publicacion DESC`);
  const paginasFijas = ['', 'blog', 'terminos.html', 'privacidad.html'];
  const urls = [
    ...paginasFijas.map((p) => `  <url><loc>https://www.vototech.com.mx/${p}</loc><changefreq>weekly</changefreq><priority>${p === '' ? '1.0' : '0.8'}</priority></url>`),
    ...posts.rows.map((p) => `  <url><loc>https://www.vototech.com.mx/blog/${p.slug}</loc><lastmod>${(p.actualizado_en || p.creado_en).toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
  ];
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: https://www.vototech.com.mx/sitemap.xml`);
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
    <link rel="stylesheet" href="/style.css">
    <style>${ESTILO_BLOG}</style></head><body>
    ${ENCABEZADO_COMPARTIDO}
    <div class="blog-wrap">
      <div class="blog-layout">
        <div class="art-cont">
          <a class="volver-art" href="/blog">← Blog VotoTech</a>
          <h1 class="art-h1">${p.titulo}</h1>
          <p class="art-meta">${new Date(p.fecha_publicacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · ${p.vistas} vistas</p>
          <div>${(p.etiquetas || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
          ${p.imagen_portada ? `<img class="art-portada" src="${p.imagen_portada}" alt="${p.titulo}">` : ''}
          <div class="compartir">
            <span class="compartir-label">Compartir:</span>
            <a href="https://wa.me/?text=${encodeURIComponent(`${p.titulo} — https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">💬 WhatsApp</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">📘 Facebook</a>
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(p.titulo)}&url=${encodeURIComponent(`https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">🐦 X</a>
            <button onclick="navigator.clipboard.writeText('https://www.vototech.com.mx/blog/${p.slug}').then(()=>{this.textContent='✅ Copiado';setTimeout(()=>{this.textContent='🔗 Copiar link'},2000)})">🔗 Copiar link</button>
          </div>
          ${cuerpoMedia}
          <div class="art-contenido">${markdownAHtml(p.contenido)}</div>
          <div class="compartir">
            <span class="compartir-label">¿Te sirvió? Compártelo:</span>
            <a href="https://wa.me/?text=${encodeURIComponent(`${p.titulo} — https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">💬 WhatsApp</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">📘 Facebook</a>
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(p.titulo)}&url=${encodeURIComponent(`https://www.vototech.com.mx/blog/${p.slug}`)}" target="_blank" rel="noopener">🐦 X</a>
          </div>
          <a class="cta" href="/#demo">Probar VotoTech →</a>
        </div>
        ${barraLateralHTML(recientes.rows)}
      </div>
    </div></body></html>`);
});

app.use(express.static(path.join(__dirname, '../public-marketing')));

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

process.on('unhandledRejection', (razon) => {
  console.error('⚠️ Promesa rechazada sin manejar (el servidor sigue corriendo):', razon);
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-cambiar-en-produccion';
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: '*', credentials: true },
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

const usuariosEnLinea = new Map();

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
      await cargarHistorico2021();
    }
  } catch (e) {
    console.error('⚠️ No se pudo verificar/cargar datos automáticamente:', e.message);
  }

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

  setTimeout(() => {
    respaldarTodasLasCampanas();
    setInterval(respaldarTodasLasCampanas, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
});

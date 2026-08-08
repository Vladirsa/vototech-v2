-- ══════════════════════════════════════════════════════════════
-- FASE 47 — BLOG PÚBLICO (artículos, PDFs, videos) para SEO
-- ══════════════════════════════════════════════════════════════
-- Vive en vototech.com.mx/blog — contenido que Google puede indexar
-- para que candidatos te encuentren buscando temas de campaña, no
-- solo cuando ya saben que existes. Independiente de las campañas
-- de clientes — esto es contenido TUYO, de la plataforma.
CREATE TABLE IF NOT EXISTS blog_publicaciones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo            VARCHAR(200) NOT NULL,
  slug              VARCHAR(220) UNIQUE NOT NULL,  -- para la URL: /blog/como-organizar-tu-estructura
  tipo              VARCHAR(20) NOT NULL DEFAULT 'articulo', -- articulo, pdf, video
  resumen           VARCHAR(300),                   -- para la tarjeta de vista previa y meta description
  contenido         TEXT,                            -- cuerpo del artículo (markdown simple), NULL si es pdf/video
  url_archivo       TEXT,                            -- URL del PDF subido, o del video (YouTube/Vimeo embebido)
  imagen_portada    TEXT,                            -- para redes sociales (og:image) y la tarjeta
  etiquetas         TEXT[] DEFAULT '{}',              -- para SEO y filtrado: ['campaña municipal','estructura']
  meta_titulo       VARCHAR(200),                     -- si es distinto al título visible, para Google
  meta_descripcion  VARCHAR(300),
  publicado         BOOLEAN DEFAULT false,
  fecha_publicacion TIMESTAMPTZ,
  vistas            INTEGER DEFAULT 0,
  creado_en         TIMESTAMPTZ DEFAULT now(),
  actualizado_en    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_publicado ON blog_publicaciones(publicado, fecha_publicacion DESC);
CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_publicaciones(slug);
CREATE INDEX IF NOT EXISTS idx_blog_etiquetas ON blog_publicaciones USING GIN(etiquetas);

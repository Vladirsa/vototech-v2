-- ════════════════════════════════════════════════════════════════
-- VotoTech · Seguridad Ronda 2 · Cambios en la base de datos
-- Pegar completo en Supabase → SQL Editor → Run.
-- Se puede correr más de una vez sin dañar nada.
-- ════════════════════════════════════════════════════════════════

-- 1) Documentos de cada persona (INE, acta, comprobante):
--    la tabla no tenía las columnas que usa el sistema, por eso el
--    módulo fallaba. Se agregan (la tabla está vacía, no se pierde nada).
ALTER TABLE documentos_persona
  ADD COLUMN IF NOT EXISTS campana_id      uuid,
  ADD COLUMN IF NOT EXISTS entregado       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archivo_url     text,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid,
  ADD COLUMN IF NOT EXISTS actualizado_en  timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_documentos_persona_campana ON documentos_persona (campana_id);

-- 2) Tres tablas de respaldo quedaron SIN candado (RLS apagado):
--    cualquiera con la llave pública de Supabase podía leerlas.
ALTER TABLE IF EXISTS respaldo_secciones_20260922          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS respaldo_municipios_20260922         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS respaldo_casillas_of_estado_20260922 ENABLE ROW LEVEL SECURITY;

-- 3) Un mismo correo no se puede repetir dentro de una campaña
--    (sin importar mayúsculas). Hoy hay 0 duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_campana_email_unico
  ON usuarios (campana_id, lower(email)) WHERE email IS NOT NULL;

-- 4) Funciones internas con "ruta de búsqueda" fija (recomendación
--    de seguridad de Supabase; evita que alguien las engañe).
ALTER FUNCTION public.actualizar_timestamp()      SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_trigger()             SET search_path = public, pg_temp;
ALTER FUNCTION public.clasificar_promovido(character varying, character varying, boolean, character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_generar_folio_unico()    SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_actualizar_contacto()   SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_clasificar_promovido()  SET search_path = public, pg_temp;

-- 5) (Ronda 5) Marca de "token canjeado" para detectar robo de sesión
--    sin castigar cierres de sesión normales. (Ya aplicado.)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotado_en timestamptz;

import { createClient } from '@supabase/supabase-js';

/**
 * 🔒 ALMACENAMIENTO PRIVADO para documentos sensibles (fotos de INE,
 * actas de nacimiento, comprobantes de domicilio).
 *
 * Antes estos archivos iban a carpetas PÚBLICAS de Supabase: cualquiera
 * con el enlace podía verlos para siempre, aunque ya no trabajara en la
 * campaña. Ahora van a la carpeta "privado" (no pública) y solo se
 * pueden ver con un enlace temporal que caduca en 30 minutos, generado
 * por el servidor después de revisar que quien lo pide tiene permiso.
 *
 * En la base de datos se guarda "privado:<ruta>" en lugar de la URL,
 * así se distingue de archivos viejos que sí tenían URL pública.
 */
const BUCKET = 'privado';
const PREFIJO = 'privado:';
let bucketListo = false;

function cliente() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/** Crea la carpeta privada la primera vez que se necesita (si no existe). */
async function asegurarBucket(supabase) {
  if (bucketListo) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketListo = true;
}

/**
 * Sube un archivo a la carpeta privada. Regresa el texto a guardar en
 * la base ("privado:<ruta>") o null si falló.
 */
export async function subirPrivado(ruta, buffer, contentType) {
  const supabase = cliente();
  if (!supabase) return null;
  try {
    await asegurarBucket(supabase);
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, { contentType, upsert: true });
    if (error) return null;
    return `${PREFIJO}${ruta}`;
  } catch (e) {
    // Si el almacenamiento falla, no se cae todo el registro: solo
    // no se guarda la foto (quien llama decide qué hacer).
    console.error('Error subiendo archivo privado:', e.message);
    return null;
  }
}

/**
 * Convierte lo guardado en la base en un enlace que se puede abrir:
 * - "privado:<ruta>" → enlace temporal de 30 minutos;
 * - cualquier otra cosa (archivos viejos con URL pública) → igual.
 */
export async function enlaceParaVer(valorGuardado, segundos = 1800) {
  if (!valorGuardado || !valorGuardado.startsWith(PREFIJO)) return valorGuardado || null;
  const supabase = cliente();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(valorGuardado.slice(PREFIJO.length), segundos);
  return error ? null : data.signedUrl;
}

/** Tipos de archivo permitidos para documentos: fotos y PDF. */
export const TIPOS_DOCUMENTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

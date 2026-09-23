import { z } from 'zod';

/**
 * 🔒 REGLAS DE CONTRASEÑA — una sola regla para todo el sistema
 * (registro, invitación, alta de miembros y recuperación).
 *
 * Antes solo se pedían 8 caracteres: "12345678" o "password" pasaban.
 * Ahora:
 *  - mínimo 8, máximo 128 caracteres;
 *  - no puede ser una de las contraseñas más usadas en el mundo;
 *  - no puede ser el mismo carácter repetido ni una secuencia (12345678).
 * Se dejó en 8 para no complicar el alta en campo; la lista negra evita
 * las que se adivinan en segundos.
 */
const COMUNES = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'password123', 'contraseña', 'contrasena', 'contrasena1', 'qwertyui',
  'qwerty123', 'abc12345', 'abcd1234', 'iloveyou', 'sunshine', 'princesa', 'mexico123', 'mexico2024',
  'mexico2027', 'tlaxcala', 'tlaxcala1', 'vototech', 'vototech1', 'vototech123', 'campana1', 'campaña1',
  'elecciones', 'eleccion2027', 'morena123', 'admin123', 'administrador', 'bienvenido', 'bienvenido1',
  'cambiame', 'cambiame1', 'temporal', 'temporal1', 'tequiero', 'teamo123', 'america1', 'chivas123',
]);

export function problemaDeContrasena(p) {
  if (typeof p !== 'string' || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (p.length > 128) return 'La contraseña es demasiado larga (máximo 128 caracteres)';
  const baja = p.toLowerCase();
  if (COMUNES.has(baja)) return 'Esa contraseña es de las más usadas y se adivina fácil. Elige otra.';
  if (/^(.)\1+$/.test(p)) return 'La contraseña no puede ser el mismo carácter repetido.';
  const esSecuencia = [...baja].every((c, i, a) => i === 0 || c.charCodeAt(0) - a[i - 1].charCodeAt(0) === 1);
  if (esSecuencia) return 'La contraseña no puede ser una secuencia (como 12345678 o abcdefgh).';
  return null;
}

/** Esquema zod listo para usar en los formularios. */
export const esquemaContrasena = z.string().superRefine((p, ctx) => {
  const problema = problemaDeContrasena(p);
  if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
});

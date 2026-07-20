import { query } from '../db/pool.js';

/**
 * Registra una acción en la bitácora de auditoría general — para las
 * acciones más sensibles del sistema (resultados electorales,
 * finanzas, cambios de rol, borrado de datos de ciudadanos). No es
 * para TODO (eso saturaría la tabla sin agregar valor real), es
 * para lo que de verdad importa poder rastrear después: "¿quién
 * cambió esto, y cuándo?"
 *
 * Se llama de forma silenciosa (no bloquea la respuesta si falla) —
 * la auditoría nunca debe tumbar la acción real que se está haciendo.
 */
export async function registrarAuditoria({ campanaId, usuarioId, usuarioNombre, accion, tabla, registroId, detalle, ip }) {
  try {
    await query(
      `INSERT INTO auditoria (campana_id, usuario_id, usuario_nombre, accion, tabla, registro_id, detalle, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [campanaId, usuarioId || null, usuarioNombre || null, accion, tabla, registroId ? String(registroId) : null, detalle ? JSON.stringify(detalle) : null, ip || null]
    );
  } catch (e) {
    console.error('⚠️ No se pudo registrar en la bitácora de auditoría (no se detiene la acción principal):', e.message);
  }
}

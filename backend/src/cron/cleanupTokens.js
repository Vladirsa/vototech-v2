const cron = require('node-cron');
const db = require('../db');

/**
 * Cron job que limpia tokens expirados cada día
 * Se ejecuta a las 2:00 AM
 */
function startCleanupCron() {
  cron.schedule('0 2 * * *', async () => {
    console.log('🧹 [CRON] Iniciando limpieza de tokens expirados...');

    try {
      // Eliminar tokens expirados hace más de 7 días
      const result = await db.query(`
        DELETE FROM refresh_tokens
        WHERE (
          expira_en < NOW() - INTERVAL '7 days'
        )
        RETURNING id
      `);

      console.log(`✅ [CRON] Eliminados ${result.rowCount} tokens antiguos`);

      // También limpiar sesiones viejas
      const sessionsResult = await db.query(`
        DELETE FROM registro_accesos
        WHERE creado_en < NOW() - INTERVAL '90 days'
        RETURNING id
      `);

      console.log(`✅ [CRON] Archivado ${sessionsResult.rowCount} registros de acceso`);
    } catch (err) {
      console.error('❌ [CRON] Error en limpieza de tokens:', err);
      // No fallar el servidor, solo loguear el error
    }
  });

  console.log('📅 Cron job de limpieza de tokens iniciado (2:00 AM diariamente)');
}

module.exports = { startCleanupCron };

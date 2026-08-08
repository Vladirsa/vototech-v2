const express = require('express');
const router = express.Router();
const db = require('../db');
const TwoFAService = require('../services/twofa.service');
const { authMiddleware } = require('../middleware/auth');

/**
 * POST /api/2fa/setup
 * El usuario inicia el setup de 2FA
 * Retorna QR code y secret
 */
router.post('/setup', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verificar que el usuario no tenga 2FA ya activo
    const { rows } = await db.query(
      'SELECT dos_factores_activo FROM usuarios WHERE id = $1',
      [userId]
    );

    if (rows[0]?.dos_factores_activo) {
      return res.status(400).json({
        error: '2FA ya está activo. Desactívalo primero.'
      });
    }

    // Generar secret y QR
    const { secret, qrCode, otpauth_url } = await TwoFAService.generateSecret(
      req.user.email
    );

    // Generar códigos de backup
    const backupCodes = TwoFAService.generateBackupCodes();

    // Guardar TEMPORALMENTE (aún no confirmado)
    await db.query(
      `UPDATE usuarios 
       SET dos_factores_secreto = $1
       WHERE id = $2`,
      [secret, userId]
    );

    res.json({
      qrCode: qrCode,
      secret: secret,
      backupCodes: backupCodes,
      message: 'Guarda los códigos de backup en un lugar seguro'
    });
  } catch (err) {
    console.error('Error en 2FA setup:', err);
    res.status(500).json({ error: 'Error al configurar 2FA' });
  }
});

/**
 * POST /api/2fa/confirm
 * El usuario confirma 2FA ingresando un código del autenticador
 */
router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token || token.length !== 6) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    // Obtener el secret temporal
    const { rows } = await db.query(
      'SELECT dos_factores_secreto FROM usuarios WHERE id = $1',
      [userId]
    );

    if (!rows[0]?.dos_factores_secreto) {
      return res.status(400).json({
        error: 'No hay setup de 2FA pendiente. Inicia el setup primero.'
      });
    }

    // Verificar token
    const isValid = TwoFAService.verifyToken(rows[0].dos_factores_secreto, token);

    if (!isValid) {
      return res.status(401).json({ error: 'Token incorrecto' });
    }

    // Confirmar 2FA
    const backupCodes = TwoFAService.generateBackupCodes();

    await db.query(
      `UPDATE usuarios 
       SET dos_factores_activo = true,
           dos_factores_secreto = $1
       WHERE id = $2`,
      [rows[0].dos_factores_secreto, userId]
    );

    // Guardar códigos de backup (encriptados en producción)
    await db.query(
      `INSERT INTO dos_factores_backup_codes (usuario_id, codigos)
       VALUES ($1, $2)`,
      [userId, JSON.stringify(backupCodes)]
    );

    res.json({
      message: '2FA activado exitosamente',
      backupCodes: backupCodes
    });
  } catch (err) {
    console.error('Error en 2FA confirm:', err);
    res.status(500).json({ error: 'Error al confirmar 2FA' });
  }
});

/**
 * POST /api/2fa/verify
 * Durante el login, verifica el código 2FA
 */
router.post('/verify', async (req, res) => {
  try {
    const { usuarioId, token } = req.body;

    const { rows } = await db.query(
      `SELECT dos_factores_secreto, dos_factores_activo 
       FROM usuarios 
       WHERE id = $1`,
      [usuarioId]
    );

    if (!rows[0]?.dos_factores_activo) {
      return res.status(400).json({ error: '2FA no está activo' });
    }

    const isValid = TwoFAService.verifyToken(rows[0].dos_factores_secreto, token);

    if (!isValid) {
      return res.status(401).json({ error: 'Código 2FA incorrecto' });
    }

    res.json({ message: 'Verificación exitosa' });
  } catch (err) {
    console.error('Error en 2FA verify:', err);
    res.status(500).json({ error: 'Error al verificar 2FA' });
  }
});

module.exports = router;

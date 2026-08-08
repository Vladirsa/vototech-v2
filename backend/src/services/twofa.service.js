const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class TwoFAService {
  /**
   * Genera un secreto TOTP para 2FA
   * @param {string} userEmail - Email del usuario
   * @returns {Object} - { secret, qrCode }
   */
  static async generateSecret(userEmail) {
    const secret = speakeasy.generateSecret({
      name: `VotoTech (${userEmail})`,
      issuer: 'VotoTech',
      length: 32
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCode,
      otpauth_url: secret.otpauth_url
    };
  }

  /**
   * Verifica un código TOTP
   * @param {string} secret - Secret del usuario (base32)
   * @param {string} token - Token de 6 dígitos del usuario
   * @returns {boolean}
   */
  static verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Permite ±2 ventanas de 30 segundos
    });
  }

  /**
   * Genera códigos de backup (para acceso si pierden el teléfono)
   * @returns {Array} - Array de 10 códigos
   */
  static generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );
    }
    return codes;
  }
}

module.exports = TwoFAService;

// backend/src/middleware/security.js

const rateLimit = require('express-rate-limit');

// Rate limiting general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  message: { error: 'Demasiadas peticiones. Intente más tarde.' }
});

// Rate limiting para login (más estricto)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de login. Espere 15 minutos.' }
});

// Rate limiting para WhatsApp (anti-spam)
const whatsappLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // 50 mensajes por tenant
  keyGenerator: (req) => req.tenantId // Por campaña, no por IP
});

module.exports = { generalLimiter, loginLimiter, whatsappLimiter };

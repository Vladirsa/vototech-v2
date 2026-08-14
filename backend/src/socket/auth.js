// backend/src/socket/auth.js

const jwt = require('jsonwebtoken');

function socketAuth(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Autenticación requerida'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.tenantId = decoded.tenantId;
      socket.userId = decoded.userId;
      socket.rol = decoded.rol;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });
  
  io.on('connection', (socket) => {
    // Solo permitir suscripción a rooms del tenant propio
    socket.on('subscribe:incidencias', () => {
      socket.join(`incidencias:${socket.tenantId}`);
    });
    
    // Validar que solo admins puedan emitir alertas globales
    socket.on('alerta:global', (data) => {
      if (socket.rol !== 'ADMIN') {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }
      io.to(`incidencias:${socket.tenantId}`).emit('nueva-alerta', data);
    });
  });
}

module.exports = socketAuth;

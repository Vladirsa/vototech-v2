// backend/src/rules/ReglasFiscalizacion.js
const REGLAS = {
  plazos: {
    registroOperaciones: { dias: 3, tipo: 'naturales' },
    registroAgenda: { dias: -7, tipo: 'anticipacion' }, // 7 días antes
    cancelacionEvento: { horas: 48, tipo: 'posterior' }
  },
  topes: {
    alertas: [0.70, 0.85, 0.95, 1.00],
    accion100: 'BLOQUEO_EGRESOS'
  },
  activos: {
    independientesNoInmuebles: true,
    depreciacionMensual: true
  }
};

// Middleware de validación
function validarPlazoRegistro(req, res, next) {
  const fechaOperacion = new Date(req.body.fecha);
  const hoy = new Date();
  const diff = (hoy - fechaOperacion) / (1000 * 60 * 60 * 24);
  
  if (diff > 3) {
    return res.status(400).json({
      error: 'Operación fuera de plazo. Debe registrarse en 3 días naturales.'
    });
  }
  next();
}

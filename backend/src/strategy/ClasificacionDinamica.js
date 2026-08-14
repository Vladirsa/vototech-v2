// backend/src/strategy/ClasificacionDinamica.js
const CLASIFICACION = {
  ESTADOS: {
    BASE_FUERTE: { valor: 5, color: '#006400' },      // Verde oscuro
    BASE: { valor: 4, color: '#32CD32' },              // Verde
    PERSUADIBLE_CALIDO: { valor: 3, color: '#FFD700' }, // Amarillo
    PERSUADIBLE_FRIO: { valor: 2, color: '#FF8C00' },  // Naranja
    INDECISO: { valor: 1, color: '#808080' },           // Gris
    ADVERSARIO_BLANDO: { valor: -2, color: '#FF69B4' }, // Rosa
    ADVERSARIO: { valor: -4, color: '#DC143C' },        // Rojo
    ADVERSARIO_IRREDUCTIBLE: { valor: -5, color: '#8B0000' } // Rojo oscuro
  },
  
  // Transiciones basadas en interacciones
  transicionar: (promovido, interaccion) => {
    // Ej: Un persuadible que recibe 3 visitas efectivas + asiste a evento
    // pasa a "Base" automáticamente
    if (promovido.clasificacion === 'PERSUADIBLE_CALIDO' && 
        interaccion.visitasEfectivas >= 3 &&
        interaccion.asistenciaEvento) {
      return 'BASE';
    }
    // ... más reglas
  }
};

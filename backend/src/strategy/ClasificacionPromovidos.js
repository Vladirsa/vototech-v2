// backend/src/strategy/ClasificacionPromovidos.js

const CLASIFICACIONES = {
  BASE_FUERTE: { valor: 5, color: '#006400', descripcion: 'Voto seguro, promotor natural' },
  BASE: { valor: 4, color: '#32CD32', descripcion: 'Voto seguro' },
  PERSUADIBLE_CALIDO: { valor: 3, color: '#FFD700', descripcion: 'Inclinado, necesita poco empujón' },
  PERSUADIBLE_FRIO: { valor: 2, color: '#FF8C00', descripcion: 'Indeciso, requiere trabajo' },
  INDECISO: { valor: 1, color: '#808080', descripcion: 'Sin información suficiente' },
  ADVERSARIO_BLANDO: { valor: -2, color: '#FF69B4', descripcion: 'Inclinado rival, pero no irreductible' },
  ADVERSARIO: { valor: -4, color: '#DC143C', descripcion: 'Voto rival firme' },
  ADVERSARIO_IRREDUCTIBLE: { valor: -5, color: '#8B0000', descripcion: 'No perder tiempo' }
};

class ClasificacionDinamica {
  
  /**
   * Determina si un promovido cambia de clasificación tras una interacción
   */
  static evaluarTransicion(promovido, interaccion) {
    const historial = promovido.historialInteracciones || [];
    const nuevaInteraccion = {
      ...interaccion,
      fecha: new Date(),
      clasificacionPrevia: promovido.clasificacion
    };
    
    const historialActualizado = [...historial, nuevaInteraccion];
    
    // REGLAS DE TRANSICIÓN
    const reglas = [
      // Regla 1: Persuadible cálido + 3 visitas efectivas + evento = Base
      {
        condicion: (p, h) => 
          p.clasificacion === 'PERSUADIBLE_CALIDO' &&
          h.filter(i => i.tipo === 'VISITA_DOMICILIARIA' && i.efectiva).length >= 3 &&
          h.some(i => i.tipo === 'ASISTENCIA_EVENTO'),
        resultado: 'BASE'
      },
      // Regla 2: Persuadible frío + 5 contactos + encuesta positiva = Persuadible cálido
      {
        condicion: (p, h) => 
          p.clasificacion === 'PERSUADIBLE_FRIO' &&
          h.filter(i => i.efectiva).length >= 5 &&
          h.some(i => i.tipo === 'ENCUESTA' && i.resultado === 'FAVORABLE'),
        resultado: 'PERSUADIBLE_CALIDO'
      },
      // Regla 3: Indeciso + 2 contactos sin respuesta = Persuadible frío (necesita más trabajo)
      {
        condicion: (p, h) => 
          p.clasificacion === 'INDECISO' &&
          h.filter(i => i.tipo === 'INTENTO_CONTACTO' && !i.efectiva).length >= 2,
        resultado: 'PERSUADIBLE_FRIO'
      },
      // Regla 4: Base + 0 contactos en 30 días = Base (pero alerta de enfriamiento)
      {
        condicion: (p, h) => 
          p.clasificacion === 'BASE' &&
          h.length > 0 &&
          (new Date() - new Date(h[h.length - 1].fecha)) > (30 * 24 * 60 * 60 * 1000),
        resultado: 'BASE', // Se mantiene, pero se genera alerta
        alerta: 'ENFRIAMIENTO'
      },
      // Regla 5: Adversario blando + información negativa rival = Persuadible frío
      {
        condicion: (p, h) => 
          p.clasificacion === 'ADVERSARIO_BLANDO' &&
          h.some(i => i.tipo === 'INFORMACION_NEGATIVA_RIVAL' && i.efectiva),
        resultado: 'PERSUADIBLE_FRIO'
      }
    ];
    
    // Evaluar reglas en orden
    for (const regla of reglas) {
      if (regla.condicion(promovido, historialActualizado)) {
        return {
          nuevaClasificacion: regla.resultado,
          alerta: regla.alerta || null,
          motivo: this.describirMotivo(regla, historialActualizado),
          historial: historialActualizado
        };
      }
    }
    
    // Sin cambio
    return {
      nuevaClasificacion: promovido.clasificacion,
      alerta: null,
      motivo: 'Sin cambio: no se cumplen condiciones de transición',
      historial: historialActualizado
    };
  }

  static describirMotivo(regla, historial) {
    const visitas = historial.filter(i => i.tipo === 'VISITA_DOMICILIARIA' && i.efectiva).length;
    const eventos = historial.filter(i => i.tipo === 'ASISTENCIA_EVENTO').length;
    return `Transición por: ${visitas} visitas efectivas, ${eventos} eventos asistidos`;
  }

  /**
   * Calcula el "esfuerzo restante" para convertir a un promovido en Base
   */
  static calcularEsfuerzoRestante(promovido) {
    const esfuerzos = {
      'PERSUADIBLE_CALIDO': { visitasNecesarias: 2, eventosNecesarios: 1 },
      'PERSUADIBLE_FRIO': { visitasNecesarias: 5, encuestasNecesarias: 1 },
      'INDECISO': { contactosNecesarios: 3 },
      'ADVERSARIO_BLANDO': { informacionNecesaria: 2 }
    };
    
    const config = esfuerzos[promovido.clasificacion];
    if (!config) return { convertible: false, mensaje: 'Ya es Base o Adversario firme' };
    
    const historial = promovido.historialInteracciones || [];
    
    return {
      convertible: true,
      visitasFaltantes: Math.max(0, (config.visitasNecesarias || 0) - historial.filter(i => i.tipo === 'VISITA_DOMICILIARIA').length),
      eventosFaltantes: Math.max(0, (config.eventosNecesarios || 0) - historial.filter(i => i.tipo === 'ASISTENCIA_EVENTO').length),
      mensaje: `Necesita ${config.visitasNecesarias || 0} visitas más para convertirse en Base`
    };
  }
}

module.exports = { ClasificacionDinamica, CLASIFICACIONES };

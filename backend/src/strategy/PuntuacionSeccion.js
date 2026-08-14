// backend/src/strategy/PuntuacionSeccion.js

class MotorPriorizacionElectoral {
  
  /**
   * Calcula la puntuación de una sección electoral
   * Combina variables históricas, estructurales y de comportamiento
   */
  static calcularPuntuacion(seccionId, datos) {
    const {
      resultadosHistoricos = [],
      promovidos = [],
      interacciones = [],
      competencia = {},
      infraestructura = {},
      diasRestantes = 0
    } = datos;

    // 1. ÍNDICE DE COMPETITIVIDAD (25%)
    // Qué tan cerca estuvieron las elecciones pasadas
    const competitividad = this.calcularCompetitividad(resultadosHistoricos);
    
    // 2. DENSIDAD Y CALIDAD DE PROMOVIDOS (20%)
    // Cuántos tenemos y qué tan "calientes" están
    const densidadPromovidos = promovidos.length / infraestructura.listaNominal;
    const tasaConversion = this.calcularTasaConversion(promovidos, interacciones);
    
    // 3. POTENCIAL DE MOVILIZACIÓN (15%)
    // Qué % del padrón suele votar aquí
    const movilizacion = infraestructura.participacionHistorica / 100;
    
    // 4. FUERZA DE LA COMPETENCIA (10%)
    // Qué tan fuerte es el rival (inverso: mientras más fuerte, menos prioridad)
    const fuerzaRival = 1 - (competencia.gastoRival / competencia.gastoMaximo);
    
    // 5. LÍDERES DE OPINIÓN (10%)
    // Presencia de líderes aliados en la sección
    const lideres = infraestructura.lideresAliados / Math.max(infraestructura.lideresTotales, 1);
    
    // 6. ACCESIBILIDAD Y COSTO (10%)
    // Qué tan caro/difícil es llegar (inverso)
    const accesibilidad = 1 - (infraestructura.costoPromedioVisita / infraestructura.costoMaximo);
    
    // 7. FACTOR TEMPORAL (10%)
    // Ajuste por días restantes (más días = más margen de acción)
    const factorTemporal = Math.min(diasRestantes / 60, 1); // Normalizado a 60 días

    // FÓRMULA PONDERADA
    const puntuacion = (
      (competitividad * 0.25) +
      ((densidadPromovidos * 0.5 + tasaConversion * 0.5) * 0.20) +
      (movilizacion * 0.15) +
      (fuerzaRival * 0.10) +
      (lideres * 0.10) +
      (accesibilidad * 0.10) +
      (factorTemporal * 0.10)
    );

    return {
      seccionId,
      puntuacion: Math.round(puntuacion * 1000) / 1000,
      desglose: {
        competitividad,
        densidadPromovidos,
        tasaConversion,
        movilizacion,
        fuerzaRival,
        lideres,
        accesibilidad,
        factorTemporal
      },
      recomendacion: this.generarRecomendacion(puntuacion, datos)
    };
  }

  static calcularCompetitividad(resultados) {
    if (!resultados.length) return 0.5;
    
    // Promedio de diferencia porcentual entre 1° y 2° lugar
    const diferencias = resultados.map(r => r.diferenciaPrimerSegundo);
    const promedioDif = diferencias.reduce((a, b) => a + b, 0) / diferencias.length;
    
    // Normalizar: diferencia 0% = 1.0 (máxima prioridad), 30%+ = 0.0
    return Math.max(0, 1 - (promedioDif / 30));
  }

  static calcularTasaConversion(promovidos, interacciones) {
    const persuadibles = promovidos.filter(p => p.clasificacion === 'PERSUADIBLE');
    if (!persuadibles.length) return 0;
    
    const convertidos = interacciones.filter(i => 
      i.tipo === 'CONVERSION' && 
      i.clasificacionAnterior === 'PERSUADIBLE' &&
      i.clasificacionNueva === 'BASE'
    ).length;
    
    return convertidos / persuadibles.length;
  }

  static generarRecomendacion(puntuacion, datos) {
    if (puntuacion > 0.8) {
      return {
        nivel: 'MAXIMA_PRIORIDAD',
        accion: 'Desplegar estructura completa: evento masivo + casa de campaña + brigadistas',
        presupuestoSugerido: datos.topeGasto * 0.15
      };
    } else if (puntuacion > 0.6) {
      return {
        nivel: 'ALTA_PRIORIDAD',
        accion: 'Brigadistas + visitas domiciliarias concentradas',
        presupuestoSugerido: datos.topeGasto * 0.10
      };
    } else if (puntuacion > 0.4) {
      return {
        nivel: 'MEDIA_PRIORIDAD',
        accion: 'Contacto digital + volanteo selectivo',
        presupuestoSugerido: datos.topeGasto * 0.05
      };
    } else {
      return {
        nivel: 'BAJA_PRIORIDAD',
        accion: 'Mantenimiento mínimo, no invertir recursos principales',
        presupuestoSugerido: datos.topeGasto * 0.02
      };
    }
  }
}

module.exports = MotorPriorizacionElectoral;

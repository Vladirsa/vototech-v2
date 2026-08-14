// backend/src/eleccion/CentroComando.js

class CentroComandoElectoral {
  
  /**
   * Analiza patrones de incidencias en tiempo real
   */
  static analizarPatrones(incidencias, casillas) {
    const alertas = [];
    
    // PATRÓN 1: Cluster geográfico de incidencias similares
    const clusters = this.detectarClusters(incidencias, 2); // radio 2km
    clusters.forEach(cluster => {
      if (cluster.incidencias.length >= 3) {
        alertas.push({
          nivel: 'CRITICO',
          tipo: 'PATRON_SISTEMATICO',
          mensaje: `Detectadas ${cluster.incidencias.length} incidencias "${cluster.tipo}" en un radio de 2km. Posible operación coordinada.`,
          ubicacion: cluster.centroide,
          accionSugerida: 'Activar representantes generales. Alertar al ITE/INE. Desplegar abogados.',
          casillasAfectadas: cluster.casillas
        });
      }
    });
    
    // PATRÓN 2: Retrasos concentrados en casillas adversarias
    const retrasosAdversarias = casillas.filter(c => 
      c.horaApertura && 
      (new Date(c.horaApertura) - new Date(c.horaProgramada)) > 30 * 60 * 1000 &&
      c.prediccion === 'ADVERSARIO'
    );
    if (retrasosAdversarias.length > 3) {
      alertas.push({
        nivel: 'ALTO',
        tipo: 'RETRASO_SOSPECHOSO',
        mensaje: `${retrasosAdversarias.length} casillas adversarias con retraso >30 min en apertura.`,
        accionSugerida: 'Verificar material electoral. Solicitar acta de incidente al ITE.',
        casillas: retrasosAdversarias.map(c => c.id)
      });
    }
    
    // PATRÓN 3: Falta de representantes en casillas críticas
    const casillasSinRepresentante = casillas.filter(c => 
      c.esCritica && !c.representanteAsignado
    );
    if (casillasSinRepresentante.length > 0) {
      alertas.push({
        nivel: 'CRITICO',
        tipo: 'SIN_REPRESENTANTE',
        mensaje: `${casillasSinRepresentante.length} casillas críticas sin representante asignado.`,
        accionSugerida: 'Movilizar representantes de reserva inmediatamente.',
        casillas: casillasSinRepresentante.map(c => c.id)
      });
    }
    
    // PATRÓN 4: Diferencia anómala en conteo rápido vs casilla
    const anomaliasConteo = casillas.filter(c => 
      c.conteoRapido && c.conteoCasilla &&
      Math.abs(c.conteoRapido - c.conteoCasilla) / c.listaNominal > 0.05
    );
    if (anomaliasConteo.length > 2) {
      alertas.push({
        nivel: 'ALTO',
        tipo: 'ANOMALIA_CONTEO',
        mensaje: `${anomaliasConteo.length} casillas con diferencia >5% entre conteo rápido y casilla.`,
        accionSugerida: 'Solicitar recuento de votos. Documentar inconsistencias.',
        casillas: anomaliasConteo.map(c => c.id)
      });
    }
    
    return alertas;
  }

  static detectarClusters(incidencias, radioKm) {
    // Algoritmo simple de clustering por distancia
    const clusters = [];
    const procesadas = new Set();
    
    incidencias.forEach((inc, i) => {
      if (procesadas.has(i)) return;
      
      const cluster = {
        tipo: inc.tipo,
        incidencias: [inc],
        casillas: [inc.casilla_id],
        centroide: { lat: inc.latitud, lng: inc.longitud }
      };
      
      incidencias.forEach((otra, j) => {
        if (i === j || procesadas.has(j) || otra.tipo !== inc.tipo) return;
        
        const distancia = this.calcularDistancia(
          inc.latitud, inc.longitud,
          otra.latitud, otra.longitud
        );
        
        if (distancia <= radioKm) {
          cluster.incidencias.push(otra);
          cluster.casillas.push(otra.casilla_id);
          procesadas.add(j);
          
          // Recalcular centroide
          cluster.centroide.lat = (cluster.centroide.lat + otra.latitud) / 2;
          cluster.centroide.lng = (cluster.centroide.lng + otra.longitud) / 2;
        }
      });
      
      if (cluster.incidencias.length > 1) {
        clusters.push(cluster);
      }
      procesadas.add(i);
    });
    
    return clusters;
  }

  static calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /**
   * Proyección de resultado con simulación Monte Carlo
   */
  static simularEscenario(casillas, iteraciones = 10000) {
    const resultados = [];
    
    for (let i = 0; i < iteraciones; i++) {
      let votosCandidato = 0;
      let votosRival = 0;
      
      casillas.forEach(c => {
        // Añadir ruido aleatorio basado en margen de error histórico
        const margenError = c.margenErrorHistorico || 0.05;
        const variacion = (Math.random() - 0.5) * 2 * margenError;
        
        const votosC = Math.round(c.votosEsperadosCandidato * (1 + variacion));
        const votosR = Math.round(c.votosEsperadosRival * (1 - variacion));
        
        votosCandidato += votosC;
        votosRival += votosR;
      });
      
      resultados.push({
        candidato: votosCandidato,
        rival: votosRival,
        diferencia: votosCandidato - votosRival,
        ganador: votosCandidato > votosRival ? 'CANDIDATO' : 'RIVAL'
      });
    }
    
    const victorias = resultados.filter(r => r.ganador === 'CANDIDATO').length;
    const promedioDiferencia = resultados.reduce((a, r) => a + r.diferencia, 0) / iteraciones;
    
    return {
      probabilidadVictoria: victorias / iteraciones,
      margenVictoriaPromedio: Math.round(promedioDiferencia),
      escenarioOptimista: resultados.sort((a, b) => b.diferencia - a.diferencia)[0],
      escenarioPesimista: resultados.sort((a, b) => a.diferencia - b.diferencia)[0],
      intervaloConfianza95: this.calcularIntervaloConfianza(resultados)
    };
  }

  static calcularIntervaloConfianza(resultados) {
    const diferencias = resultados.map(r => r.diferencia).sort((a, b) => a - b);
    const n = diferencias.length;
    return {
      inferior: diferencias[Math.floor(n * 0.025)],
      superior: diferencias[Math.floor(n * 0.975)]
    };
  }
}

module.exports = CentroComandoElectoral;

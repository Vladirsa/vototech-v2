// backend/src/eleccion/CentroComando.js
function analizarPatronIncidencias(incidencias, casillas) {
  // Detectar patrones sospechosos
  const alertas = [];
  
  // Patrón 1: Múltiples incidencias del mismo tipo en casillas contiguas
  const clusters = detectarClustersGeograficos(incidencias, { radioKm: 2 });
  if (clusters.length > 0) {
    alertas.push({
      nivel: 'CRITICO',
      tipo: 'PATRON_SISTEMATICO',
      mensaje: `Detectadas ${clusters[0].incidencias.length} incidencias similares en un radio de 2km. Posible operación coordinada.`,
      accionSugerida: 'Activar representantes generales y alertar al ITE/INE'
    });
  }
  
  // Patrón 2: Retraso en apertura de casillas >30 min en zona adversaria
  const retrasos = casillas.filter(c => 
    c.horaApertura > c.horaProgramada + 30 && 
    c.prediccionGanador === 'ADVERSARIO'
  );
  if (retrasos.length > 3) {
    alertas.push({
      nivel: 'ALTO',
      tipo: 'RETRASO_SOSPECHOSO',
      mensaje: 'Retrasos concentrados en casillas adversarias. Verificar material electoral.'
    });
  }
  
  return alertas;
}

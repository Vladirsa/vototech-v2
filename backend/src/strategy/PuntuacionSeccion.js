// backend/src/strategy/PuntuacionSeccion.js
function calcularPuntuacionSeccion(seccionId, datos) {
  const {
    resultadosHistoricos,      // % ganado/perdido en 2018, 2021, 2024
    densidadPromovidos,        // Cuántos promovidos tenemos capturados
    tasaConversion,            // De persuadible a base (histórica)
    competencia,               // Fuerza del oponente (gasto, estructura)
    movilizacion,              // % de votantes que salen en esa sección
    lideresOpinion,            // Presencia de líderes aliados
    incidenciasRecientes,      // Conflictos, violencia, desinformación
    accesibilidad,             // Tiempo de traslado, infraestructura
    diasRestantes
  } = datos;

  return (
    (resultadosHistoricos.cercania * 0.25) +      // Secciones donde perdimos por <5%
    (densidadPromovidos * 0.15) +                 // Donde ya tenemos base
    (tasaConversion * 0.20) +                     // Eficiencia histórica
    (competencia.inversa * 0.10) +                // Donde el rival es débil
    (movilizacion.potencial * 0.15) +             // Alta participación histórica
    (lideresOpinion.presencia * 0.10) +           // Líderes que movilizan
    (diasRestantes.ajusteUrgencia * 0.05)         // Factor temporal decreciente
  );
}

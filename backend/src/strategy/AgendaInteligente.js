// backend/src/strategy/AgendaInteligente.js
function optimizarAgenda(candidatoId, fecha, restricciones) {
  // 1. Identificar secciones con mayor densidad de persuadibles cálidos
  const seccionesPrioritarias = getSeccionesPorClasificacion(
    candidatoId, 
    ['PERSUADIBLE_CALIDO', 'PERSUADIBLE_FRIO'],
    { limite: 5 }
  );
  
  // 2. Calcular "punto óptimo" geográfico (centroide ponderado)
  const ubicacionOptima = calcularCentroidePonderado(seccionesPrioritarias);
  
  // 3. Sugerir tipo de evento según perfil de la zona
  const tipoEvento = sugerirTipoEvento(ubicacionOptima.demografia);
  // Ej: Zona rural -> caminata + mitin pequeño
  // Ej: Zona urbana joven -> evento digital + activación en plaza
  
  // 4. Calcular ROI estimado del evento
  const roi = estimarConversion(ubicacionOptima, tipoEvento, diasRestantes);
  
  return {
    sugerencia: {
      ubicacion: ubicacionOptima,
      tipo: tipoEvento,
      hora: sugerirHorario(ubicacionOptima.historialAsistencia),
      promovidosObjetivo: seccionesPrioritarias.flatMap(s => s.promovidos)
    },
    roiEstimado: roi,
    justificacion: generarJustificacionNarrativa(roi, seccionesPrioritarias)
  };
}

// backend/src/comms/WhatsAppSegmentado.js
function generarMensaje(promovidoId, contexto) {
  const promovido = getPromovido(promovidoId);
  const seccion = getSeccion(promovido.seccionId);
  
  // Segmentación por perfil
  const segmento = determinarSegmento(promovido);
  
  const plantillas = {
    PERSUADIBLE_JOVEN: {
      tono: 'empoderador',
      contenido: `Hola ${promovido.nombre}, en ${seccion.nombre} la juventud está decidiendo el cambio. ¿Sabías que [propuesta relevante para jóvenes]? Te invito a conocer más: [link]`,
      horarioOptimo: '19:00-21:00',
      frecuenciaMax: 2 // mensajes por semana
    },
    BASE_MAYOR: {
      tono: 'respetuoso',
      contenido: `Buen día ${promovido.nombre}, le confirmo que el evento de ${seccion.proximoEvento.fecha} será a las ${seccion.proximoEvento.hora}. Le esperamos.`,
      horarioOptimo: '10:00-12:00',
      frecuenciaMax: 1
    }
  };
  
  return plantillas[segmento];
}

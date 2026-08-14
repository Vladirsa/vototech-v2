// backend/src/comms/WhatsAppSegmentado.js

const { Twilio } = require('twilio');
const client = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

class WhatsAppElectoral {
  
  // Límites de frecuencia por segmento (mensajes por semana)
  static LIMITES_FRECUENCIA = {
    BASE_FUERTE: 1,
    BASE: 2,
    PERSUADIBLE_CALIDO: 3,
    PERSUADIBLE_FRIO: 2,
    INDECISO: 2,
    ADVERSARIO_BLANDO: 1,
    ADVERSARIO: 0, // No enviar
    ADVERSARIO_IRREDUCTIBLE: 0 // No enviar
  };

  static async enviarMensaje(promovidoId, contexto = {}) {
    const promovido = await db.query(
      'SELECT * FROM promovidos WHERE id = $1', 
      [promovidoId]
    );
    
    const segmento = promovido.clasificacion;
    const limite = this.LIMITES_FRECUENCIA[segmento];
    
    // 1. VALIDAR FRECUENCIA
    const enviosSemana = await this.contarEnviosSemana(promovidoId);
    if (enviosSemana >= limite) {
      return { 
        enviado: false, 
        razon: `Límite de frecuencia alcanzado (${limite}/semana) para segmento ${segmento}` 
      };
    }
    
    // 2. GENERAR MENSAJE PERSONALIZADO
    const mensaje = this.generarMensajePersonalizado(promovido, contexto);
    
    // 3. VALIDAR HORARIO ÓPTIMO
    const horaEnvio = this.calcularHorarioOptimo(promovido, segmento);
    if (new Date() < horaEnvio) {
      // Programar para más tarde
      await this.programarEnvio(promovidoId, mensaje, horaEnvio);
      return { enviado: false, programado: true, horaEnvio };
    }
    
    // 4. ENVIAR VIA TWILIO
    try {
      const message = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${promovido.telefono}`,
        body: mensaje.contenido,
        mediaUrl: mensaje.mediaUrl || undefined
      });
      
      // 5. REGISTRAR ENVÍO
      await db.query(
        `INSERT INTO whatsapp_envios (promovido_id, tenant_id, contenido, segmento, 
          hora_envio, message_sid, estado, tipo_mensaje) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [promovidoId, promovido.tenant_id, mensaje.contenido, segmento, 
         new Date(), message.sid, 'ENVIADO', contexto.tipo || 'GENERAL']
      );
      
      return { enviado: true, messageSid: message.sid };
      
    } catch (error) {
      await db.query(
        `INSERT INTO whatsapp_envios (promovido_id, tenant_id, contenido, segmento, 
          hora_envio, estado, error) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [promovidoId, promovido.tenant_id, mensaje.contenido, segmento, 
         new Date(), 'FALLIDO', error.message]
      );
      return { enviado: false, error: error.message };
    }
  }

  static generarMensajePersonalizado(promovido, contexto) {
    const { nombre, seccion_id, clasificacion } = promovido;
    const seccion = contexto.seccion || {};
    
    const plantillas = {
      PERSUADIBLE_CALIDO: {
        tono: 'empoderador',
        contenido: `¡Hola ${nombre.split(' ')[0]}! 👋 En tu sección ${seccion.numero || ''} la diferencia en la última elección fue de solo ${seccion.diferenciaUltima || 'pocos'} votos. Tu participación puede ser la que defina el resultado. Te invito a conocer nuestras propuestas: ${contexto.linkPropuestas || '[link]'}`,
        horario: '19:00-21:00'
      },
      PERSUADIBLE_FRIO: {
        tono: 'informativo',
        contenido: `Buen día ${nombre.split(' ')[0]}. Soy del equipo de ${contexto.nombreCandidato || 'la campaña'}. Me gustaría conocer tus principales preocupaciones sobre ${seccion.temasPrincipales?.join(', ') || 'nuestra comunidad'}. ¿Tendrías 5 minutos para una breve encuesta? Responde SI para recibir el enlace.`,
        horario: '10:00-12:00'
      },
      BASE: {
        tono: 'movilizador',
        contenido: `${nombre.split(' ')[0]}, ¡te necesitamos! 🗳️ El día de la elección es ${contexto.fechaEleccion || 'próximo'}. Tu casilla es ${seccion.casilla || '[ubicación]'} y abre a las 8:00 AM. ¿Podemos contar contigo para acompañar a 3 personas más a votar? Responde SI y te envío los detalles.`,
        horario: '18:00-20:00'
      }
    };
    
    return plantillas[clasificacion] || plantillas.PERSUADIBLE_FRIO;
  }

  static calcularHorarioOptimo(promovido, segmento) {
    const horarios = {
      'BASE_FUERTE': { inicio: 10, fin: 12 },
      'BASE': { inicio: 18, fin: 20 },
      'PERSUADIBLE_CALIDO': { inicio: 19, fin: 21 },
      'PERSUADIBLE_FRIO': { inicio: 10, fin: 12 },
      'INDECISO': { inicio: 14, fin: 16 }
    };
    
    const config = horarios[segmento] || { inicio: 10, fin: 20 };
    const ahora = new Date();
    const horaSugerida = new Date(ahora);
    horaSugerida.setHours(config.inicio, 0, 0);
    
    if (ahora > horaSugerida) {
      // Si ya pasó, programar para mañana a la misma hora
      horaSugerida.setDate(horaSugerida.getDate() + 1);
    }
    
    return horaSugerida;
  }

  static async contarEnviosSemana(promovidoId) {
    const result = await db.query(
      `SELECT COUNT(*) FROM whatsapp_envios 
       WHERE promovido_id = $1 
       AND hora_envio >= NOW() - INTERVAL '7 days'`,
      [promovidoId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = WhatsAppElectoral;

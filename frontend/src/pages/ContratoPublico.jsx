export default function ContratoPublico() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-slate-300">
        <div className="text-center space-y-1">
          <div className="text-3xl">🗳️</div>
          <h1 className="text-xl font-black text-white">Contrato de Prestación de Servicios</h1>
          <p className="text-xs text-slate-500">Plataforma Tecnológica VotoTech</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
          Este es el texto de referencia del contrato — al registrar tu campaña, firmas electrónicamente una versión con tus datos específicos ya llenados (nombre de campaña, tipo de elección, etc.), conforme a la Cláusula Décima Segunda.
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Declaraciones</h2>
          <p className="text-xs leading-relaxed">EL PRESTADOR declara ser una plataforma tecnológica de gestión de campañas electorales. EL CLIENTE declara ser candidato o representante legalmente facultado de su campaña, con capacidad legal para obligarse. Ambas partes declaran conocer y sujetarse a la LGIPE, la legislación electoral local, y la LFPDPPP.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Primera. Objeto</h2>
          <p className="text-xs leading-relaxed">EL PRESTADOR otorga a EL CLIENTE una licencia de uso, no exclusiva e intransferible, de la plataforma VotoTech, para su uso exclusivo en la operación interna de su campaña.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Segunda. Vigencia y renovación</h2>
          <p className="text-xs leading-relaxed">El contrato tiene vigencia conforme al plan contratado, y se renueva automáticamente por periodos iguales salvo aviso de no renovación con 15 días de anticipación.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Tercera. Contraprestación y mora</h2>
          <p className="text-xs leading-relaxed">El cliente cubre la contraprestación del plan contratado. La falta de pago faculta a suspender el servicio, y genera un interés moratorio del 2% mensual sobre el saldo insoluto.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Cuarta. Obligaciones del cliente</h2>
          <ul className="text-xs leading-relaxed list-disc pl-4 space-y-1">
            <li>Uso lícito, conforme a la legislación electoral.</li>
            <li>No importar el padrón electoral del INE.</li>
            <li>No usar la plataforma para compra o coacción del voto.</li>
            <li>Contar con su propio Aviso de Privacidad frente a los ciudadanos que capture.</li>
            <li>No hacer ingeniería inversa ni copiar la metodología de la plataforma.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Quinta a Undécima</h2>
          <p className="text-xs leading-relaxed">Indemnización por uso indebido, límite de responsabilidad (máximo 3 meses de pago), disponibilidad sin garantía de interrupción cero, confidencialidad mutua, propiedad de datos (del cliente) y del software (de VotoTech), caso fortuito, y terminación sin devolución en cancelación anticipada.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Décima Segunda. Firma electrónica</h2>
          <p className="text-xs leading-relaxed">El contrato se suscribe mediante firma electrónica simple (nombre completo + confirmación activa), conforme a los Art. 89-114 del Código de Comercio — con la misma validez que la firma autógrafa para este contrato en particular. Se registra fecha, hora, IP, y una huella digital (hash) como evidencia. Esta firma NO es la e.firma del SAT ni la sustituye.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Décima Tercera. Jurisdicción</h2>
          <p className="text-xs leading-relaxed">Las partes se someten a las leyes federales de México y a los tribunales competentes correspondientes.</p>
        </section>

        <p className="text-[10px] text-slate-600 text-center pt-4">VotoTech — Este texto es de referencia general; tu contrato firmado incluye tus datos específicos y puede descargarse desde tu panel una vez aprobada tu cuenta.</p>
      </div>
    </div>
  );
}

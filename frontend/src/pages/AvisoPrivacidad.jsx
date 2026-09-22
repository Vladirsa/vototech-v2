export default function AvisoPrivacidad() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-slate-300">
        <div className="text-center space-y-1">
          <div className="text-3xl">🔒</div>
          <h1 className="text-xl font-black text-white">Aviso de Privacidad Integral</h1>
          <p className="text-xs text-slate-500">Plataforma Digital de Gestión Electoral — VotoTech</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
          En cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento, Roberto Vladimir Rivera Sánchez, RFC RISR830214R64, con domicilio en Apizaco, Tlaxcala ("VotoTech"), pone a tu disposición este Aviso de Privacidad Integral.
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">1. Dos figuras distintas: quién es responsable de qué dato</h2>
          <p className="text-xs leading-relaxed">Este Aviso distingue dos situaciones, porque la ley las trata de forma distinta.</p>
          <p className="text-xs leading-relaxed"><strong className="text-slate-200">a) Datos de quienes usan la plataforma</strong> — candidato, jefe de campaña, coordinadores y promotores que crean una cuenta en VotoTech. Para estos datos, VotoTech es el RESPONSABLE del tratamiento en los términos de la LFPDPPP.</p>
          <p className="text-xs leading-relaxed"><strong className="text-slate-200">b) Datos de ciudadanos contactados por una campaña ("promovidos")</strong> — cuando un candidato o su equipo capturan datos de un ciudadano dentro de la plataforma (nombre, teléfono, domicilio, preferencia política), el RESPONSABLE de ese dato es el candidato/campaña que lo recaba. VotoTech actúa únicamente como ENCARGADO del tratamiento (Art. 3, fracción IX de la LFPDPPP). Cada candidato es responsable de contar con su propio aviso de privacidad frente a los ciudadanos que contacta, y de obtener el consentimiento correspondiente conforme a la ley.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">2. Datos que se recaban (usuarios de la plataforma)</h2>
          <ul className="text-xs leading-relaxed list-disc pl-4 space-y-1">
            <li>Datos de identificación: nombre, correo electrónico, teléfono.</li>
            <li>Datos de acceso: usuario, contraseña (cifrada), rol dentro de la campaña.</li>
            <li>Datos de uso: registros de actividad dentro del sistema, con fines de seguridad y auditoría.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">3. Datos que se recaban (ciudadanos "promovidos")</h2>
          <p className="text-xs leading-relaxed">Cuando el equipo de campaña captura a un ciudadano dentro de la plataforma, puede incluir:</p>
          <ul className="text-xs leading-relaxed list-disc pl-4 space-y-1">
            <li>Datos de identificación y contacto: nombre, teléfono, domicilio o calle aproximada.</li>
            <li>Datos de la credencial para votar (INE), cuando el promotor usa la función de lectura de credencial con inteligencia artificial para autocompletar el formulario. Esta captura SIEMPRE requiere que el ciudadano autorice expresamente el uso de su credencial para este fin — nunca se procesa sin ese consentimiento explícito, y el dato se usa únicamente para llenar el formulario; no se conserva la imagen de la credencial una vez completado el registro.</li>
            <li>Preferencia política declarada — dato sensible conforme a la sección 4 de este Aviso.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">4. Datos sensibles — advertencia especial</h2>
          <p className="text-xs leading-relaxed">La LFPDPPP considera la opinión política como un DATO SENSIBLE (Art. 3, fracción VI). La información de afiliación o preferencia partidista de los "promovidos" tiene este carácter. Su tratamiento requiere el consentimiento expreso y por escrito del titular, obligación que corresponde al candidato/campaña como responsable de ese dato.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">5. Finalidades del tratamiento</h2>
          <p className="text-xs leading-relaxed"><strong className="text-slate-200">Finalidades primarias</strong> (necesarias para el servicio): proveer acceso a la plataforma y sus funcionalidades; autenticación y control de acceso por rol; soporte técnico y comunicación operativa; facturación y cobro del servicio.</p>
          <p className="text-xs leading-relaxed"><strong className="text-slate-200">Finalidades secundarias</strong> (puedes oponerte a estas sin afectar el servicio): mejora del producto y análisis estadístico agregado y anonimizado; comunicación de nuevas funcionalidades o promociones.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">6. Transferencias de datos</h2>
          <p className="text-xs leading-relaxed">Para operar el servicio, ciertos datos se comparten con proveedores tecnológicos que actúan como encargados, únicamente para los fines aquí descritos:</p>
          <ul className="text-xs leading-relaxed list-disc pl-4 space-y-1">
            <li>Supabase Inc. (alojamiento de base de datos).</li>
            <li>Render Services Inc. y Vercel Inc. (alojamiento de la aplicación).</li>
            <li>Twilio Inc. (envío de mensajes de WhatsApp, cuando el candidato activa esta función).</li>
            <li>Anthropic PBC (asistente de redacción y lectura de credencial con inteligencia artificial, cuando el usuario lo utiliza).</li>
          </ul>
          <p className="text-xs leading-relaxed">No se venden, rentan ni transfieren datos personales a terceros con fines distintos a la operación del servicio.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">7. Derechos ARCO — cómo ejercerlos</h2>
          <p className="text-xs leading-relaxed">Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte (derechos ARCO) al tratamiento de tus datos personales, así como a revocar tu consentimiento. Puedes ejercerlos por cualquiera de estos medios:</p>
          <ul className="text-xs leading-relaxed list-disc pl-4 space-y-1">
            <li>Correo electrónico: <strong className="text-slate-200">soporte@vototech.mx</strong> — indicando tu nombre completo y la campaña a la que perteneces.</li>
            <li>WhatsApp: el número de contacto de soporte de tu campaña — enviando un mensaje con tu nombre completo y el motivo de tu solicitud.</li>
          </ul>
          <p className="text-xs leading-relaxed">En ambos casos, se te pedirá documentación que acredite tu identidad antes de procesar la solicitud, y se te dará respuesta dentro de los plazos que marca la LFPDPPP.</p>
          <p className="text-xs leading-relaxed">Si tu solicitud se refiere a datos capturados por una campaña específica (un "promovido"), deberás dirigirte directamente al candidato/campaña responsable de ese dato, conforme a la sección 1(b).</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">8. Uso de cookies y tecnologías similares</h2>
          <p className="text-xs leading-relaxed">La plataforma utiliza almacenamiento local del navegador (localStorage) y cookies de sesión estrictamente necesarias para el funcionamiento del servicio (mantener la sesión iniciada). No se utilizan cookies de rastreo publicitario de terceros.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">9. Cambios a este Aviso de Privacidad</h2>
          <p className="text-xs leading-relaxed">Este Aviso puede actualizarse ante cambios en la normatividad o en el servicio. La versión vigente estará siempre disponible dentro de la plataforma, en esta misma dirección.</p>
        </section>

        <p className="text-[10px] text-slate-600 text-center pt-4">Última actualización: septiembre 2026</p>
        <p className="text-[10px] text-center">
          <a href="/terminos" className="text-indigo-400 underline">Ver Términos y Condiciones →</a>
          {' · '}
          <a href="/contrato" className="text-indigo-400 underline">Ver Contrato de Prestación de Servicios →</a>
        </p>
      </div>
    </div>
  );
}

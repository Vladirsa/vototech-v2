export default function PosturaLegal() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-slate-300">
        <div className="text-center space-y-1">
          <div className="text-3xl">⚖️</div>
          <h1 className="text-xl font-black text-white">Postura Legal de VotoTech</h1>
          <p className="text-xs text-slate-500">Documento público — julio 2026</p>
        </div>

        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-300">
          Este documento existe para que cualquier candidato, autoridad electoral, o persona interesada
          pueda conocer con toda claridad las posturas legales firmes de la plataforma, sin ambigüedad.
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">1. El padrón electoral del INE NO se importa</h2>
          <p className="text-xs leading-relaxed">
            VotoTech no importa, carga, ni distribuye el padrón electoral oficial del Instituto Nacional Electoral
            bajo ninguna circunstancia. Hacerlo constituye un delito electoral conforme a la Ley General de
            Instituciones y Procedimientos Electorales (LGIPE). Esta es una postura de diseño, no una limitación
            técnica temporal — el sistema no tiene, ni tendrá, un mecanismo para cargar esta información.
          </p>
          <p className="text-xs leading-relaxed">
            La alternativa legal que ofrece la plataforma es que cada candidato construya su propia base de
            contactos ("promovidos") a partir del trabajo real de su equipo en campo — tocando puertas,
            haciendo llamadas, en eventos — nunca a partir de una lista oficial de electores.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">2. El voto es secreto, siempre</h2>
          <p className="text-xs leading-relaxed">
            La plataforma no permite, bajo ninguna función o configuración, verificar o inferir por quién votó
            una persona específica. El voto es secreto por mandato constitucional, y intentar averiguarlo —
            sin importar cómo se disfrace la función — puede constituir coacción o compra de voto.
          </p>
          <p className="text-xs leading-relaxed">
            El módulo de "Día de la Elección" únicamente permite verificar <strong>asistencia</strong> a votar
            (un dato público, observable por cualquiera en la casilla), nunca intención de voto.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">3. El módulo de Incidencias es para denunciar, no para facilitar</h2>
          <p className="text-xs leading-relaxed">
            El módulo que permite reportar compra de voto, violencia, o irregularidades existe exclusivamente
            para documentar y denunciar estas conductas ante la autoridad electoral — nunca para facilitarlas,
            coordinarlas, o llevar un registro de ellas con fines distintos a la denuncia.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">4. Datos sensibles — opinión política</h2>
          <p className="text-xs leading-relaxed">
            La Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) considera
            la opinión política como un dato sensible (Art. 3, fracción VI). VotoTech exige que cada campaña
            obtenga el consentimiento explícito de cada ciudadano antes de registrar su preferencia partidista,
            y actúa como Encargado técnico del tratamiento — nunca como Responsable de esos datos frente a los
            ciudadanos, responsabilidad que corresponde a cada candidato.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">5. Actos anticipados de campaña</h2>
          <p className="text-xs leading-relaxed">
            La plataforma incluye una alerta automática cuando se registra propaganda (bardas, espectaculares,
            mantas) con fecha anterior al inicio oficial de campaña configurado por cada candidato — un recordatorio
            técnico, no un sustituto del criterio legal de un abogado electoral, sobre un tema que las autoridades
            electorales locales han sancionado activamente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">6. Marco legal que se respeta</h2>
          <ul className="text-xs leading-relaxed list-disc list-inside space-y-1">
            <li>Ley General de Instituciones y Procedimientos Electorales (LGIPE)</li>
            <li>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</li>
            <li>Legislación electoral del Estado de Tlaxcala y normatividad del Instituto Tlaxcalteca de Elecciones (ITE)</li>
            <li>Constitución Política de los Estados Unidos Mexicanos</li>
          </ul>
        </section>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-500">
          Este documento describe el diseño y las políticas de la plataforma. No constituye asesoría legal.
          Cada candidato es responsable de su propio cumplimiento de la legislación electoral aplicable.
          Para más detalle, consulta los{' '}
          <a href="/terminos" className="text-indigo-400 underline">Términos y Condiciones y el Aviso de Privacidad</a>.
        </div>

        <p className="text-[10px] text-slate-600 text-center pt-2">Última actualización: julio 2026</p>
      </div>
    </div>
  );
}

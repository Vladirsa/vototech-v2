export default function TerminosPublico() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-slate-300">
        <div className="text-center space-y-1">
          <div className="text-3xl">🗳️</div>
          <h1 className="text-xl font-black text-white">Términos y Condiciones</h1>
          <p className="text-xs text-slate-500">y Aviso de Privacidad — VotoTech</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
          Este sistema está hecho con el fin de ayudar a la organización interna de campañas electorales. La información capturada es utilizada con fines estadísticos y de organización territorial para el equipo de campaña, conforme a lo descrito abajo.
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">1. Descripción del servicio</h2>
          <p className="text-xs leading-relaxed">VotoTech es una plataforma tecnológica de gestión operativa para campañas electorales (software como servicio). Provee herramientas de organización territorial, seguimiento de estructura y análisis estadístico. VotoTech NO es una autoridad electoral, no sustituye las obligaciones legales del candidato ante el INE o el organismo local, y no garantiza resultado electoral alguno.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">2. Uso permitido — límites legales</h2>
          <p className="text-xs leading-relaxed">El uso de la plataforma debe cumplir la Ley General de Instituciones y Procedimientos Electorales, la legislación electoral estatal, y la LFPDPPP. Queda prohibido: importar el padrón electoral oficial del INE, usar la plataforma para compra o coacción del voto, intentar verificar por quién votó una persona (el voto es secreto por ley), o usar la mensajería masiva fuera de fines legítimos de campaña.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">3. Datos personales — Aviso de Privacidad</h2>
          <p className="text-xs leading-relaxed">Para los datos de quien usa la plataforma (candidato, coordinadores, promotores), VotoTech es el Responsable del tratamiento. Para los datos de ciudadanos capturados por una campaña ("promovidos"), el candidato es el Responsable — VotoTech actúa solo como Encargado técnico. La opinión política es un dato sensible; cada campaña debe contar con su propio aviso de privacidad y consentimiento frente a los ciudadanos que contacta.</p>
          <p className="text-xs leading-relaxed">Derechos ARCO (Acceso, Rectificación, Cancelación, Oposición): puede ejercerlos escribiendo a soporte@vototech.mx.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">4. Disponibilidad y naturaleza de la información</h2>
          <p className="text-xs leading-relaxed">El servicio no garantiza disponibilidad ininterrumpida — depende de proveedores externos de infraestructura. Las proyecciones y estadísticas del módulo de Reportes son estimaciones basadas en los datos capturados, no garantías de resultado ni asesoría profesional.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">5. Limitación de responsabilidad</h2>
          <p className="text-xs leading-relaxed">VotoTech no es responsable por el uso indebido de la plataforma por parte del cliente o su equipo, interrupciones de proveedores externos, decisiones de campaña basadas en la información del sistema, ni por sanciones derivadas de infracciones a la legislación electoral cometidas por el cliente.</p>
        </section>

        <p className="text-[10px] text-slate-600 text-center pt-4">Última actualización: julio 2026 · Este resumen no sustituye el Contrato de Prestación de Servicios completo, disponible para descarga dentro de la plataforma tras el registro.</p>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';

/**
 * 🆕 Página pública de inicio — antes vototech.com.mx mandaba
 * directo al login, sin ninguna presentación. Esta es la primera
 * impresión real para cualquier prospecto que llegue al dominio.
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 md:px-8 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗳️</span>
          <span className="font-black text-lg">VotoTech</span>
        </div>
        <Link to="/login" className="text-sm font-bold text-slate-300 hover:text-white">Iniciar sesión →</Link>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center px-4 py-14 md:py-20">
        <h1 className="text-3xl md:text-5xl font-black leading-tight">
          El sistema operativo<br />de tu campaña electoral
        </h1>
        <p className="text-slate-400 mt-4 max-w-2xl mx-auto text-sm md:text-base">
          Territorio, promotores, agenda, y el Día de la Elección — todo en un solo lugar,
          hecho en México para la realidad electoral mexicana. Funciona incluso sin internet en campo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link to="/cotizar" className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-black text-sm shadow-xl shadow-indigo-500/30">
            💰 Cotiza tu campaña
          </Link>
          <a href="https://wa.me/" target="_blank" rel="noreferrer" className="px-8 py-3.5 rounded-xl bg-slate-800 font-bold text-sm border border-slate-700">
            📲 Pídenos una demo
          </a>
        </div>
      </div>

      {/* Capacidades reales — nada inventado, todo lo que ya existe */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-center text-xs font-bold text-indigo-400 uppercase mb-6">Lo que ya tienes con VotoTech</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['🗺️', 'Mapa Electoral', 'Por sección real, con histórico de resultados y motor de priorización.'],
            ['🤝', 'CRM de Promovidos', 'Lee credenciales con IA, detecta duplicados, y funciona sin internet en campo.'],
            ['🗂️', 'Estructura completa', 'Organigrama de 6 niveles, cobertura de casillas, y ranking de coordinadores.'],
            ['🗳️', 'Día de la Elección', 'Captura de actas en vivo, avance de voto por sección, y simulador de entrenamiento.'],
            ['📢', 'Comunicación real', 'Mensajes de WhatsApp segmentados, repartidos entre tu equipo, con enlaces de confirmación.'],
            ['📴', 'Funciona sin señal', 'Lo que capturas en campo se guarda y se sincroniza solo en cuanto regresa la conexión.'],
          ].map(([icono, titulo, desc]) => (
            <div key={titulo} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="text-3xl mb-2">{icono}</div>
              <div className="font-bold text-sm mb-1">{titulo}</div>
              <div className="text-xs text-slate-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cumplimiento legal */}
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
          <div className="text-sm font-bold text-emerald-400 mb-1">⚖️ Construido respetando la ley, no a pesar de ella</div>
          <p className="text-xs text-slate-400">
            No importa el padrón electoral oficial, nunca infiere por quién votó nadie, y respeta la LFPDPPP en cada
            captura de datos personales.
          </p>
        </div>
      </div>

      {/* CTA final */}
      <div className="max-w-2xl mx-auto text-center px-4 py-14">
        <h2 className="text-xl font-black mb-3">¿Listo para organizar tu campaña de verdad?</h2>
        <Link to="/cotizar" className="inline-block px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-black text-sm shadow-xl shadow-indigo-500/30">
          💰 Ver mi precio ahora
        </Link>
      </div>

      <div className="text-center text-[10px] text-slate-600 pb-8">
        <Link to="/terminos" className="hover:text-slate-400">Términos y Condiciones</Link>
        {' · '}
        <Link to="/postura-legal" className="hover:text-slate-400">Postura Legal</Link>
      </div>
    </div>
  );
}

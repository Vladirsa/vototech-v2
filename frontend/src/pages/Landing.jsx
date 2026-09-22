import { Link } from 'react-router-dom';

/**
 * 🆕 Página pública de inicio — antes vototech.com.mx mandaba
 * directo al login, sin ninguna presentación. Esta es la primera
 * impresión real para cualquier prospecto que llegue al dominio.
 *
 * 🆕 Sept 2026 — Reescrita para reflejar TODO lo que el sistema ya
 * hace de verdad (antes solo mostraba 6 tarjetas genéricas, y
 * varios módulos construidos — Marketing con IA, Monitoreo de
 * Redes, Inteligencia Electoral completa, Administración y
 * Cumplimiento — ni aparecían). Cada bullet de MODULOS abajo
 * corresponde 1 a 1 con una pestaña real que existe hoy en el
 * código (ver AdministracionCumplimiento.jsx, InteligenciaElectoral.jsx,
 * MovilizacionOperacion.jsx, Marketing.jsx) — si se agrega o quita
 * una pestaña ahí, hay que reflejarlo aquí también.
 *
 * También se agregó PROXIMOS_SERVICIOS: son ideas de expansión de
 * negocio ya definidas (ver banco de ideas del proyecto) pero AÚN
 * NO construidas — se muestran como "en diseño", nunca mezcladas
 * con los módulos reales de arriba, para no prometer algo que el
 * candidato no puede usar hoy.
 */

const MODULOS = [
  {
    categoria: '🗺️ Mapa y Territorio',
    items: [
      'Mapa Electoral por sección, con histórico de elecciones pasadas',
      'Estructura Electoral en 6 niveles (Estado → Distrito → Municipio → Sección → Casilla → Responsable)',
      'Semáforo de salud por sección: sano, sobrecargado, subutilizado o sin equipo aún',
      'Cobertura de casillas y ranking de coordinadores',
    ],
  },
  {
    categoria: '🤝 Movilización y Operación',
    items: [
      'CRM de Promovidos: registro de ciudadanos con lectura de credencial por IA',
      'Detección automática de registros duplicados',
      'Agenda de eventos y actividades del candidato',
      'Logística de recorridos y caminatas ("1 zoom, muchas casas")',
      'Reporte de incidencias georreferenciado, para documentar y denunciar',
    ],
  },
  {
    categoria: '🧠 Inteligencia Electoral',
    items: [
      'Centro de Mando con indicadores en tiempo real',
      'Reportes ejecutivos exportables',
      'Priorización de secciones — dónde enfocar el esfuerzo del equipo',
      'Estadística y Probabilidad: proyecciones basadas en históricos reales, nunca inventadas',
      'Bitácora diaria de campaña',
      'Centro de Decisiones para el candidato y su equipo cercano',
    ],
  },
  {
    categoria: '📢 Marketing y Comunicación',
    items: [
      'Envío segmentado de mensajes de WhatsApp, repartido entre varios números',
      'Plantillas y biblioteca de mensajes reutilizables',
      'Centro IA: redacción de discursos, argumentario, mensaje del día y storytelling ciudadano',
      'Redes Sociales: calendario y seguimiento de publicaciones',
      'Monitoreo de Redes: reporte de menciones negativas, notas falsas y tendencias detectadas en campo',
    ],
  },
  {
    categoria: '🗳️ Día de la Elección',
    items: [
      'Centro de Mando el día D, con captura de resultados en vivo por casilla',
      'Foto del acta y validación aritmética automática contra los resultados oficiales',
      'Avance de participación por sección en tiempo real',
    ],
  },
  {
    categoria: '⚖️ Administración y Cumplimiento',
    items: [
      'Jurídico: alertas de actos anticipados de campaña y calendario de plazos INE/OPLE',
      'Administrativo: gastos, ingresos, activos, bodega de propaganda y tope de gasto',
      'Respaldos automáticos diarios de la información de la campaña',
      'Documentos legales: contrato, términos y aviso de privacidad siempre a la mano',
    ],
  },
  {
    categoria: '📴 Hecho para campo, no para oficina',
    items: [
      'Funciona sin señal — lo capturado en campo se sincroniza solo al recuperar conexión',
      'Diseñado primero para celular Android de gama económica',
      'Roles y permisos por puesto: cada quien ve solo lo que le corresponde',
      'Alertas automáticas por WhatsApp cuando un coordinador lleva días sin actividad',
    ],
  },
];

const PROXIMOS_SERVICIOS = [
  {
    ic: '🏛️',
    titulo: 'Estructura partidista permanente',
    desc: 'Para partidos que necesitan organización territorial todo el año, no solo en campaña: afiliación, asambleas internas, capacitación de cuadros.',
  },
  {
    ic: '🏙️',
    titulo: 'Gestión de gobierno municipal',
    desc: 'Para presidentes municipales ya electos: mapeo de necesidades por sección, seguimiento de promesas de campaña, gestión de comités vecinales y obra pública.',
  },
  {
    ic: '📊',
    titulo: 'Consultoría política y análisis de datos',
    desc: 'Estudios de opinión continuos, simulaciones electorales, y análisis de resultados pasados para candidatos que se preparan con anticipación.',
  },
  {
    ic: '🌱',
    titulo: 'Precampaña permanente',
    desc: 'Construcción gradual de estructura territorial y base de voluntarios, meses o años antes de que arranque la campaña oficial.',
  },
  {
    ic: '🏢',
    titulo: 'Versión corporativa',
    desc: 'La misma organización territorial, sin branding político — para empresas de venta directa, cadenas retail y organizaciones sociales.',
  },
  {
    ic: '🎓',
    titulo: 'Educación cívica y transparencia',
    desc: 'Herramientas para observadores electorales y ciudadanos que dan seguimiento a promesas de campaña — sociedad civil, no partidos.',
  },
];

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

      {/* Módulos reales — organizados por categoría, todos ya construidos y en uso */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-center text-xs font-bold text-indigo-400 uppercase mb-1">Todo lo que ya tienes con VotoTech</h2>
        <p className="text-center text-xs text-slate-500 mb-6">7 áreas de trabajo, ya construidas y en uso — no es una promesa, es lo que ves al entrar</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULOS.map((grupo) => (
            <div key={grupo.categoria} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="font-bold text-sm mb-3">{grupo.categoria}</div>
              <ul className="space-y-1.5">
                {grupo.items.map((item) => (
                  <li key={item} className="text-xs text-slate-400 flex gap-2">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
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

      {/* Próximos servicios — en diseño, claramente separados de los módulos reales de arriba */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-center text-xs font-bold text-purple-400 uppercase mb-1">🔜 Lo que viene</h2>
        <p className="text-center text-xs text-slate-500 mb-6">Servicios en diseño — para cuando tu proyecto político siga vivo después del día de la elección</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROXIMOS_SERVICIOS.map((s) => (
            <div key={s.titulo} className="relative bg-slate-900/30 border border-dashed border-purple-500/30 rounded-2xl p-5">
              <span className="absolute top-3 right-3 text-[9px] font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full">EN DISEÑO</span>
              <div className="text-3xl mb-2">{s.ic}</div>
              <div className="font-bold text-sm mb-1 pr-16">{s.titulo}</div>
              <div className="text-xs text-slate-500">{s.desc}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-5">
          ¿Te interesa alguno antes de que esté listo?{' '}
          <a href="https://wa.me/" target="_blank" rel="noreferrer" className="text-indigo-400 underline">Cuéntanos qué necesitas →</a>
        </p>
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
        <Link to="/aviso-privacidad" className="hover:text-slate-400">Aviso de Privacidad</Link>
        {' · '}
        <Link to="/postura-legal" className="hover:text-slate-400">Postura Legal</Link>
      </div>
    </div>
  );
}

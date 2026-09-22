import { descargarArchivo } from '../lib/api';

/**
 * 🆕 NUEVO — "Documentos legales", dentro de Administración y
 * Cumplimiento → pestaña "📜 Documentos legales".
 *
 * Antes el botón "Mi contrato de servicio" vivía suelto en el
 * Dashboard, mezclado entre los reportes operativos (Cierre de
 * campaña, Jurídico, Estructura...), sin relación con esos otros
 * documentos y sin compañía de los demás documentos legales
 * (Términos y Condiciones, Aviso de Privacidad). Ahora los 3 viven
 * juntos, en un solo lugar dedicado a eso — más fácil de encontrar
 * y no ocupa espacio en el Dashboard, que es para el avance diario
 * de la campaña, no para papeleo.
 */
export default function DocumentosLegales() {
  return (
    <div className="max-w-lg space-y-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📜</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">Mi contrato de servicio</div>
            <div className="text-[11px] text-slate-500">El contrato ya llenado con los datos reales de tu campaña, con evidencia de tu firma electrónica.</div>
          </div>
        </div>
        <button
          onClick={() => descargarArchivo('/auth/mi-contrato-pdf', 'contrato_vototech.pdf')}
          className="w-full mt-3 py-2.5 rounded-lg bg-amber-700/40 hover:bg-amber-700/60 text-amber-300 text-xs font-bold"
        >
          ⬇️ Descargar mi contrato (PDF)
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">Términos y Condiciones</div>
            <div className="text-[11px] text-slate-500">Incluye también el Aviso de Privacidad — uso permitido de la plataforma y manejo de datos personales.</div>
          </div>
        </div>
        <a
          href="/terminos"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold text-center"
        >
          🔗 Ver Términos y Aviso de Privacidad
        </a>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📄</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">Contrato de Prestación de Servicios (formato general)</div>
            <div className="text-[11px] text-slate-500">La versión pública, sin llenar todavía con los datos de una campaña en particular.</div>
          </div>
        </div>
        <a
          href="/contrato"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold text-center"
        >
          🔗 Ver contrato general
        </a>
      </div>

      {/* 🆕 Aviso de Privacidad Integral como documento propio — antes
          solo vivía resumido dentro de Términos y Condiciones. */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">Aviso de Privacidad Integral</div>
            <div className="text-[11px] text-slate-500">Qué datos se recaban, con qué proveedores se comparten y cómo ejercer tus derechos ARCO.</div>
          </div>
        </div>
        <a
          href="/aviso-privacidad"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold text-center"
        >
          🔗 Ver Aviso de Privacidad completo
        </a>
      </div>
    </div>
  );
}

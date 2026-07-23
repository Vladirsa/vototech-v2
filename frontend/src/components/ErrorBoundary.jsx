import { Component } from 'react';

/**
 * Versión silenciosa — para widgets secundarios que viven en TODAS
 * las pantallas (el chat flotante, el aviso de vencimiento, el aviso
 * offline). Si alguno de estos truena, NO debe tumbar el módulo
 * completo que la persona está viendo — simplemente desaparece ese
 * widget en particular, y todo lo demás sigue funcionando normal.
 * Antes, un error en cualquiera de estos widgets (montados una sola
 * vez en App.jsx, fuera de las rutas) tumbaba TODA la aplicación,
 * en cualquier pantalla, porque el ErrorBoundary principal envuelve
 * todo de un jalón.
 */
export class ErrorBoundarySilencioso extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Widget secundario falló (aislado, no afecta el resto de la app):', error, info?.componentStack);
  }
  render() {
    if (this.state.error) return null; // desaparece en silencio, el resto de la app sigue viva
    return this.props.children;
  }
}

/**
 * Sin esto, cuando falla la carga de un módulo (lazy import) — por
 * ejemplo, porque se hizo un despliegue nuevo mientras la persona
 * tenía la app abierta, y el navegador intenta pedir un archivo que
 * ya no existe — React se queda con la pantalla en blanco sin avisar
 * nada, y la única salida es refrescar a mano.
 *
 * Con esto: si el error es justo de "no se pudo cargar el módulo"
 * (el caso más común, con mucho), se recarga la página SOLA una vez,
 * automáticamente, en vez de dejar a la persona confundida. Si es
 * otro tipo de error, muestra un aviso claro con un botón, en vez de
 * una pantalla vacía sin explicación.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const esErrorDeCarga = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(error?.message || '');
    this.setState({ esErrorDeCarga });

    if (esErrorDeCarga) {
      // Evita un bucle infinito de recargas si el problema persiste
      // (ej. sin internet) — solo se recarga automático UNA vez.
      const yaIntento = sessionStorage.getItem('vototech_recarga_por_chunk');
      if (!yaIntento) {
        sessionStorage.setItem('vototech_recarga_por_chunk', '1');
        window.location.reload();
      }
    } else {
      // Esto NO es un problema de red — es un error real de código.
      // Recargar la página NO lo va a arreglar, así que se avisa
      // claramente en vez de decir "actualizando" y dejar a la
      // persona esperando algo que nunca va a pasar solo.
      console.error('Error real capturado por ErrorBoundary:', error, info?.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      if (this.state.esErrorDeCarga) {
        return (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-3">🔄</div>
              <h1 className="text-lg font-bold text-white mb-2">Actualizando la aplicación...</h1>
              <p className="text-sm text-slate-400 mb-4">Hubo una actualización del sistema. Si esta pantalla no se recarga sola en unos segundos, toca el botón.</p>
              <button
                onClick={() => { sessionStorage.removeItem('vototech_recarga_por_chunk'); window.location.reload(); }}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm"
              >
                Recargar ahora
              </button>
            </div>
          </div>
        );
      }
      // Error real, no de red — mensaje honesto, no "ya casi".
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-white mb-2">Algo salió mal en esta pantalla</h1>
            <p className="text-sm text-slate-400 mb-4">No es un problema de conexión — es un error real que hay que reportar. Recargar puede no arreglarlo, pero puedes intentar volver al inicio.</p>
            <div className="flex gap-2 justify-center mb-4">
              <button onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm">Recargar</button>
              <button onClick={() => { window.location.href = '/dashboard'; }} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Ir al inicio</button>
            </div>
            <details className="text-left bg-slate-900 border border-slate-800 rounded-lg p-3">
              <summary className="text-[10px] text-slate-500 cursor-pointer">Detalle técnico (compártelo con soporte si esto se repite)</summary>
              <div className="mt-2 text-[10px] text-red-400 font-mono break-words">
                {this.state.error?.message || 'Sin mensaje'}
                {this.state.error?.stack && <div className="mt-1 text-slate-600 whitespace-pre-wrap">{this.state.error.stack.split('\n').slice(0, 4).join('\n')}</div>}
              </div>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

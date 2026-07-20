import { Component } from 'react';

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

  componentDidCatch(error) {
    const esErrorDeCarga = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(error?.message || '');

    if (esErrorDeCarga) {
      // Evita un bucle infinito de recargas si el problema persiste
      // (ej. sin internet) — solo se recarga automático UNA vez.
      const yaIntento = sessionStorage.getItem('vototech_recarga_por_chunk');
      if (!yaIntento) {
        sessionStorage.setItem('vototech_recarga_por_chunk', '1');
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.error) {
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
    return this.props.children;
  }
}

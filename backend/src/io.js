// Módulo separado para que las rutas puedan importar `io` sin crear
// una dependencia circular con index.js (que es quien lo inicializa).
let ioInstancia = null;

export function setIo(instancia) {
  ioInstancia = instancia;
}

export function getIo() {
  if (!ioInstancia) throw new Error('Socket.io aún no se ha inicializado');
  return ioInstancia;
}

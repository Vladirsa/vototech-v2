import { Eye, FileText, AlertCircle } from 'lucide-react';

export function TablaPolizas({ polizas, compacto = false }) {
  if (!polizas || polizas.length === 0) {
    return <p className="text-gray-500 text-center py-8">No hay pólizas registradas</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left">Folio</th>
            <th className="px-4 py-2 text-left">Fecha</th>
            <th className="px-4 py-2 text-left">Tipo</th>
            <th className="px-4 py-2 text-left">Concepto</th>
            <th className="px-4 py-2 text-right">Cargos</th>
            <th className="px-4 py-2 text-right">Abonos</th>
            <th className="px-4 py-2 text-center">Estatus</th>
            {!compacto && <th className="px-4 py-2 text-center">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {polizas.map((poliza) => (
            <tr key={poliza.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs">{poliza.folio}</td>
              <td className="px-4 py-2">{new Date(poliza.fecha_poliza).toLocaleDateString('es-MX')}</td>
              <td className="px-4 py-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  poliza.tipo_poliza === 'EGRESO' ? 'bg-red-100 text-red-700' :
                  poliza.tipo_poliza === 'INGRESO' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {poliza.tipo_poliza}
                </span>
              </td>
              <td className="px-4 py-2 max-w-xs truncate">{poliza.concepto}</td>
              <td className="px-4 py-2 text-right font-medium text-red-600">
                {formatoMoneda(poliza.cargos || poliza.total_cargos)}
              </td>
              <td className="px-4 py-2 text-right font-medium text-green-600">
                {formatoMoneda(poliza.abonos || poliza.total_abonos)}
              </td>
              <td className="px-4 py-2 text-center">
                <EstatusBadge estatus={poliza.estatus} />
              </td>
              {!compacto && (
                <td className="px-4 py-2 text-center">
                  <button className="text-purple-600 hover:text-purple-800">
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstatusBadge({ estatus }) {
  const estilos = {
    BORRADOR: 'bg-gray-100 text-gray-600',
    PENDIENTE: 'bg-yellow-100 text-yellow-700',
    COMPROBADA: 'bg-blue-100 text-blue-700',
    EN_REVISION: 'bg-purple-100 text-purple-700',
    APROBADA: 'bg-green-100 text-green-700',
    RECHAZADA: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${estilos[estatus] || estilos.BORRADOR}`}>
      {estatus}
    </span>
  );
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
}

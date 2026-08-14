import { useState } from 'react';
import { api } from '../lib/api';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

const CATALOGO_CUENTAS = [
  { id: '1-1-02-00-0000', nombre: 'BANCOS', tipo: 'ACTIVO' },
  { id: '6-1-01-01-0000', nombre: 'GASTOS DE PROPAGANDA', tipo: 'EGRESO' },
  { id: '6-1-01-02-0000', nombre: 'GASTOS OPERATIVOS DE CAMPAÑA', tipo: 'EGRESO' },
  { id: '6-1-01-03-0000', nombre: 'GASTOS DE PROPAGANDA EN MEDIOS IMPRESOS', tipo: 'EGRESO' },
  { id: '6-1-01-04-0000', nombre: 'GASTOS DE PRODUCCIÓN PARA RADIO Y TV', tipo: 'EGRESO' },
  { id: '6-1-01-05-0000', nombre: 'GASTOS DE PRESENTACIÓN DE CANDIDATURAS', tipo: 'EGRESO' },
  { id: '4-1-00-00-0000', nombre: 'FINANCIAMIENTO PÚBLICO', tipo: 'INGRESO' },
  { id: '4-2-01-00-0000', nombre: 'APORTACIONES DE MILITANTES', tipo: 'INGRESO' },
];

export function FormularioPoliza({ onGuardar, onCancelar }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [tipo, setTipo] = useState('EGRESO');
  const [concepto, setConcepto] = useState('');
  const [movimientos, setMovimientos] = useState([
    { cuenta_id: '', tipo_movimiento: 'CARGO', monto: '', descripcion: '' },
    { cuenta_id: '', tipo_movimiento: 'ABONO', monto: '', descripcion: '' },
  ]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const agregarMovimiento = () => {
    setMovimientos([...movimientos, { cuenta_id: '', tipo_movimiento: 'CARGO', monto: '', descripcion: '' }]);
  };

  const eliminarMovimiento = (index) => {
    if (movimientos.length <= 2) {
      setError('Debe haber al menos 2 movimientos (partida doble)');
      return;
    }
    setMovimientos(movimientos.filter((_, i) => i !== index));
  };

  const actualizarMovimiento = (index, campo, valor) => {
    const nuevos = [...movimientos];
    nuevos[index][campo] = valor;
    setMovimientos(nuevos);
    setError('');
  };

  const calcularTotales = () => {
    const cargos = movimientos
      .filter(m => m.tipo_movimiento === 'CARGO')
      .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
    const abonos = movimientos
      .filter(m => m.tipo_movimiento === 'ABONO')
      .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
    return { cargos, abonos, balance: cargos - abonos };
  };

  const { cargos, abonos, balance } = calcularTotales();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (Math.abs(balance) > 0.01) {
      setError(`La póliza no cuadra. Diferencia: ${balance.toFixed(2)}`);
      return;
    }

    if (movimientos.some(m => !m.cuenta_id || !m.monto)) {
      setError('Todos los movimientos deben tener cuenta y monto');
      return;
    }

    // Validar plazo INE
    const fechaOperacion = new Date(fecha);
    const hoy = new Date();
    const diffDias = (hoy - fechaOperacion) / (1000 * 60 * 60 * 24);
    if (diffDias > 3) {
      setError(`Fuera de plazo INE. Máximo ${3} días naturales.`);
      return;
    }

    setGuardando(true);
    try {
      await api.post('/finanzas/polizas', {
        fecha_poliza: fecha,
        tipo_poliza: tipo,
        concepto,
        movimientos: movimientos.map(m => ({
          ...m,
          monto: parseFloat(m.monto),
        })),
      });
      onGuardar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar la póliza');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-semibold">Nueva Póliza - Partida Doble</h3>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="DIARIO">Diario</option>
            <option value="EGRESO">Egreso</option>
            <option value="INGRESO">Ingreso</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Descripción de la póliza"
            required
          />
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Movimientos</h4>
        
        {movimientos.map((mov, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 mb-2 items-center">
            <div className="col-span-4">
              <select
                value={mov.cuenta_id}
                onChange={(e) => actualizarMovimiento(index, 'cuenta_id', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                required
              >
                <option value="">Seleccionar cuenta...</option>
                {CATALOGO_CUENTAS.map(c => (
                  <option key={c.id} value={c.id}>{c.id} - {c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <select
                value={mov.tipo_movimiento}
                onChange={(e) => actualizarMovimiento(index, 'tipo_movimiento', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                <option value="CARGO">CARGO</option>
                <option value="ABONO">ABONO</option>
              </select>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                step="0.01"
                value={mov.monto}
                onChange={(e) => actualizarMovimiento(index, 'monto', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="0.00"
                required
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                value={mov.descripcion}
                onChange={(e) => actualizarMovimiento(index, 'descripcion', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="Descripción"
              />
            </div>
            <div className="col-span-1">
              <button
                type="button"
                onClick={() => eliminarMovimiento(index)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={agregarMovimiento}
          className="flex items-center text-purple-600 hover:text-purple-800 text-sm mt-2"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar movimiento
        </button>
      </div>

      {/* BALANCE */}
      <div className={`p-4 rounded-lg ${Math.abs(balance) < 0.01 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className="flex justify-between items-center">
          <div className="text-sm">
            <span className="font-medium">Total Cargos: </span>
            <span className="text-green-700 font-bold">{formatoMoneda(cargos)}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium">Total Abonos: </span>
            <span className="text-red-700 font-bold">{formatoMoneda(abonos)}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium">Diferencia: </span>
            <span className={Math.abs(balance) < 0.01 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
              {formatoMoneda(balance)}
            </span>
          </div>
        </div>
        {Math.abs(balance) < 0.01 && (
          <p className="text-green-600 text-sm mt-1 text-center">✓ Póliza cuadrada</p>
        )}
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 py-2 border rounded hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || Math.abs(balance) > 0.01}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar Póliza'}
        </button>
      </div>
    </form>
  );
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
}

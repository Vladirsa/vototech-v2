import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export function SemafotoTope({ titulo, tope, gastado, porcentaje, nivel }) {
  const colores = {
    ok: 'bg-green-500',
    medio: 'bg-yellow-500',
    alto: 'bg-orange-500',
    critico: 'bg-red-500',
    rebasado: 'bg-red-700',
  };

  const mensajes = {
    ok: 'Dentro del límite',
    medio: 'Precaución: 70% del tope',
    alto: 'Alerta: 85% del tope',
    critico: 'Crítico: 95% del tope',
    rebasado: 'REBASADO - Riesgo de nulidad',
  };

  const colorActual = colores[nivel] || colores.ok;
  const mensajeActual = mensajes[nivel] || mensajes.ok;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-700">{titulo}</h3>
        {nivel === 'rebasado' && <AlertTriangle className="h-5 w-5 text-red-600" />}
        {nivel === 'critico' && <AlertCircle className="h-5 w-5 text-orange-600" />}
        {nivel === 'ok' && <CheckCircle className="h-5 w-5 text-green-600" />}
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-sm mb-1">
          <span>Gastado: {formatoMoneda(gastado)}</span>
          <span>Tope: {formatoMoneda(tope)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`${colorActual} h-4 rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(porcentaje, 100)}%` }}
          />
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <span className={`text-sm font-medium ${
          nivel === 'rebasado' ? 'text-red-700' : 
          nivel === 'critico' ? 'text-orange-700' : 'text-gray-600'
        }`}>
          {mensajeActual}
        </span>
        <span className="text-lg font-bold">{porcentaje?.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
}

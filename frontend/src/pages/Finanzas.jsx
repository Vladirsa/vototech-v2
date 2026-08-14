import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Calendar, FileText, DollarSign } from 'lucide-react';
import { SemafotoTope } from './SemafotoTope';
import { TablaPolizas } from './TablaPolizas';
import { FormularioPoliza } from './FormularioPoliza';
import { AgendaEventos } from './AgendaEventos';

export function DashboardFinanzas() {
  const { usuario } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pestanaActiva, setPestanaActiva] = useState('resumen');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const res = await api.get('/finanzas');
      setDatos(res.data);
    } catch (err) {
      console.error('Error cargando finanzas:', err);
    } finally {
      setCargando(false);
    }
  };

  if (cargando) return <div className="p-8 text-center">Cargando...</div>;
  if (!datos) return <div className="p-8 text-center text-red-600">Error cargando datos</div>;

  const { resumen, polizas, ingresos, agenda } = datos;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Control Financiero - INE</h1>
      <p className="text-gray-600 mb-6">Fiscalización de ingresos y egresos conforme al Reglamento de Fiscalización</p>

      {/* ALERTAS CRÍTICAS */}
      {resumen.operaciones_fuera_de_plazo > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            <span className="font-semibold text-red-700">
              {resumen.operaciones_fuera_de_plazo} operaciones fuera del plazo INE (3 días naturales)
            </span>
          </div>
        </div>
      )}

      {resumen.nivel_alerta_tope === 'rebasado' && (
        <div className="bg-red-100 border-l-4 border-red-600 p-4 mb-6 rounded">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="font-bold text-red-800">
              ⚠️ TOPE DE GASTO REBASADO - RIESGO DE NULIDAD DE LA ELECCIÓN
            </span>
          </div>
        </div>
      )}

      {/* TARJETAS DE RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <TarjetaResumen
          titulo="Total Ingresos"
          valor={formatoMoneda(resumen.total_ingresos)}
          icono={<TrendingUp className="h-6 w-6 text-green-600" />}
          color="green"
        />
        <TarjetaResumen
          titulo="Total Gastos"
          valor={formatoMoneda(resumen.total_gastado)}
          icono={<TrendingDown className="h-6 w-6 text-red-600" />}
          color="red"
        />
        <TarjetaResumen
          titulo="Balance"
          valor={formatoMoneda(resumen.balance)}
          icono={<DollarSign className="h-6 w-6 text-blue-600" />}
          color={resumen.balance >= 0 ? 'blue' : 'red'}
        />
        <TarjetaResumen
          titulo="Disponible"
          valor={resumen.disponible !== null ? formatoMoneda(resumen.disponible) : 'Sin tope'}
          icono={<CheckCircle className="h-6 w-6 text-purple-600" />}
          color="purple"
        />
      </div>

      {/* SEMÁFORO DE TOPE */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Control de Topes de Gasto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resumen.tope_ople && (
            <SemafotoTope
              titulo="Tope OPLE"
              tope={resumen.tope_ople}
              gastado={resumen.total_gastado}
              porcentaje={resumen.porcentaje_usado}
              nivel={resumen.nivel_alerta_tope}
            />
          )}
          {resumen.tope_ine && (
            <SemafotoTope
              titulo="Tope INE (Federal)"
              tope={resumen.tope_ine}
              gastado={resumen.total_gastado}
              porcentaje={resumen.porcentaje_usado}
              nivel={resumen.nivel_alerta_tope}
            />
          )}
        </div>
      </div>

      {/* PESTAÑAS */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: 'resumen', label: 'Resumen', icon: <FileText className="h-4 w-4" /> },
              { id: 'polizas', label: 'Pólizas (Partida Doble)', icon: <FileText className="h-4 w-4" /> },
              { id: 'agenda', label: 'Agenda de Eventos', icon: <Calendar className="h-4 w-4" /> },
              { id: 'reporte', label: 'Reporte INE', icon: <FileText className="h-4 w-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPestanaActiva(tab.id)}
                className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm ${
                  pestanaActiva === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icono}
                <span className="ml-2">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {pestanaActiva === 'resumen' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Últimos Movimientos</h3>
              <TablaPolizas polizas={polizas || []} compacto />
            </div>
          )}

          {pestanaActiva === 'polizas' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Pólizas Contables</h3>
                <button
                  onClick={() => setPestanaActiva('nueva-poliza')}
                  className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                >
                  + Nueva Póliza
                </button>
              </div>
              <TablaPolizas polizas={polizas || []} />
            </div>
          )}

          {pestanaActiva === 'nueva-poliza' && (
            <FormularioPoliza
              onGuardar={() => {
                cargarDatos();
                setPestanaActiva('polizas');
              }}
              onCancelar={() => setPestanaActiva('polizas')}
            />
          )}

          {pestanaActiva === 'agenda' && (
            <AgendaEventos />
          )}

          {pestanaActiva === 'reporte' && (
            <ReporteINE campanaId={usuario.campana_id} />
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaResumen({ titulo, valor, icono, color }) {
  const colores = {
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`${colores[color]} border rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{titulo}</p>
          <p className="text-2xl font-bold mt-1">{valor}</p>
        </div>
        {icono}
      </div>
    </div>
  );
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
}

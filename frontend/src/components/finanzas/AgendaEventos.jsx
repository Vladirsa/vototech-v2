import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Calendar, Clock, MapPin, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export function AgendaEventos() {
  const [eventos, setEventos] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarEventos();
  }, []);

  const cargarEventos = async () => {
    try {
      const res = await api.get('/finanzas/agenda');
      setEventos(res.data?.data || []);
    } catch (err) {
      console.error('Error cargando agenda:', err);
    } finally {
      setCargando(false);
    }
  };

  if (cargando) return <div className="text-center py-8">Cargando agenda...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Agenda de Eventos Políticos</h3>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
        >
          {mostrarFormulario ? 'Cancelar' : '+ Nuevo Evento'}
        </button>
      </div>

      {mostrarFormulario && (
        <FormularioEvento
          onGuardar={() => {
            cargarEventos();
            setMostrarFormulario(false);
          }}
        />
      )}

      <div className="space-y-3">
        {eventos.length === 0 && (
          <p className="text-gray-500 text-center py-8">No hay eventos registrados</p>
        )}
        
        {eventos.map((evento) => (
          <TarjetaEvento key={evento.id} evento={evento} onActualizar={cargarEventos} />
        ))}
      </div>
    </div>
  );
}

function FormularioEvento({ onGuardar }) {
  const [formData, setFormData] = useState({
    nombre_evento: '',
    tipo_evento: 'CAMPAÑA',
    fecha_evento: '',
    hora_inicio: '',
    hora_fin: '',
    direccion: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validar 7 días de anticipación
    const fechaEvento = new Date(formData.fecha_evento);
    const hoy = new Date();
    const diasDiferencia = (fechaEvento - hoy) / (1000 * 60 * 60 * 24);

    if (diasDiferencia < 7) {
      setError(`El INE exige registrar eventos con al menos 7 días de anticipación. Faltan ${Math.ceil(7 - diasDiferencia)} días.`);
      return;
    }

    try {
      await api.post('/finanzas/agenda', formData);
      onGuardar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar el evento');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded flex items-center">
          <AlertTriangle className="h-4 w-4 text-red-500 mr-2" />
          <span className="text-red-700 text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Nombre del evento"
          value={formData.nombre_evento}
          onChange={(e) => setFormData({...formData, nombre_evento: e.target.value})}
          className="border rounded px-3 py-2"
          required
        />
        <select
          value={formData.tipo_evento}
          onChange={(e) => setFormData({...formData, tipo_evento: e.target.value})}
          className="border rounded px-3 py-2"
        >
          <option value="PRECAMPAÑA">Precampaña</option>
          <option value="OBTENCION_APOYO">Obtención de Apoyo</option>
          <option value="CAMPAÑA">Campaña</option>
          <option value="OPERATIVO">Operativo</option>
          <option value="PRESENTACION_CANDIDATURA">Presentación de Candidatura</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="date"
          value={formData.fecha_evento}
          onChange={(e) => setFormData({...formData, fecha_evento: e.target.value})}
          className="border rounded px-3 py-2"
          required
        />
        <input
          type="time"
          value={formData.hora_inicio}
          onChange={(e) => setFormData({...formData, hora_inicio: e.target.value})}
          className="border rounded px-3 py-2"
        />
        <input
          type="time"
          value={formData.hora_fin}
          onChange={(e) => setFormData({...formData, hora_fin: e.target.value})}
          className="border rounded px-3 py-2"
        />
      </div>

      <input
        type="text"
        placeholder="Dirección del evento"
        value={formData.direccion}
        onChange={(e) => setFormData({...formData, direccion: e.target.value})}
        className="w-full border rounded px-3 py-2"
      />

      <button
        type="submit"
        className="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700"
      >
        Registrar Evento
      </button>
    </form>
  );
}

function TarjetaEvento({ evento, onActualizar }) {
  const estados = {
    PROGRAMADO: { color: 'bg-blue-50 border-blue-200', icono: <Calendar className="h-5 w-5 text-blue-600" /> },
    REALIZADO: { color: 'bg-green-50 border-green-200', icono: <CheckCircle className="h-5 w-5 text-green-600" /> },
    CANCELADO: { color: 'bg-red-50 border-red-200', icono: <XCircle className="h-5 w-5 text-red-600" /> },
    POSPUESTO: { color: 'bg-yellow-50 border-yellow-200', icono: <Clock className="h-5 w-5 text-yellow-600" /> },
  };

  const estilo = estados[evento.estado_registro] || estados.PROGRAMADO;

  return (
    <div className={`${estilo.color} border rounded-lg p-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          {estilo.icono}
          <div>
            <h4 className="font-semibold">{evento.nombre_evento}</h4>
            <p className="text-sm text-gray-600">{evento.tipo_evento}</p>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {new Date(evento.fecha_evento).toLocaleDateString('es-MX')}
              </span>
              {evento.hora_inicio && (
                <span className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  {evento.hora_inicio} - {evento.hora_fin}
                </span>
              )}
              {evento.direccion && (
                <span className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  {evento.direccion}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          evento.estado_registro === 'PROGRAMADO' ? 'bg-blue-100 text-blue-700' :
          evento.estado_registro === 'REALIZADO' ? 'bg-green-100 text-green-700' :
          'bg-red-100 text-red-700'
        }`}>
          {evento.estado_registro}
        </span>
      </div>
    </div>
  );
}

import { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

// 🆕 Lista fija de los 32 estados — dato estático, no necesita
// pedirse al servidor cada vez (y esta pantalla es pública, sin
// sesión, así que evita depender de un endpoint con autenticación).
const ESTADOS = [
  { id: 1, nombre: 'Aguascalientes' }, { id: 2, nombre: 'Baja California' }, { id: 3, nombre: 'Baja California Sur' },
  { id: 4, nombre: 'Campeche' }, { id: 5, nombre: 'Coahuila' }, { id: 6, nombre: 'Colima' }, { id: 7, nombre: 'Chiapas' },
  { id: 8, nombre: 'Chihuahua' }, { id: 9, nombre: 'Ciudad de México' }, { id: 10, nombre: 'Durango' },
  { id: 11, nombre: 'Guanajuato' }, { id: 12, nombre: 'Guerrero' }, { id: 13, nombre: 'Hidalgo' }, { id: 14, nombre: 'Jalisco' },
  { id: 15, nombre: 'México' }, { id: 16, nombre: 'Michoacán' }, { id: 17, nombre: 'Morelos' }, { id: 18, nombre: 'Nayarit' },
  { id: 19, nombre: 'Nuevo León' }, { id: 20, nombre: 'Oaxaca' }, { id: 21, nombre: 'Puebla' }, { id: 22, nombre: 'Querétaro' },
  { id: 23, nombre: 'Quintana Roo' }, { id: 24, nombre: 'San Luis Potosí' }, { id: 25, nombre: 'Sinaloa' }, { id: 26, nombre: 'Sonora' },
  { id: 27, nombre: 'Tabasco' }, { id: 28, nombre: 'Tamaulipas' }, { id: 29, nombre: 'Tlaxcala' }, { id: 30, nombre: 'Veracruz' },
  { id: 31, nombre: 'Yucatán' }, { id: 32, nombre: 'Zacatecas' },
];

const TIPOS = [
  { id: 'ayuntamiento', label: '🏛️ Presidente Municipal' },
  { id: 'pres_comunidad', label: '🏠 Presidente de Comunidad' },
  { id: 'dip_local', label: '⚖️ Diputado Local' },
  { id: 'dip_federal', label: '🏢 Diputado Federal' },
  { id: 'senador', label: '🏦 Senador' },
  { id: 'gobernador', label: '🎖️ Gobernador' },
  { id: 'judicial', label: '⚖️ Juez / Magistrado (Judicial)' },
];

/** Página pública — sin cuenta, sin contraseña. El prospecto elige
 * su tipo de elección, da un dato aproximado, y ve un rango de
 * precio de inmediato — con opción de pedir que le contacten. */
export default function Cotizador() {
  const [paso, setPaso] = useState(1);
  const [tipoEleccion, setTipoEleccion] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [poblacion, setPoblacion] = useState('');
  const [cargoJudicial, setCargoJudicial] = useState('juez');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  const esMunicipal = tipoEleccion === 'ayuntamiento' || tipoEleccion === 'pres_comunidad';

  const calcular = async () => {
    setCargando(true);
    try {
      const { data } = await axios.post(`${API_URL}/publico/cotizar`, {
        tipo_eleccion: tipoEleccion, estado_id: estadoId, poblacion_aproximada: poblacion, cargo_judicial: cargoJudicial,
      });
      setResultado(data.data);
      setPaso(3);
    } catch { /* si falla, se queda en el paso actual */ }
    setCargando(false);
  };

  const solicitarContacto = async () => {
    if (!nombre || !telefono) return;
    try {
      await axios.post(`${API_URL}/publico/solicitar-contacto`, {
        nombre, telefono, email, tipo_eleccion: tipoEleccion, estado_id: estadoId,
        poblacion_aproximada: poblacion, cargo_judicial: cargoJudicial,
        precio_min: resultado.precio_min, precio_max: resultado.precio_max,
      });
      setEnviado(true);
    } catch { /* el botón se queda disponible para reintentar */ }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-purple-950 p-4 flex items-center justify-center">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-1">🗳️</div>
          <h1 className="text-xl font-black text-white">Cotiza tu campaña con VotoTech</h1>
          <p className="text-xs text-slate-400 mt-1">3 preguntas rápidas, precio al instante</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-5 space-y-4">
          {paso === 1 && (
            <>
              <label className="text-xs font-bold text-slate-400 uppercase">¿Para qué cargo es tu campaña?</label>
              <div className="space-y-1.5">
                {TIPOS.map((t) => (
                  <button key={t.id} onClick={() => { setTipoEleccion(t.id); setPaso(2); }}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 text-white text-sm font-bold transition-colors">
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {paso === 2 && (
            <>
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">¿En qué estado?</label>
              <select value={estadoId} onChange={(e) => setEstadoId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm mb-3">
                <option value="">Elige tu estado...</option>
                {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>

              {esMunicipal && (
                <>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">¿Cuántos habitantes tiene tu municipio, aproximadamente?</label>
                  <input type="number" placeholder="Ej: 45000" value={poblacion} onChange={(e) => setPoblacion(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm mb-3" />
                  <p className="text-[10px] text-slate-500 mb-3">No hace falta el dato exacto — un aproximado basta para darte un rango.</p>
                </>
              )}

              {tipoEleccion === 'judicial' && (
                <>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">¿A qué cargo aspiras?</label>
                  <div className="flex gap-1.5 mb-3">
                    {[['juez', 'Juez'], ['magistrado', 'Magistrado'], ['ministro', 'Ministro/Nacional']].map(([id, label]) => (
                      <button key={id} onClick={() => setCargoJudicial(id)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${cargoJudicial === id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setPaso(1)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm">← Atrás</button>
                <button onClick={calcular} disabled={cargando || !estadoId || (esMunicipal && !poblacion)}
                  className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
                  {cargando ? '⏳...' : 'Ver mi precio →'}
                </button>
              </div>
            </>
          )}

          {paso === 3 && resultado && !enviado && (
            <>
              <div className="text-center py-2">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Tu rango estimado</div>
                <div className="text-3xl font-black text-white mt-1">
                  ${resultado.precio_min.toLocaleString()} – ${resultado.precio_max.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">pesos mexicanos</div>
              </div>
              <p className="text-[11px] text-slate-400 bg-slate-800/60 rounded-lg p-3">{resultado.nota}</p>
              <p className="text-xs text-slate-300 text-center pt-1">¿Te late? Déjanos tus datos y te contactamos para confirmar el precio exacto y armar tu demo.</p>

              <input placeholder="Tu nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm" />
              <input placeholder="Tu WhatsApp" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm" />
              <input placeholder="Correo (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm" />

              <button onClick={solicitarContacto} disabled={!nombre || !telefono}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-sm disabled:opacity-40">
                ✅ Quiero que me contacten
              </button>
            </>
          )}

          {enviado && (
            <div className="text-center py-4 space-y-2">
              <div className="text-4xl">🎉</div>
              <h2 className="text-lg font-black text-white">¡Listo, {nombre.split(' ')[0]}!</h2>
              <p className="text-sm text-slate-400">Te contactaremos pronto para mostrarte VotoTech funcionando de verdad.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

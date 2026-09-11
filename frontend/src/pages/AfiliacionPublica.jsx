import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export default function AfiliacionPublica() {
  const { subdominio } = useParams();
  const [campana, setCampana] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando, listo, enviando, enviado, error
  const [error, setError] = useState('');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [calle, setCalle] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [consentimientoCredencial, setConsentimientoCredencial] = useState(false);
  const [credencialFrente, setCredencialFrente] = useState(null);
  const [credencialReverso, setCredencialReverso] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/publico/campana/${subdominio}`)
      .then((r) => { setCampana(r.data.data); setEstado('listo'); })
      .catch((e) => { setError(e.response?.data?.error || 'Enlace inválido'); setEstado('error'); });
  }, [subdominio]);

  const obtenerUbicacion = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 }
    );
  });

  const enviar = async () => {
    if (nombre.trim().length < 3) { setError('Escribe tu nombre completo'); return; }
    if (telefono.replace(/\D/g, '').length < 10) { setError('Escribe un teléfono a 10 dígitos'); return; }
    if (!consentimiento) { setError('Es necesario aceptar el aviso de privacidad para continuar'); return; }
    setError('');
    setEstado('enviando');

    const ubicacion = await obtenerUbicacion();
    const fd = new FormData();
    fd.append('nombre', nombre.trim());
    fd.append('telefono', telefono);
    fd.append('calle', calle);
    fd.append('consentimiento', 'true');
    if (ubicacion) { fd.append('lat', ubicacion.lat); fd.append('lng', ubicacion.lng); }
    if (consentimientoCredencial) {
      fd.append('consentimiento_credencial', 'true');
      if (credencialFrente) fd.append('credencial_frente', credencialFrente);
      if (credencialReverso) fd.append('credencial_reverso', credencialReverso);
    }

    try {
      await axios.post(`${API_URL}/publico/afiliar/${subdominio}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEstado('enviado');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo completar tu registro, intenta de nuevo');
      setEstado('listo');
    }
  };

  if (estado === 'cargando') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">⏳ Cargando...</div>;
  }

  if (estado === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center text-red-400 text-sm">⚠️ {error}</div>
      </div>
    );
  }

  if (estado === 'enviado') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <h1 className="text-lg font-black text-white">¡Gracias, {nombre}!</h1>
          <p className="text-sm text-slate-400">Tu registro fue recibido correctamente. El equipo de campaña ya lo tiene.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🗳️</div>
          <h1 className="text-lg font-black text-white">Únete a la campaña de {campana.nombre_candidato}</h1>
          <p className="text-xs text-slate-500 mt-1">Regístrate como simpatizante — toma menos de un minuto.</p>
        </div>

        {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Nombre completo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Teléfono / WhatsApp</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Calle y colonia (opcional)</label>
            <input value={calle} onChange={(e) => setCalle(e.target.value)} placeholder="Ej: Av. Juárez #123, Centro"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" />
          </div>

          {/* Aviso de privacidad — LFPDPPP, mismo lenguaje que ya usa
              el resto del sistema (el candidato es el Responsable). */}
          <label className="flex items-start gap-2 text-[10px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} className="mt-0.5" />
            <span>
              Doy mi consentimiento para que <strong>{campana.nombre_candidato}</strong> (responsable de mis datos) trate mi nombre, teléfono
              y ubicación aproximada, incluyendo mi preferencia política, conforme a la LFPDPPP. Puedo revocar este consentimiento en
              cualquier momento contactando directamente a la campaña.
            </span>
          </label>

          {/* Credencial — consentimiento SEPARADO, aparte del general,
              por ser un dato de identificación más sensible. */}
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <label className="flex items-start gap-2 text-[10px] text-slate-400 cursor-pointer">
              <input type="checkbox" checked={consentimientoCredencial} onChange={(e) => setConsentimientoCredencial(e.target.checked)} className="mt-0.5" />
              <span>
                (Opcional) También autorizo compartir una foto de mi credencial de elector (frente y reverso), para fines de comprobación
                de mi registro. Entiendo que <strong>{campana.nombre_candidato}</strong> es responsable de resguardar esta información.
              </span>
            </label>
            {consentimientoCredencial && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden" id="input-cred-frente"
                    onChange={(e) => setCredencialFrente(e.target.files[0])} />
                  <span className="block text-center py-2 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer" onClick={() => document.getElementById('input-cred-frente').click()}>
                    {credencialFrente ? '📎 Frente listo' : '📷 Frente'}
                  </span>
                </label>
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden" id="input-cred-reverso"
                    onChange={(e) => setCredencialReverso(e.target.files[0])} />
                  <span className="block text-center py-2 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer" onClick={() => document.getElementById('input-cred-reverso').click()}>
                    {credencialReverso ? '📎 Reverso listo' : '📷 Reverso'}
                  </span>
                </label>
              </div>
            )}
          </div>

          <button onClick={enviar} disabled={estado === 'enviando' || !consentimiento}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold disabled:opacity-40">
            {estado === 'enviando' ? '⏳ Enviando...' : '✅ Registrarme'}
          </button>
        </div>
      </div>
    </div>
  );
}

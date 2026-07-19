import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function Codigos() {
  const [codigos, setCodigos] = useState([]);
  const [rol, setRol] = useState('promotor');
  const [usos, setUsos] = useState(1);
  const [copiado, setCopiado] = useState(null);

  const cargar = () => api.get('/codigos').then((r) => setCodigos(r.data.data));
  useEffect(() => { cargar(); }, []);

  const generar = async () => {
    await api.post('/codigos', { rol_asignado: rol, usos_maximos: usos });
    cargar();
  };

  const copiar = (codigo) => {
    navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">🎟️ Códigos de Invitación</h1>
          <Link to="/dashboard" className="text-xs text-indigo-400">← Dashboard</Link>
        </div>
        <p className="text-xs text-slate-500">Comparte un código por WhatsApp para que alguien se registre solo, sin que tengas que darlo de alta uno por uno.</p>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-2">
          <select value={rol} onChange={(e) => setRol(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm">
            <option value="promotor">🤝 Promotor</option>
            <option value="coord_seccional">📍 Coord. Seccional</option>
            <option value="coord_municipal">🏘️ Coord. Municipal</option>
          </select>
          <input type="number" min={1} value={usos} onChange={(e) => setUsos(+e.target.value)}
            className="w-24 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm" title="Usos máximos" />
          <button onClick={generar} className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">Generar</button>
        </div>

        <div className="space-y-2">
          {codigos.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-lg font-black text-indigo-400">{c.codigo}</div>
                <div className="text-[10px] text-slate-500">
                  {c.rol_asignado} · usado {c.usos_actuales}/{c.usos_maximos} · {c.activo ? '✅ activo' : '❌ inactivo'}
                </div>
              </div>
              <button onClick={() => copiar(c.codigo)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">
                {copiado === c.codigo ? '✅ Copiado' : '📋 Copiar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

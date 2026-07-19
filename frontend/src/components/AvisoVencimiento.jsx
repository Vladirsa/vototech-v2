import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/authStore';

const ROLES_QUE_VEN_AVISO = ['candidato', 'jefe_campana'];

/**
 * Banner que avisa cuando la suscripción está por vencer — solo a
 * quien de verdad le toca preocuparse por el pago (candidato/jefe),
 * no a todo el equipo. Vive montado globalmente, visible en
 * cualquier módulo, no solo en el Dashboard.
 */
export default function AvisoVencimiento() {
  const usuario = useAuth((s) => s.usuario);
  const [diasRestantes, setDiasRestantes] = useState(null);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!usuario || !ROLES_QUE_VEN_AVISO.includes(usuario.rol)) return;
    api.get('/auth/mi-campana').then((r) => {
      const c = r.data.data;
      if (c.es_demo || !c.fecha_vencimiento) return;
      const dias = Math.ceil((new Date(c.fecha_vencimiento) - new Date()) / 86400000);
      if (dias <= 7) setDiasRestantes(dias);
    }).catch(() => {});
  }, [usuario]);

  if (diasRestantes === null || cerrado) return null;

  const vencida = diasRestantes < 0;

  return (
    <div className={`sticky top-[49px] z-[1900] px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-3 ${vencida ? 'bg-red-600 text-white' : 'bg-amber-500 text-slate-900'}`}>
      <span>
        {vencida
          ? `💳 Tu suscripción venció hace ${Math.abs(diasRestantes)} día(s) — contacta a VotoTech para renovar y no perder acceso.`
          : `💳 Tu suscripción vence en ${diasRestantes} día(s) — contacta a VotoTech para renovar a tiempo.`}
      </span>
      <button onClick={() => setCerrado(true)} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

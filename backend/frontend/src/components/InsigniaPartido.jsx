// Colores oficiales por partido — centralizado aquí para que TODO el
// sistema (mapa, promovidos, reportes) use exactamente los mismos,
// en vez de tener la paleta repetida y potencialmente distinta en
// cada módulo.
export const COLOR_PARTIDO = {
  morena: { color: '#8B0000', color2: '#B91C1C', nombre: 'MORENA' },
  pan: { color: '#003DA5', color2: '#1D4ED8', nombre: 'PAN' },
  pri: { color: '#006847', color2: '#059669', nombre: 'PRI' },
  pvem: { color: '#2D7D27', color2: '#16A34A', nombre: 'PVEM' },
  pt: { color: '#CC0000', color2: '#DC2626', nombre: 'PT' },
  mc: { color: '#F26522', color2: '#F97316', nombre: 'MC' },
  prd: { color: '#FFCB00', color2: '#EAB308', nombre: 'PRD' },
  pac: { color: '#E91E63', color2: '#EC4899', nombre: 'PAC' },
  rsp: { color: '#7C3AED', color2: '#8B5CF6', nombre: 'RSP' },
  panalt: { color: '#0D9488', color2: '#14B8A6', nombre: 'PANAL' },
  fxm: { color: '#DB2777', color2: '#EC4899', nombre: 'FXM' },
  independiente: { color: '#64748B', color2: '#94A3B8', nombre: 'INDEP.' },
};

/**
 * Insignia visual de partido — siglas con el color oficial, en vez de
 * texto plano o solo un punto de color. No usamos logos reales de
 * los partidos: son emblemas registrados ante el INE, y reproducirlos
 * sin autorización es un tema de derechos que mejor evitamos —
 * esto da identidad visual clara sin ese riesgo.
 */
export default function InsigniaPartido({ partido, tamano = 'normal' }) {
  const p = COLOR_PARTIDO[partido] || { color: '#475569', color2: '#64748B', nombre: partido?.toUpperCase() || '?' };
  const clases = tamano === 'mini' ? 'text-[7px] px-1 py-0.5' : tamano === 'chico' ? 'text-[9px] px-1.5 py-0.5' : tamano === 'grande' ? 'text-xs px-3 py-1.5' : 'text-[10px] px-2 py-1';

  return (
    <span
      className={`inline-flex items-center font-black rounded-md text-white shadow-sm ${clases}`}
      style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color2})` }}
    >
      {p.nombre}
    </span>
  );
}

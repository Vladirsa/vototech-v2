import { create } from 'zustand';

const claveGuardado = 'vototech_tema';

function aplicarClase(tema) {
  const raiz = document.documentElement;
  raiz.classList.remove('light', 'dark');
  raiz.classList.add(tema);
}

const temaInicial = localStorage.getItem(claveGuardado) || 'dark';
aplicarClase(temaInicial);

export const useTema = create((set, get) => ({
  tema: temaInicial,
  alternar: () => {
    const nuevo = get().tema === 'dark' ? 'light' : 'dark';
    localStorage.setItem(claveGuardado, nuevo);
    aplicarClase(nuevo);
    set({ tema: nuevo });
  },
}));

// Botón "Copiar link" del blog (antes era código dentro del HTML, que la
// política de seguridad del sitio bloquea).
document.querySelectorAll('.copiar-link').forEach((boton) => {
  boton.addEventListener('click', () => {
    navigator.clipboard.writeText(boton.dataset.url).then(() => {
      boton.textContent = '✅ Copiado';
      setTimeout(() => { boton.textContent = '🔗 Copiar link'; }, 2000);
    });
  });
});

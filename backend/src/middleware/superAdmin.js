// El "super admin" eres tú (el dueño de VotoTech) — no está atado a
// ninguna campaña, así que no usa el sistema de usuarios normal.
// Se protege con una clave secreta que solo tú conoces, guardada
// como variable de entorno (SUPER_ADMIN_KEY), nunca en el código.
export function requiereSuperAdmin(req, res, next) {
  const clave = req.headers['x-admin-key'];
  const claveReal = process.env.SUPER_ADMIN_KEY;

  if (!claveReal) {
    return res.status(500).json({ ok: false, error: 'SUPER_ADMIN_KEY no está configurada en el servidor' });
  }
  if (clave !== claveReal) {
    return res.status(403).json({ ok: false, error: 'Clave de administrador incorrecta' });
  }
  next();
}

// BUSCAR ESTA SECCIÓN EN backend/src/routes/auth.routes.js

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ... tu código existente de validación de credenciales ...

    const usuario = await db.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );

    if (!usuario.rows[0]) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, usuario.rows[0].password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // ⭐ NUEVO: Si tiene 2FA, NO generar JWT inmediatamente
    if (usuario.rows[0].dos_factores_activo) {
      // Generar token temporal (válido solo 5 minutos)
      const tempToken = jwt.sign(
        { usuarioId: usuario.rows[0].id, type: '2fa-required' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      return res.json({
        message: 'Se requiere verificación 2FA',
        tempToken: tempToken,
        requires2FA: true
      });
    }

    // Si NO tiene 2FA, proceder normal
    const token = jwt.sign(
      { usuarioId: usuario.rows[0].id, campanaId: usuario.rows[0].campana_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token: token,
      usuario: {
        id: usuario.rows[0].id,
        nombre: usuario.rows[0].nombre,
        rol: usuario.rows[0].rol,
        campana_id: usuario.rows[0].campana_id
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

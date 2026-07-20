# VotoTech — Desarrollo local

## Opción rápida: Docker (recomendado)

Requiere tener [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado. Levanta base de datos, backend y frontend con un solo comando, sin instalar PostgreSQL ni Node a mano.

```bash
docker compose up
```

Esto deja corriendo:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:4000
- **Base de datos**: PostgreSQL en el puerto 5432 (usuario `postgres`, contraseña `votodev123`)

La primera vez que el backend arranca, carga automáticamente los datos geográficos y electorales de Tlaxcala (puede tardar un par de minutos). Las siguientes veces arranca directo.

### Variables de entorno opcionales

Sin estas, el sistema funciona igual, solo esas funciones específicas no responderán:

```bash
# Crea un archivo .env en la raíz del proyecto (junto a docker-compose.yml)
ANTHROPIC_API_KEY=       # Centro IA, interpretación de tendencias, lectura de actas
TWILIO_ACCOUNT_SID=      # WhatsApp automático en Marketing
TWILIO_AUTH_TOKEN=
SUPABASE_URL=            # Fotos de actas/incidencias, Centro de Documentos
SUPABASE_SERVICE_KEY=
VAPID_PUBLIC_KEY=        # Notificaciones push reales
VAPID_PRIVATE_KEY=
```

### Comandos útiles

```bash
docker compose up -d          # Levantar todo en segundo plano
docker compose logs -f backend # Ver logs del backend en vivo
docker compose down           # Apagar todo
docker compose down -v        # Apagar y BORRAR la base de datos (empezar de cero)
```

## Opción manual (sin Docker)

Ver las instrucciones dentro de `backend/README.md` y `frontend/README.md` si prefieres instalar PostgreSQL y Node directamente en tu máquina.

## Usuario de prueba (demo)

Una vez que el sistema esté corriendo, genera una campaña demo desde el Panel de Administración, o usa el script:

```bash
docker compose exec backend npm run seed:demo
```

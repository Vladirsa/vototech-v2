# 🗳️ VotoTech v2

Sistema de gestión electoral multi-tenant. Cada candidato tiene su propia
cuenta aislada dentro de un solo sistema (no una instalación separada por
candidato, como en la versión anterior con WordPress).

## Estructura del proyecto

```
vototech-v2/
├── backend/          Node.js + Express + PostgreSQL + Socket.io
└── frontend/         React + Vite + Tailwind + Leaflet (mapas)
```

## Cómo correrlo en tu computadora

### 1. Base de datos (PostgreSQL)

Necesitas PostgreSQL instalado y corriendo. Luego:

```bash
createdb vototech_dev
psql vototech_dev < backend/src/db/schema.sql
psql vototech_dev < backend/src/db/seed_estados.sql
psql vototech_dev < backend/src/db/migracion_fase2.sql
psql vototech_dev < backend/src/db/migracion_fase3.sql
psql vototech_dev < backend/src/db/migracion_fase4.sql
```

O si prefieres restaurar el respaldo con datos ya cargados (secciones,
resultados electorales reales de Tlaxcala 2024):

```bash
createdb vototech_dev
psql vototech_dev < vototech-base-datos-backup.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tus datos reales de conexión a PostgreSQL
npm install
npm run dev
```

Corre en `http://localhost:4000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Corre en `http://localhost:5173`

## Módulos incluidos (Fases 1-5)

- Autenticación multi-tenant (registro de campaña, login, códigos de invitación)
- Mapa electoral con datos geográficos reales (secciones, manzanas, localidades)
- Coloreado del mapa por partido ganador (resultados reales 2024)
- Promovidos con clasificación automática (Base / Persuadible / Adversario)
- Motor de Priorización de secciones (costo-beneficio, ajustado por días restantes)
- Estructura de campaña con semáforo de salud organizacional
- Agenda, Reportes de campo, Códigos de invitación
- Día de la Elección en tiempo real (WebSockets) + Lista de cacería
- Incidencias con alertas en vivo
- Control Financiero con tope OPLE
- WhatsApp masivo (Twilio) + Asistente de redacción con IA

## Despliegue a producción

Ver guía de despliegue (Render + Vercel + Supabase/Neon, gratis para empezar).

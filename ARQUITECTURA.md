# Arquitectura Quick Arrival App

## Stack

- **Frontend:** React 19 + Vite → desplegado en Vercel
- **Backend:** Node.js (Vercel Edge Functions) en `/api`
- **Base de datos:** Supabase (PostgreSQL) — solo accesible desde el backend
- **Auth:** Supabase Auth (desde el frontend — uso previsto por la plataforma)
- **APIs externas:** EMT Madrid + CRTM (a través del backend)
- **Routing de mapas:** OSRM (gratuito, sin API key)

---

## Arquitectura objetivo

```
Frontend (React)
    │
    ├── Supabase Auth          ← única excepción justificada (equivalente a Firebase Auth)
    │
    ├── GET /api/stops         ← paradas cercanas
    ├── GET /api/arrivals      ← tiempos de llegada en tiempo real
    ├── POST /api/reports      ← reportes de usuarios (retrasos, asientos libres)
    └── GET /api/reports       ← consultar reportes activos

Backend (Vercel Edge Functions - Node.js)
    │
    ├── Supabase (PostgreSQL)  ← paradas estáticas, reportes de usuarios
    ├── EMT Madrid API         ← buses urbanos (credenciales en env vars)
    └── CRTM API               ← buses interurbanos y Cercanías
```

---

## Edge Functions existentes

| Archivo | Ruta | Función |
|---------|------|---------|
| `api/emt-proxy.js` | `/api/emt/*` | Proxy a EMT Madrid. Inyecta credenciales desde env vars |
| `api/crtm-proxy.js` | `/api/crtm/*` | Proxy a CRTM. Camufla peticiones con headers de crtm.es |

---

## Variables de entorno (Vercel)

| Variable | Uso |
|----------|-----|
| `EMT_EMAIL` | Credencial de login EMT |
| `EMT_PASSWORD` | Credencial de login EMT |
| `EMT_CLIENT_ID` | (opcional) X-ClientId EMT |
| `EMT_PASSKEY` | (opcional) passKey EMT |

Las credenciales NUNCA llegan al navegador del usuario.

---

## Por qué Node.js en Vercel y no Laravel/Flask

- Vercel no soporta PHP ni Python nativamente
- Node.js ya funciona en Vercel con los proxies actuales
- Todo en el mismo repo y mismo despliegue
- El resultado técnico es equivalente a cualquier otro backend para los requisitos del TFC

---

## Componente social (pendiente — clave para la nota)

Supabase gestiona los reportes de usuarios en tiempo real:

- Avisos de retraso
- Asientos libres
- Sistema de votos para validar reportes
- Realtime: todos los usuarios ven los reportes al instante (Supabase Realtime)

---

## Pendiente de implementar

- [ ] Endpoint `GET /api/stops` — consulta paradas a Supabase desde el servidor
- [ ] Endpoint `GET /api/arrivals` — llama a EMT/CRTM con caché compartida en servidor
- [ ] Endpoint `POST /api/reports` — guarda reportes de usuarios en Supabase
- [ ] Endpoint `GET /api/reports` — devuelve reportes activos cercanos
- [ ] Quitar cliente Supabase JS del frontend (excepto Auth)
- [ ] Caché compartida en servidor (Vercel KV o en memoria del proceso Edge)
- [ ] UI para reportar incidencias en el mapa
- [ ] Sistema de votos para validar reportes

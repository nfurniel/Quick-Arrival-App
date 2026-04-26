# Quick Arrival App

Aplicacion web de transporte publico en tiempo real para la Comunidad de Madrid. Muestra paradas de autobuses urbanos (EMT) e interurbanos (CRTM) en un mapa interactivo, con tiempos de llegada en tiempo real, seguimiento GPS de buses, reportes colaborativos entre usuarios, presencia de otros usuarios en el mapa, capa de trafico en tiempo real y sistema de soporte con panel de administracion.

Proyecto desarrollado como Trabajo de Fin de Ciclo (TFC) de 2o de DAW.

---

## Tecnologias

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 19 + Vite |
| Mapa | Leaflet + React-Leaflet |
| Backend | Node.js — Edge Functions en Vercel (`/api`) |
| Base de datos | Supabase (PostgreSQL) |
| Autenticacion | Supabase Auth |
| Presencia colaborativa | Supabase REST (polling, tabla `user_locations`) |
| Email transaccional | Gmail SMTP via Nodemailer |
| APIs de transporte | EMT Madrid (buses urbanos) + CRTM (buses interurbanos) |
| Trafico en tiempo real | TomTom Traffic API (incidencias + flow tiles) |
| Enrutado GPS | OSRM (routing publico sin API key) |
| Tiles del mapa | CartoDB (claro y oscuro) |
| Despliegue | Vercel |
| Animaciones | GSAP, Framer Motion, Three.js / React Three Fiber |

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                     NAVEGADOR (React)                        │
│  Solo hace fetch a /api/*  +  Supabase Auth/REST directo     │
│  Excepcion: tiles de trafico van directo a TomTom (ver nota) │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│              BACKEND — Vercel Edge Functions                  │
│                                                              │
│  /api/stops        /api/lines       /api/arrivals            │
│  /api/reports      /api/report-votes                         │
│  /api/traffic        ← incidencias TomTom con cache global   │
│  /api/support        ← tickets de soporte + email Gmail SMTP │
└────────┬─────────────────────────┬────────────────┬──────────┘
         │                         │                │
┌────────▼──────────┐   ┌──────────▼──────┐  ┌─────▼────────┐
│  Supabase (BD)    │   │  EMT / CRTM     │  │  TomTom API  │
│  static_stops     │   │  APIs transporte│  │  Incidencias │
│  favourites       │   └─────────────────┘  └──────────────┘
│  reports          │
│  report_votes     │
│  user_locations   │
│  support_tickets  │
│  Supabase Auth    │
└───────────────────┘
```

**El navegador nunca toca la base de datos directamente** para operaciones de negocio. La excepcion es Supabase Auth (disenado para usarse desde el cliente, igual que Firebase Auth) y las lecturas de presencia (`user_locations`), que usan la anon key con RLS.

**Los tiles de trafico (flow tiles) se piden directamente al servidor de TomTom** desde el navegador. Esto es inevitable: son imagenes de mapa que Leaflet descarga tile a tile, y enrutarlas por el backend seria demasiado lento e imposible con el plan gratuito de Vercel. Las incidencias en cambio si pasan por el backend para ocultar la API key y aprovechar la cache compartida.

---

## Flujos de datos principales

### 1. Autenticacion

```
Usuario rellena login
  └─▶ AuthModal.jsx
        └─▶ supabase.auth.signInWithPassword()   ← cliente Supabase Auth (excepcion justificada)
              └─▶ App.jsx detecta onAuthStateChange(SIGNED_IN)
                    └─▶ navega a /mapa
```

En registro guarda `full_name` en los metadatos del usuario. La opcion "Recordarme" elige entre `localStorage` (persistente) o `sessionStorage` (solo la pestana) mediante `customStorage` en `supabaseClient.js`.

Para recuperacion de contrasena: `supabase.auth.resetPasswordForEmail()` envia email con enlace. Al hacer clic, Supabase redirige a la app con un token en el hash. `supabaseClient.js` detecta `type=recovery` en el hash de forma sincrona (antes de que React monte) para evitar que el auto-login interfiera. `App.jsx` detecta el evento `PASSWORD_RECOVERY` y muestra `ResetPasswordModal.jsx`.

---

### 2. Carga de paradas en el mapa

```
Usuario mueve o hace zoom en el mapa
  └─▶ BusStopsLayer.jsx detecta evento "moveend" (debounce 300ms)
        └─▶ stopsService.getStopsInBounds(minLat, maxLat, minLng, maxLng)
              └─▶ GET /api/stops?minLat=...&maxLat=...&minLng=...&maxLng=...
                    └─▶ api/stops.js consulta Supabase con SUPABASE_SERVICE_KEY
                          └─▶ tabla static_stops filtra por bbox + cod_mode in (6,8)
                                └─▶ max 500 paradas → marcadores en el mapa
```

Solo se cargan paradas con zoom >= 15. Por debajo de ese nivel hay demasiadas paradas y Leaflet no esta pensado para renderizar miles de marcadores.

---

### 3. Tiempos de llegada (popup de parada)

```
Usuario hace clic en una parada
  └─▶ crtmService.getStopTimes(codStop)
        └─▶ GET /api/arrivals?codStop=...
              ├─ si cod_mode === 6 (EMT urbano):
              │    └─▶ api/arrivals.js llama a EMT con token cacheado en servidor
              │          └─▶ EMT Madrid API devuelve tiempos
              │
              └─ si cod_mode === 8 (CRTM interurbano):
                   └─▶ api/arrivals.js llama al CRTM con spoofing de Origin
                         └─▶ CRTM API devuelve tiempos
```

`/api/arrivals` tiene cache compartida en servidor: 20s para EMT, 30s para CRTM.
Si 100 usuarios consultan la misma parada a la vez, solo se hace 1 peticion a la API externa.

---

### 4. Seguimiento GPS de un bus

```
Usuario hace clic en una fila de llegada (linea + destino)
  └─▶ MapPage.jsx guarda selectedBus en estado
        └─▶ LiveBusLayer.jsx lanza polling cada 8 segundos:
              ├─ muestra "Buscando el bus en el mapa..." mientras no hay posicion
              ├─ si tras 10 segundos no llega GPS: aviso de timeout al usuario
              └─▶ crtmService.getBusLocation(mode, codLine, direction, codStop)
                    ├─ modo 6 (EMT): extrae GPS del response de llegadas
                    └─ modo 8 (CRTM): GET /api/crtm/Widget/GetLineLocation...
                          └─▶ filtra por campo direction del vehiculo (lado cliente)
                          └─▶ selecciona el bus mas cercano a la parada (Math.hypot)
                          └─▶ GET OSRM routing API → dibuja ruta en el mapa
```

---

### 5. Trafico en tiempo real

```
Usuario activa el boton de trafico
  │
  ├─▶ TrafficIncidentsLayer.jsx (accidentes, obras, cortes)
  │     └─▶ GET /api/traffic?minLon=...&minLat=...&maxLon=...&maxLat=...
  │           └─▶ api/traffic.js redondea el bbox a una cuadricula de ~2km
  │                 └─▶ cache 5 minutos — vistas cercanas reutilizan la misma respuesta
  │                       └─▶ TomTom Traffic Incidents API v5
  │                             └─▶ marcadores con icono Tabler segun tipo de incidencia
  │
  └─▶ TileLayer flow tiles (colores en carreteras)
        └─▶ Leaflet pide imagenes directamente a TomTom
              └─▶ api.tomtom.com/traffic/map/4/tile/flow/relative-delay/{z}/{x}/{y}.png
                    └─▶ solo pinta naranja/rojo (relative-delay omite el verde)
```

---

### 6. Paradas favoritas

```
Usuario pulsa el icono de corazon en una parada
  └─▶ MapPage.jsx abre FavouriteModal (pide un alias)
        └─▶ favoritesService.addFavourite(stopId, alias)
              └─▶ supabase.from('favourites').insert(...)   ← RLS: cada usuario solo ve los suyos
                    └─▶ el alias aparece en el Sidebar
```

Al seleccionar un favorito en el Sidebar: el mapa vuela a la parada y abre un popup con tiempos en tiempo real.

---

### 7. Reportes colaborativos

```
Usuario activa "Voy en este bus" en el panel de seguimiento
  └─▶ puede pulsar "Reportar" → ReportModal.jsx (3 pasos)
        ├─ Paso 1: elige categoria (asientos, puntualidad, ocupacion, ruido, temperatura, conduccion, accesibilidad)
        ├─ Paso 2: elige opcion dentro de la categoria
        └─ Paso 3: descripcion opcional + enviar
              └─▶ POST /api/reports { type, metadata: { value, busId }, lineName, lat, lng }
                    ├─ validaciones: tipo, opcion, coordenadas en España, max 150 chars
                    ├─ limite: 1 reporte por tipo/bus/usuario cada 2 horas
                    └─▶ reportes guardados en BD tabla reports

ReportsPanel.jsx (dentro del panel de seguimiento)
  └─▶ GET /api/reports?lineName=X&busId=Y   ← filtra por bus concreto, no por toda la linea
        └─▶ agrupa por categoria → mostrando la opcion mas frecuente por grupo
              └─▶ usuarios con "Voy en este bus" pueden votar cada reporte
```

Los reportes caducan automaticamente en 2 horas. El `busId` del vehiculo se guarda en el campo `metadata` JSONB para aislar los reportes por bus concreto.

---

### 8. Presencia colaborativa

```
MapPage.jsx monta usePresence(userLocation, userName, avatarIndex)
  └─▶ Al conectar y cada 10 minutos:
        └─▶ supabase.from('user_locations').upsert({ lat, lng, name, avatar })
              └─▶ lectura de otros usuarios activos en los ultimos 10 minutos
                    └─▶ renderiza avatares de otros usuarios en el mapa
```

Implementado con polling a Supabase REST (no Realtime). Cada usuario guarda su posicion en la tabla `user_locations` y lee las posiciones de los demas periodicamente.

---

### 9. Sistema de soporte

```
Usuario pulsa "Soporte" en el Sidebar
  └─▶ SupportModal.jsx (elige tipo + descripcion opcional)
        └─▶ POST /api/support { type, description }
              └─▶ ticket guardado en BD tabla support_tickets (status: pending)

Admin accede a /admin → AdminPanel.jsx
  └─▶ GET /api/support   ← solo si app_metadata.role === 'admin'
        └─▶ tabla de tickets con estado, tipo y descripcion
              ├─▶ "Responder": textarea + enviar
              │     └─▶ PATCH /api/support { ticketId, response }
              │           ├─ actualiza ticket: admin_response + responded_at + status: reviewed
              │           └─ envia email al usuario via Gmail SMTP (Nodemailer)
              └─▶ "Eliminar": confirmacion → DELETE /api/support { ticketId }
```

El rol de administrador se asigna via SQL en Supabase: `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = 'tu@email.com'`.

---

## Estructura del proyecto

```
Quick-Arrival-App/
├── api/                          # Backend — Edge Functions de Vercel
│   ├── stops.js                  # GET /api/stops — paradas por viewport
│   ├── lines.js                  # GET /api/lines — todas las lineas unicas
│   ├── arrivals.js               # GET /api/arrivals — tiempos EMT/CRTM con cache compartida
│   ├── traffic.js                # GET /api/traffic — incidencias TomTom con cache y bbox snap
│   ├── reports.js                # GET + POST /api/reports — reportes colaborativos por bus
│   ├── report-votes.js           # POST /api/report-votes — votos en reportes
│   ├── support.js                # GET + POST + PATCH + DELETE /api/support — tickets de soporte
│   ├── emt-proxy.js              # Proxy EMT (legacy, aun usado para GPS de buses)
│   └── crtm-proxy.js             # Proxy CRTM con spoofing de Origin/Referer
│
├── src/
│   ├── App.jsx                   # Rutas (/, /mapa, /admin) + control de sesion Supabase
│   ├── main.jsx                  # Punto de entrada React
│   ├── supabaseClient.js         # Cliente Supabase + logica "Recordarme" + deteccion recovery
│   │
│   ├── services/
│   │   ├── stopsService.js       # Paradas y lineas
│   │   ├── crtmService.js        # Tiempos, GPS y favoritos
│   │   ├── emtService.js         # Token EMT y GPS buses urbanos
│   │   └── favoritesService.js   # CRUD de paradas favoritas en Supabase
│   │
│   ├── hooks/
│   │   └── usePresence.js        # Presencia colaborativa via polling a user_locations
│   │
│   └── components/
│       ├── first-page/           # Landing page (login, registro, recuperacion)
│       ├── map-page/
│       │   ├── MapPage.jsx               # Componente principal del mapa
│       │   ├── MapPage.css
│       │   ├── BusStopsLayer.jsx         # Capa de paradas con popups
│       │   ├── LiveBusLayer.jsx          # Seguimiento GPS del bus
│       │   ├── TrafficIncidentsLayer.jsx # Incidencias de trafico (iconos Tabler)
│       │   ├── FavouritePopupLayer.jsx   # Popup de parada favorita (desktop)
│       │   ├── FavouriteModal.jsx        # Modal para nombrar un favorito
│       │   ├── StopBottomSheet.jsx       # Panel inferior de parada (movil)
│       │   ├── ReportModal.jsx           # Modal de reporte en 3 pasos
│       │   ├── ReportModal.css
│       │   ├── ReportsPanel.jsx          # Panel de reportes agrupados con votos
│       │   ├── ReportsPanel.css
│       │   ├── SupportModal.jsx          # Modal de soporte al usuario
│       │   ├── SupportModal.css
│       │   ├── Sidebar.jsx               # Menu lateral (favoritos, soporte, admin)
│       │   ├── LocateControl.jsx         # Boton centrar en usuario
│       │   └── mapIcons.js               # Iconos Leaflet
│       └── admin/
│           ├── AdminPanel.jsx            # Panel admin: tickets, respuesta email, eliminar
│           └── AdminPanel.css
│
├── scripts/
│   ├── setup-stops.sql           # SQL para crear la tabla en Supabase
│   └── importStops.mjs           # Importa paradas del CRTM a Supabase
│
├── vercel.json                   # Rewrites de rutas en Vercel
└── vite.config.js                # Plugin local que replica todas las Edge Functions
```

---

## Endpoints del backend (`/api`)

| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/stops` | Paradas en el viewport. Params: `minLat`, `maxLat`, `minLng`, `maxLng` |
| `GET /api/lines` | Todas las lineas unicas. Cache HTTP 1 hora |
| `GET /api/arrivals` | Tiempos EMT o CRTM con cache compartida. Param: `codStop` |
| `GET /api/traffic` | Incidencias TomTom con cache 5 min y bbox snap. Params: `minLon`, `minLat`, `maxLon`, `maxLat` |
| `GET /api/reports` | Reportes activos de las ultimas 2h. Params: `lineName`, `busId` (opcional) |
| `POST /api/reports` | Crear reporte. Body: `type`, `metadata`, `description`, `lat`, `lng`, `lineName`, `busId` |
| `POST /api/report-votes` | Votar un reporte. Body: `reportId`, `voteType` |
| `POST /api/support` | Crear ticket de soporte. Body: `type`, `description`. Auth requerida |
| `GET /api/support` | Listar todos los tickets. Solo admin |
| `PATCH /api/support` | Responder ticket y enviar email. Body: `ticketId`, `response`. Solo admin |
| `DELETE /api/support` | Eliminar ticket. Body: `ticketId`. Solo admin |

---

## Variables de entorno

### Desarrollo (`.env`)

```
# Supabase — solo la service key va en .env (URL y anon key estan hardcodeadas en supabaseClient.js)
SUPABASE_SERVICE_KEY=tu_service_key

# EMT Madrid
VITE_EMT_EMAIL=tu_email
VITE_EMT_PASSWORD=tu_password
VITE_EMT_CLIENT_ID=tu_client_id
VITE_EMT_PASSKEY=tu_passkey
EMT_EMAIL=tu_email
EMT_PASSWORD=tu_password
EMT_CLIENT_ID=tu_client_id
EMT_PASSKEY=tu_passkey

# TomTom — dos keys separadas por diseño:
# TOMTOM_API_KEY: solo servidor (incidencias via /api/traffic)
# VITE_TOMTOM_API_KEY: frontend (flow tiles directos a TomTom)
TOMTOM_API_KEY=tu_key
VITE_TOMTOM_API_KEY=tu_key

# Gmail SMTP — para enviar emails de respuesta a tickets de soporte
# Requiere una contrasena de aplicacion de Google (no la contrasena normal)
GMAIL_USER=tu_email@gmail.com
GMAIL_APP_PASSWORD=xxxx_xxxx_xxxx_xxxx
```

### Produccion (variables de Vercel)

```
SUPABASE_SERVICE_KEY
EMT_EMAIL / EMT_PASSWORD / EMT_CLIENT_ID / EMT_PASSKEY
TOMTOM_API_KEY
VITE_TOMTOM_API_KEY
GMAIL_USER
GMAIL_APP_PASSWORD
```

---

## Base de datos (Supabase)

### Tabla `static_stops` — 13.600+ paradas

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `stop_id` | bigint PK | `cod_mode * 1_000_000 + cod_estacion` |
| `name` | text | Nombre de la parada |
| `lat` / `lng` | float | Coordenadas |
| `cod_mode` | int | 6 = EMT urbano, 8 = CRTM interurbano |
| `cod_estacion` | int | Codigo interno CRTM |
| `lines` | text | Lineas separadas por coma |

### Tabla `favourites` — paradas guardadas por usuario

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | uuid PK | Generado automaticamente |
| `user_id` | uuid | FK a auth.users (RLS) |
| `stop_id` | bigint | FK a static_stops |
| `alias` | text | Nombre personalizado (ej: "Casa") |

### Tabla `reports` — reportes colaborativos en bus

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | uuid PK | Generado automaticamente |
| `user_id` | uuid | FK a auth.users |
| `type` | text | seats, punctuality, crowding, noise, temperature, driver, accessibility |
| `metadata` | jsonb | `{ value: "opcion", busId: "vehicleId" }` |
| `description` | text | Comentario libre (max 150 chars) |
| `lat` / `lng` | float | Coordenadas al momento del reporte |
| `line_name` | text | Nombre de la linea (ej: "27") |
| `status` | text | `active` |
| `created_at` | timestamptz | Reportes con mas de 2h se excluyen en consultas |

### Tabla `report_votes` — votos en reportes

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `report_id` | uuid | FK a reports |
| `user_id` | uuid | FK a auth.users |
| `vote_type` | text | `up` o `down` |

### Tabla `user_locations` — presencia colaborativa

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `user_id` | uuid PK | FK a auth.users |
| `lat` / `lng` | float | Posicion del usuario |
| `name` | text | Nombre de usuario |
| `avatar` | int | Indice del avatar seleccionado |
| `updated_at` | timestamptz | Se actualiza cada 10 minutos. Usuarios con > 10min se ignoran |

### Tabla `support_tickets` — tickets de soporte

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | uuid PK | Generado automaticamente |
| `user_id` | uuid | FK a auth.users |
| `type` | text | `bug`, `datos`, `sugerencia`, `cuenta`, `otro` |
| `description` | text | Descripcion del problema (max 500 chars) |
| `status` | text | `pending`, `reviewed`, `dismissed` |
| `admin_response` | text | Respuesta del administrador |
| `responded_at` | timestamptz | Timestamp de la respuesta |
| `created_at` | timestamptz | Timestamp de creacion |

---

## Instalacion y desarrollo

```bash
npm install
npm run dev     # arranca frontend + Edge Functions locales
npm run build   # build de produccion
```

`vite.config.js` replica el comportamiento de todas las Edge Functions en local mediante un plugin de middleware. No hace falta `vercel dev`.

---

## APIs externas

| API | Para que se usa | Via |
|-----|----------------|-----|
| Supabase Auth | Login, registro, recuperacion de contrasena | Cliente (disenado para ello) |
| Supabase REST | Paradas, favoritos, presencia, soporte | Backend (service key) y cliente (anon key + RLS) |
| EMT Madrid | Tiempos y GPS buses urbanos | Backend (credenciales en env) |
| CRTM Widgets | Tiempos y GPS buses interurbanos | Backend (spoofing Origin/Referer) |
| TomTom Traffic | Incidencias de trafico | Backend (/api/traffic, cache 5 min) |
| TomTom Traffic | Flow tiles (colores carreteras) | Frontend directo (tiles de imagen) |
| OSRM | Ruta GPS del bus a la parada | Frontend directo (API publica) |
| CartoDB | Tiles del mapa base (claro y oscuro) | Frontend directo (API publica) |
| Gmail SMTP | Emails de respuesta a tickets de soporte | Backend (Nodemailer + app password Google) |

---

## Decisiones de arquitectura

**Cache compartida en servidor para tiempos de llegada**
`/api/arrivals` guarda en memoria las respuestas de EMT y CRTM. Si 100 usuarios consultan la misma parada al mismo tiempo, solo se hace 1 peticion a la API externa. En el frontend (antes) cada usuario hacia su propia peticion.

**TomTom flow tiles van directo desde el frontend**
Los tiles son imagenes de mapa que Leaflet pide de 20 en 20 al mover/hacer zoom. Enrutarlas por el backend las haria lentas y agotaria la cuota de invocaciones gratuitas de Vercel. Se usa `VITE_TOMTOM_API_KEY` con restriccion de dominio en TomTom para proteger la key.

**Bbox redondeado en /api/traffic**
Las coordenadas del mapa cambian con cada movimiento. Sin redondeo, cada posicion generaria una entrada de cache distinta y la cache nunca daria hit. Se redondea a una cuadricula de ~2km para agrupar peticiones cercanas.

**Presencia con polling en lugar de Supabase Realtime**
Supabase Realtime Presence tiene limitaciones en el plan gratuito y mayor complejidad. El polling cada 10 minutos es suficiente para mostrar a otros usuarios en el mapa sin necesidad de actualizaciones en tiempo real. Usa la tabla `user_locations` con upsert y filtro por `updated_at`.

**Gmail SMTP para emails de soporte**
Se usa la cuenta Gmail del proyecto con una contrasena de aplicacion de Google (sin OAuth). Evita depender de servicios externos de pago (Resend, SendGrid) para el volumen bajo de emails de soporte. Nodemailer gestiona la conexion SMTP con el servidor de Gmail.

**Por que Node.js en Vercel y no Laravel / Express externo**
Vercel ya ejecuta las funciones de los proxies en Node.js. Extender eso con endpoints propios evita aprender tecnologia nueva y mantiene todo en el mismo repositorio con despliegue automatico.

**Por que Supabase Auth sigue en el frontend**
Supabase Auth esta disenado para usarse desde el cliente, igual que Firebase Auth o Auth0. La anon key siendo publica es por diseno — la seguridad viene de las reglas RLS en la base de datos.

**Paradas solo al zoom >= 15**
Por encima de ese nivel hay demasiadas paradas y Leaflet no esta pensado para renderizar miles de marcadores a la vez.

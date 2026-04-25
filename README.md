# Quick Arrival App

Aplicacion web de transporte publico en tiempo real para la Comunidad de Madrid. Muestra paradas de autobuses urbanos (EMT) e interurbanos (CRTM) en un mapa interactivo, con tiempos de llegada en tiempo real, seguimiento GPS de buses, presencia colaborativa de usuarios y capa de trafico en tiempo real.

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
| Presencia en tiempo real | Supabase Realtime (Presence) |
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
│  Solo hace fetch a /api/*  +  Supabase Auth                  │
│  Excepcion: tiles de trafico van directo a TomTom (ver nota) │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│              BACKEND — Vercel Edge Functions                  │
│                                                              │
│  /api/stops        /api/lines       /api/arrivals            │
│  /api/reports      /api/report-votes                         │
│  /api/traffic        ← incidencias TomTom con cache global   │
└────────┬─────────────────────────┬────────────────┬──────────┘
         │                         │                │
┌────────▼──────────┐   ┌──────────▼──────┐  ┌─────▼────────┐
│  Supabase (BD)    │   │  EMT / CRTM     │  │  TomTom API  │
│  static_stops     │   │  APIs transporte│  │  Incidencias │
│  Supabase Auth    │   └─────────────────┘  └──────────────┘
│  Supabase Realtime│
└───────────────────┘
```

**El navegador nunca toca la base de datos directamente.** La excepcion es Supabase Auth, disenado para usarse desde el cliente (igual que Firebase Auth o Auth0).

**Los tiles de trafico (flow tiles) se piden directamente al servidor de TomTom** desde el navegador. Esto es inevitable: son imagenes de mapa que Leaflet descarga tile a tile, y enrutarlas por el backend seria demasiado lento e imposible con el plan gratuito de Vercel. Las incidencias en cambio si pasan por el backend para ocultar la API key y aprovechar la cache compartida.

---

## Flujos de datos principales

### 1. Autenticacion

```
Usuario rellena login
  └─▶ AuthModal.jsx
        └─▶ supabase.auth.signInWithPassword()   ← cliente Supabase Auth (excepcion justificada)
              └─▶ App.jsx detecta onAuthStateChange
                    └─▶ navega a /mapa
```

En registro guarda `full_name` en los metadatos del usuario. La opcion "Recordarme" elige entre `localStorage` (persistente) o `sessionStorage` (solo la pestana).

Para recuperacion de contrasena: `supabase.auth.resetPasswordForEmail()` envia un email con un enlace. Al hacer clic, Supabase redirige a la app con un token. `App.jsx` detecta el evento `PASSWORD_RECOVERY` y muestra `ResetPasswordModal.jsx`.

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
  │                             └─▶ marcadores con icono segun tipo de incidencia
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
  └─▶ Canal Supabase Realtime "map-presence"
        └─▶ emite posicion + nombre + avatar cada 10 segundos
              └─▶ renderiza avatares de otros usuarios en el mapa
```

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
│   ├── emt-proxy.js              # Proxy EMT (legacy, aun usado para GPS de buses)
│   └── crtm-proxy.js             # Proxy CRTM con spoofing de Origin/Referer
│
├── src/
│   ├── App.jsx                   # Rutas (/ y /mapa) + control de sesion Supabase
│   ├── main.jsx                  # Punto de entrada React
│   ├── supabaseClient.js         # Cliente Supabase + logica "Recordarme"
│   │
│   ├── services/
│   │   ├── stopsService.js       # Paradas y lineas
│   │   ├── crtmService.js        # Tiempos, GPS y favoritos
│   │   ├── emtService.js         # Token EMT y GPS buses urbanos
│   │   └── favoritesService.js   # CRUD de paradas favoritas en Supabase
│   │
│   ├── hooks/
│   │   └── usePresence.js        # Hook Supabase Realtime para presencia
│   │
│   └── components/
│       ├── first-page/           # Landing page
│       └── map-page/
│           ├── MapPage.jsx               # Componente principal del mapa
│           ├── MapPage.css               # Estilos (CSS nesting)
│           ├── BusStopsLayer.jsx         # Capa de paradas con popups
│           ├── LiveBusLayer.jsx          # Seguimiento GPS del bus
│           ├── TrafficIncidentsLayer.jsx # Incidencias de trafico (TomTom)
│           ├── FavouritePopupLayer.jsx   # Popup de parada favorita (desktop)
│           ├── FavouriteModal.jsx        # Modal para nombrar un favorito
│           ├── StopBottomSheet.jsx       # Panel inferior de parada (movil)
│           ├── ReportModal.jsx           # Modal de reporte en 3 pasos
│           ├── ReportModal.css
│           ├── ReportsPanel.jsx          # Panel de reportes agrupados por categoria con votos
│           ├── ReportsPanel.css
│           ├── Sidebar.jsx               # Menu lateral
│           ├── LocateControl.jsx         # Boton centrar en usuario
│           └── mapIcons.js               # Iconos Leaflet
│
├── scripts/
│   ├── setup-stops.sql           # SQL para crear la tabla en Supabase
│   └── importStops.mjs           # Importa paradas del CRTM a Supabase
│
├── vercel.json                   # Rewrites de rutas en Vercel
└── vite.config.js                # Proxies locales que replican las Edge Functions
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

---

## Variables de entorno

### Desarrollo (`.env`)

```
# Supabase
VITE_SUPABASE_URL=https://tumoqeuueqbvfstdhdmn.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
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
```

### Produccion (variables de Vercel)

```
SUPABASE_SERVICE_KEY
EMT_EMAIL / EMT_PASSWORD / EMT_CLIENT_ID / EMT_PASSKEY
TOMTOM_API_KEY
VITE_TOMTOM_API_KEY
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
| `type` | text | Categoria: seats, punctuality, crowding, noise, temperature, driver, accessibility |
| `metadata` | jsonb | `{ value: "opcion", busId: "vehicleId" }` — busId aisla el reporte al bus concreto |
| `description` | text | Comentario libre (max 150 chars) |
| `lat` / `lng` | float | Coordenadas al momento del reporte |
| `line_name` | text | Nombre de la linea (ej: "27") |
| `status` | text | `active` — los inactivos se ignoran |
| `created_at` | timestamptz | Timestamp de creacion (reportes > 2h se excluyen en consultas) |

### Tabla `report_votes` — votos en reportes

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `report_id` | uuid | FK a reports |
| `user_id` | uuid | FK a auth.users |
| `vote_type` | text | `up` o `down` |

---

## Instalacion y desarrollo

```bash
npm install
npm run dev     # arranca frontend + Edge Functions locales
npm run build   # build de produccion
```

`vite.config.js` replica el comportamiento de las Edge Functions en local. No hace falta `vercel dev`.

---

## APIs externas

| API | Para que se usa | Via |
|-----|----------------|-----|
| Supabase Auth | Login, registro, recuperacion | Cliente (disenado para ello) |
| Supabase REST | Paradas y favoritos | Backend (service key) |
| Supabase Realtime | Presencia de usuarios | Cliente |
| EMT Madrid | Tiempos y GPS urbanos | Backend (credenciales en env) |
| CRTM Widgets | Tiempos y GPS interurbanos | Backend (spoofing Origin) |
| TomTom Traffic | Incidencias | Backend (/api/traffic) |
| TomTom Traffic | Flow tiles (colores carreteras) | Frontend directo (tiles) |
| OSRM | Ruta GPS del bus a la parada | Frontend directo (publica) |
| CartoDB | Tiles del mapa base | Frontend directo (publica) |

---

## Decisiones de arquitectura

**Cache compartida en servidor para tiempos de llegada**
`/api/arrivals` guarda en memoria las respuestas de EMT y CRTM. Si 100 usuarios consultan la misma parada al mismo tiempo, solo se hace 1 peticion a la API externa. En el frontend (antes) cada usuario hacia su propia peticion.

**TomTom flow tiles van directo desde el frontend**
Los tiles son imagenes de mapa que Leaflet pide de 20 en 20 al mover/hacer zoom. Enrutarlas por el backend las haria lentas y agotaria la cuota de invocaciones gratuitas de Vercel. Se usa `VITE_TOMTOM_API_KEY` con restriccion de dominio en TomTom para proteger la key.

**Bbox redondeado en /api/traffic**
Las coordenadas del mapa cambian con cada movimiento. Sin redondeo, cada posicion generaria una entrada de cache distinta y la cache nunca daria hit. Se redondea a una cuadricula de ~2km para agrupar peticiones cercanas.

**Por que Node.js en Vercel y no Laravel / Express externo**
Vercel ya ejecuta las funciones de los proxies en Node.js. Extender eso con endpoints propios evita aprender tecnologia nueva y mantiene todo en el mismo repositorio con despliegue automatico.

**Por que Supabase Auth sigue en el frontend**
Supabase Auth esta disenado para usarse desde el cliente, igual que Firebase Auth o Auth0. Es el unico acceso directo del navegador a Supabase.

**Paradas solo al zoom >= 15**
Por encima de ese nivel hay demasiadas paradas y Leaflet no esta pensado para renderizar miles de marcadores a la vez.

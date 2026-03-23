# Quick Arrival App

Aplicacion web de transporte publico en tiempo real para la Comunidad de Madrid. Muestra paradas de autobuses urbanos (EMT) e interurbanos (CRTM) en un mapa interactivo, con tiempos de llegada y seguimiento GPS de los buses.

Proyecto desarrollado como Trabajo de Fin de Ciclo (TFC) de 2do de DAW.

## Tecnologias

- **Frontend:** React 19 + Vite
- **Mapa:** Leaflet + React-Leaflet
- **Backend:** Supabase (autenticacion + base de datos)
- **APIs externas:** EMT Madrid (buses urbanos) + CRTM (buses interurbanos)
- **Despliegue:** Vercel

## Funcionalidades principales

- Mapa interactivo con geolocalizacion del usuario
- Paradas de bus cargadas desde base de datos Supabase (13.600+ paradas)
- Tiempos de llegada en tiempo real (EMT para urbanos, CRTM para interurbanos)
- Seguimiento GPS de buses en movimiento
- Modo claro/oscuro
- Sistema de autenticacion (login, registro, recuperacion de contraseña)
- Cache inteligente y reintentos automaticos cuando la API falla

## Estructura del proyecto

```
src/
├── components/
│   ├── first-page/          # Landing page y autenticacion
│   │   ├── FirstPage.jsx
│   │   ├── header/          # Header, AuthModal, CardNav
│   │   ├── body/            # Secciones de la landing
│   │   └── footer/          # Footer
│   └── map-page/            # Mapa interactivo
│       ├── MapPage.jsx      # Componente principal del mapa
│       └── MapPage.css      # Estilos y animaciones
├── services/
│   ├── crtmService.js       # Tiempos en tiempo real (CRTM + EMT)
│   ├── emtService.js        # API de EMT Madrid (login + llegadas)
│   └── stopsService.js      # Consulta de paradas desde Supabase
├── supabaseClient.js        # Configuracion de Supabase
├── App.jsx                  # Rutas y control de autenticacion
└── main.jsx                 # Punto de entrada
api/
└── crtm-proxy.js            # Proxy en Vercel para el CRTM
scripts/
├── setup-stops.sql          # SQL para preparar la tabla de paradas
└── importStops.mjs          # Script para importar paradas a Supabase
```

## Instalacion y desarrollo

```bash
# Instalar dependencias
npm install

# Arrancar en desarrollo
npm run dev

# Build para produccion
npm run build
```

## Variables de entorno (.env)

```
VITE_EMT_EMAIL=tu_email
VITE_EMT_PASSWORD=tu_password
VITE_EMT_CLIENT_ID=tu_client_id
VITE_EMT_PASSKEY=tu_passkey
```

Las credenciales de EMT se obtienen registrandose en https://apidocs.emtmadrid.es/

## Base de datos (Supabase)

La app usa Supabase para:
- **Autenticacion:** Login, registro y recuperacion de contraseña
- **Datos estaticos:** Tabla `static_stops` con 13.600+ paradas de bus precargadas
- **Tablas adicionales:** profiles, reports, favourites, achievements, etc.

Para importar las paradas (solo hace falta una vez):
1. Ejecutar `scripts/setup-stops.sql` en el SQL Editor de Supabase
2. Ejecutar `node scripts/importStops.mjs`

## APIs utilizadas

| API | Uso | Auth |
|-----|-----|------|
| Supabase | Paradas, usuarios, datos | Anon key |
| EMT Madrid | Tiempos urbanos en tiempo real | Email + password |
| CRTM Widgets | Tiempos interurbanos + GPS buses | Sin auth (proxy) |
| CartoDB | Tiles del mapa (claro/oscuro) | Sin auth |

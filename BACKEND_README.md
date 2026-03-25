# Backend - Quick Arrival App

Documentacion completa del backend de Quick Arrival App: base de datos, autenticacion, politicas de seguridad, proxy API y scripts de datos.

---

## Indice

1. [Arquitectura general](#1-arquitectura-general)
2. [Supabase - Base de datos](#2-supabase---base-de-datos)
3. [Esquema de tablas](#3-esquema-de-tablas)
4. [Funciones SQL personalizadas](#4-funciones-sql-personalizadas)
5. [Triggers](#5-triggers)
6. [Politicas RLS (Row Level Security)](#6-politicas-rls-row-level-security)
7. [Sistema de roles](#7-sistema-de-roles)
8. [Proxy API (Vercel)](#8-proxy-api-vercel)
9. [Scripts de datos](#9-scripts-de-datos)
10. [APIs externas](#10-apis-externas)
11. [Auditorias y correcciones aplicadas](#11-auditorias-y-correcciones-aplicadas)

---

## 1. Arquitectura general

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTE (React)                          │
│                                                                  │
│  supabaseClient.js ──► Supabase (auth + datos)                   │
│  crtmService.js ──────► Proxy Vercel ──► API CRTM (interurbanos)│
│  emtService.js ───────► Vercel Rewrite ──► API EMT (urbanos)    │
│  stopsService.js ─────► Supabase (tabla static_stops)            │
└──────────────────────────────────────────────────────────────────┘
         │                      │                    │
         ▼                      ▼                    ▼
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│   Supabase   │    │   Vercel Edge     │    │  EMT Madrid  │
│              │    │                   │    │   OpenAPI     │
│ - Auth       │    │ api/crtm-proxy.js │    │              │
│ - PostgreSQL │    │ (disfraza origen  │    │ /v2/transport │
│ - RLS        │    │  como crtm.es)    │    │ /busemtmad/  │
└──────────────┘    └───────────────────┘    └──────────────┘
```

**Flujo de datos:**

- Las **paradas** se cargan desde Supabase (tabla `static_stops`, 13.600+ registros)
- Los **tiempos de llegada** se piden en tiempo real a EMT (urbanos) o CRTM (interurbanos)
- La **autenticacion** la gestiona Supabase Auth (email + password)
- El **proxy CRTM** es necesario porque su API bloquea peticiones de origenes externos

---

## 2. Supabase - Base de datos

| Dato | Valor |
|------|-------|
| Proyecto | App |
| Region | West EU (Ireland) |
| URL | `https://tumoqeuueqbvfstdhdmn.supabase.co` |
| Creado | 2026-02-06 |

La conexion se configura en `src/supabaseClient.js` con la **anon key** (clave publica, segura para el frontend). La seguridad de los datos la garantizan las politicas RLS, no la clave.

**Storage personalizado:** El cliente usa un sistema de storage dual que alterna entre `localStorage` (sesion persistente) y `sessionStorage` (sesion temporal) segun la opcion "Recordarme" del usuario.

---

## 3. Esquema de tablas

### 3.1 Datos de transporte

#### `static_stops` — Paradas de autobus
Contiene las 13.600+ paradas de bus de la Comunidad de Madrid (urbanas EMT + interurbanas CRTM).

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `stop_id` | integer | PK | - | ID unico: `codMode * 1000000 + codEstacion` |
| `name` | text | Si | - | Nombre de la parada |
| `lat` | double precision | Si | - | Latitud |
| `lng` | double precision | Si | - | Longitud |
| `cod_mode` | integer | Si | `8` | Modo: 6 = urbano (EMT), 8 = interurbano (CRTM) |
| `cod_estacion` | text | No | - | Codigo de estacion del CRTM |
| `lines` | text | No | - | Lineas separadas por coma (ej: "611, 612, 631") |
| `last_sync` | timestamptz | No | `now()` | Fecha de la ultima sincronizacion |

**Indices:** `idx_stops_lat` (lat), `idx_stops_lng` (lng) — optimizan las busquedas por viewport del mapa.

#### `static_lines` — Lineas de autobus

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `line_id` | text | PK | - | Identificador unico de la linea |
| `name` | text | Si | - | Nombre de la linea |
| `header_a` | text | No | - | Cabecera A (origen) |
| `header_b` | text | No | - | Cabecera B (destino) |
| `route_color` | text | No | `#005599` | Color de la linea en el mapa |
| `last_sync` | timestamptz | No | `now()` | Ultima sincronizacion |

#### `route_stops` — Relacion linea-parada (recorrido)

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID interno |
| `line_id` | text | FK → static_lines | - | Linea a la que pertenece |
| `stop_id` | integer | FK → static_stops | - | Parada en el recorrido |
| `stop_sequence` | integer | Si | - | Orden de la parada en la ruta |
| `direction` | integer | Si | - | Sentido (1 = ida, 2 = vuelta) |

**Constraint UNIQUE:** `(line_id, stop_id, direction, stop_sequence)` — evita duplicados.

---

### 3.2 Usuarios y perfiles

#### `profiles` — Perfil de usuario
Se crea automaticamente al registrarse (via trigger `on_auth_user_created`).

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | uuid | PK, FK → auth.users | - | ID del usuario en Supabase Auth |
| `username` | text | UNIQUE | - | Nombre de usuario |
| `role` | text | No | `'user'` | Rol: `user`, `moderator`, `admin` |
| `points` | integer | No | - | Puntos de gamificacion |
| `is_banned` | boolean | No | - | Si el usuario esta baneado |
| `avatar_url` | text | No | - | URL del avatar |
| `created_at` | timestamptz | No | `now()` | Fecha de registro |

#### `favourites` — Paradas y lineas favoritas

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID interno |
| `user_id` | uuid | FK → profiles | - | Usuario propietario |
| `stop_id` | integer | FK → static_stops | - | Parada favorita |
| `line_id` | text | FK → static_lines | - | Linea favorita |
| `alias` | text | No | - | Nombre personalizado (ej: "Casa", "Trabajo") |
| `created_at` | timestamptz | No | `now()` | Fecha de creacion |

---

### 3.3 Sistema de reportes comunitarios

#### `reports` — Reportes de incidencias

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID del reporte |
| `user_id` | uuid | FK → profiles | - | Autor del reporte |
| `line_id` | text | FK → static_lines | - | Linea afectada |
| `stop_id` | integer | FK → static_stops | - | Parada afectada |
| `type` | text | Si | - | Tipo de incidencia |
| `description` | text | No | - | Descripcion detallada |
| `lat` | double precision | Si | - | Latitud del reporte |
| `lng` | double precision | Si | - | Longitud del reporte |
| `status` | text | No | `'active'` | Estado: active, resolved, removed |
| `is_verified` | boolean | No | - | Si fue verificado por moderador |
| `created_at` | timestamptz | No | `now()` | Fecha de creacion |

#### `report_votes` — Votos en reportes

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID del voto |
| `report_id` | bigint | FK → reports | - | Reporte votado |
| `user_id` | uuid | FK → profiles | - | Usuario que vota |
| `vote_type` | text | Si | - | Tipo de voto (up/down) |

**Constraint UNIQUE:** `(report_id, user_id)` — un usuario solo puede votar una vez por reporte.

#### `moderation_queue` — Cola de moderacion

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID interno |
| `report_id` | bigint | FK → reports | - | Reporte en revision |
| `reports_number` | integer | No | `1` | Numero de denuncias recibidas |
| `reason_category` | text | No | - | Categoria del motivo |
| `status` | text | No | `'pending'` | Estado: pending, reviewed, dismissed |
| `mod_message` | text | No | - | Mensaje del moderador |

---

### 3.4 Gamificacion

#### `achievements` — Logros disponibles

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | integer | PK | auto | ID del logro |
| `name` | text | Si | - | Nombre del logro |
| `description` | text | No | - | Descripcion |
| `icon_url` | text | No | - | URL del icono |
| `xp_reward` | integer | No | - | Puntos de XP que otorga |

#### `user_achievements` — Logros desbloqueados

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `user_id` | uuid | PK, FK → profiles | - | Usuario |
| `achievement_id` | integer | PK, FK → achievements | - | Logro desbloqueado |
| `awarded_at` | timestamptz | No | `now()` | Fecha de obtencion |

---

### 3.5 Administracion

#### `app_feedback` — Feedback de usuarios

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID interno |
| `user_id` | uuid | FK → profiles | - | Autor del feedback |
| `category` | text | No | - | Categoria (bug, sugerencia, etc.) |
| `message` | text | No | - | Contenido del mensaje |
| `status` | text | No | `'pending'` | Estado de revision |
| `device_info` | jsonb | No | - | Info del dispositivo |
| `created_at` | timestamptz | No | `now()` | Fecha de envio |

#### `audit_logs` — Registro de acciones administrativas

| Columna | Tipo | Obligatorio | Default | Descripcion |
|---------|------|:-----------:|---------|-------------|
| `id` | bigint | PK | auto | ID interno |
| `actor_id` | uuid | FK → profiles | - | Quien realizo la accion |
| `action` | text | Si | - | Tipo de accion (ej: "ban_user", "delete_report") |
| `target_id` | text | No | - | ID del recurso afectado |
| `target_resource` | text | No | - | Tipo de recurso (ej: "report", "user") |
| `changes` | jsonb | No | - | Detalle de los cambios realizados |
| `ip_address` | inet | No | - | IP del actor |
| `created_at` | timestamptz | No | `now()` | Fecha de la accion |

---

### 3.6 Diagrama de relaciones

```
auth.users
    │
    │ (trigger: on_auth_user_created)
    ▼
profiles ◄──────────────────────────────────────────────────┐
    │                                                        │
    ├──► favourites ──► static_stops ◄── route_stops ──► static_lines
    │                                                        │
    ├──► reports ──────► static_stops                        │
    │       │           static_lines ◄───────────────────────┘
    │       │
    │       ├──► report_votes
    │       └──► moderation_queue
    │
    ├──► user_achievements ──► achievements
    │
    ├──► app_feedback
    │
    └──► audit_logs
```

---

## 4. Funciones SQL personalizadas

Funciones definidas en el esquema `public` que se usan en las politicas RLS y la logica de la app:

### `current_user_id()`
Devuelve el UUID del usuario autenticado. Wrapper de `auth.uid()`.
```sql
CREATE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE;
```

### `is_admin()`
Comprueba si el usuario actual tiene rol `admin` consultando la tabla `profiles`.
```sql
CREATE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### `is_moderator()`
Comprueba si el usuario actual tiene rol `moderator` consultando la tabla `profiles`.
```sql
CREATE FUNCTION is_moderator() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'moderator'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### `user_has_role(role_text)`
Comprueba si el usuario actual tiene un rol especifico. Consulta la tabla `profiles`.
```sql
CREATE FUNCTION user_has_role(role_text text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = role_text
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### `is_owner(p_user_id)`
Comprueba si un UUID dado corresponde al usuario autenticado.
```sql
CREATE FUNCTION is_owner(p_user_id uuid) RETURNS boolean AS $$
  SELECT p_user_id = auth.uid();
$$ LANGUAGE sql STABLE;
```

### `insert_audit_log(...)`
Inserta un registro en `audit_logs`. Se ejecuta con `SECURITY DEFINER` para que funcione independientemente de las politicas RLS del usuario.
```sql
CREATE FUNCTION insert_audit_log(
  p_actor_id uuid, p_action text, p_target_id text,
  p_target_resource text, p_changes jsonb, p_ip inet
) RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, target_id, target_resource, changes, ip_address, created_at)
  VALUES (p_actor_id, p_action, p_target_id, p_target_resource, p_changes, p_ip, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

> **Nota sobre `SECURITY DEFINER`:** Las funciones marcadas con `SECURITY DEFINER` se ejecutan con los permisos del creador (normalmente `postgres`), no del usuario que las llama. Esto es necesario para que `is_admin()`, `is_moderator()` y `user_has_role()` puedan leer la tabla `profiles` incluso cuando las politicas RLS normales no lo permitirian.

---

## 5. Triggers

### `on_auth_user_created`
Se ejecuta automaticamente cuando un nuevo usuario se registra en Supabase Auth. Crea su perfil en la tabla `profiles`.

- **Tabla:** `auth.users`
- **Evento:** `AFTER INSERT`
- **Funcion:** `handle_new_user()`

```sql
CREATE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name'  -- Nombre enviado desde el frontend
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Flujo:** Usuario se registra → Supabase crea fila en `auth.users` → Trigger crea fila en `profiles` con el mismo `id` y el `username` que envio el frontend.

---

## 6. Politicas RLS (Row Level Security)

RLS (Row Level Security) es el sistema de seguridad de Supabase/PostgreSQL. Cada tabla tiene politicas que definen que filas puede leer, insertar, actualizar o borrar cada usuario. Todas las tablas de la app tienen RLS activado.

> **Importante:** Las politicas de tipo PERMISSIVE funcionan con logica OR — si alguna politica permite el acceso, se concede. Esto significa que si un usuario es "owner" O "admin", cualquiera de las dos politicas le da acceso.

### Resumen por tabla

#### `static_stops` (datos publicos)
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| Lectura publica de paradas | SELECT | Todos | Sin restriccion |
| Insercion de paradas | INSERT | Todos | Sin restriccion |
| update_paradas | UPDATE | Todos | Sin restriccion |

> Las paradas son datos publicos de referencia. La insercion/actualizacion publica es necesaria para el script de importacion que usa la anon key.

#### `static_lines` (datos publicos)
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| static_lines_select_public | SELECT | Todos | Sin restriccion |
| static_lines_admin_manage | ALL | Autenticado | Solo si es admin |

#### `route_stops` (datos publicos)
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| route_stops_select_public | SELECT | Todos | Sin restriccion |
| route_stops_admin_manage | ALL | Autenticado | Solo si es admin |

#### `achievements` (datos publicos)
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| achievements_select_public | SELECT | Todos | Sin restriccion |
| achievements_admin_manage | ALL | Autenticado | Solo si es admin |

#### `profiles`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| profiles_select_authenticated | SELECT | Autenticado | Todos los perfiles (para buscar usernames) |
| profiles_insert_authenticated | INSERT | Autenticado | Solo su propio perfil |
| profiles_update_own | UPDATE | Autenticado | Solo su propio perfil |
| profiles_owner_all | ALL | Autenticado | Solo su propio perfil |
| profiles_admin_all | ALL | Autenticado | Solo si es admin |

#### `favourites`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| favourites_owner_all | ALL | Autenticado | Solo sus propios favoritos |
| favourites_admin_all | ALL | Autenticado | Solo si es admin |

> Existen politicas adicionales (`favourites_owner`, `favourites_select_owner`, etc.) que son redundantes con `favourites_owner_all` pero no causan problemas.

#### `reports`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| reports_select_public | SELECT | Todos | Solo reportes con status `active` |
| reports_select_owner_or_mod | SELECT | Autenticado | Activos, propios, o si es moderador |
| reports_insert_authenticated | INSERT | Autenticado | Solo como si mismo |
| reports_update_owner_or_mod | UPDATE | Autenticado | Propios o si es moderador |
| reports_delete_owner_or_mod | DELETE | Autenticado | Propios o si es moderador |
| reports_moderator_select | SELECT | Autenticado | Solo si es moderador |
| reports_moderator_update | UPDATE | Autenticado | Solo si es moderador |
| reports_owner_all | ALL | Autenticado | Solo sus propios reportes |
| reports_admin_all | ALL | Autenticado | Solo si es admin |

#### `report_votes`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| report_votes_owner_all | ALL | Autenticado | Solo sus propios votos |
| report_votes_select_owner_or_public_report | SELECT | Autenticado | Propios o de reportes activos |
| report_votes_moderator_select | SELECT | Autenticado | Solo si es moderador |
| report_votes_admin_all | ALL | Autenticado | Solo si es admin |

#### `moderation_queue`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| moderation_queue_none | ALL | Publico | Bloqueado completamente |
| moderation_queue_mod_role | ALL | Autenticado | Solo si es moderador |
| mq_moderator_select_update | SELECT | Autenticado | Solo si es moderador |
| mq_moderator_update | UPDATE | Autenticado | Solo si es moderador |
| mq_admin_all | ALL | Autenticado | Solo si es admin |

#### `user_achievements`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| user_achievements_select_owner | SELECT | Autenticado | Solo sus propios logros |
| user_achievements_no_client_write | INSERT | Publico | Bloqueado |
| user_achievements_no_client_update | UPDATE | Publico | Bloqueado |
| user_achievements_no_client_delete | DELETE | Publico | Bloqueado |
| user_achievements_no_direct_insert | INSERT | Autenticado | Solo moderadores |
| user_achievements_no_direct_delete | DELETE | Autenticado | Solo moderadores |
| ua_owner_all | ALL | Autenticado | Solo sus propios logros |
| ua_admin_all | ALL | Autenticado | Solo si es admin |

#### `app_feedback`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| app_feedback_owner_all | ALL | Autenticado | Solo su propio feedback |
| app_feedback_select_owner_or_mod | SELECT | Autenticado | Propio o si es moderador |
| app_feedback_moderator_select | SELECT | Autenticado | Solo si es moderador |
| app_feedback_update_mod | UPDATE | Autenticado | Solo si es moderador |
| app_feedback_admin_all | ALL | Autenticado | Solo si es admin |

#### `audit_logs`
| Politica | Operacion | Quien | Condicion |
|----------|-----------|-------|-----------|
| audit_logs_no_public | ALL | Publico | Bloqueado completamente |
| audit_owner_select | SELECT | Autenticado | Solo sus propias acciones |
| audit_admin_all | ALL | Autenticado | Solo si es admin |

> Los audit logs se insertan mediante la funcion `insert_audit_log()` que usa `SECURITY DEFINER`, lo que permite insertar registros sin importar las politicas RLS del usuario.

---

## 7. Sistema de roles

La app implementa tres niveles de acceso mediante el campo `role` de la tabla `profiles`:

| Rol | Descripcion | Permisos |
|-----|-------------|----------|
| `user` | Usuario normal (por defecto) | CRUD de sus propios datos, leer datos publicos |
| `moderator` | Moderador | Todo lo de user + gestionar reportes, cola de moderacion, feedback |
| `admin` | Administrador | Acceso total a todas las tablas |

**Asignacion de roles:** Se cambia directamente en la tabla `profiles` (campo `role`). No hay UI para cambiarlo — se hace desde el dashboard de Supabase o por SQL.

---

## 8. Proxy API (Vercel)

### `api/crtm-proxy.js`

Vercel Edge Function que actua como proxy para las peticiones al CRTM. Necesario porque la API del CRTM bloquea peticiones que no vienen de su propio dominio (CORS + validacion de `Origin`).

**Funcionamiento:**
1. El frontend hace peticion a `/api/crtm/widgets/api/GetStopsTimes.php?...`
2. Vercel redirige a `api/crtm-proxy.js` (segun `vercel.json`)
3. El proxy reescribe la URL a `https://www.crtm.es/widgets/api/GetStopsTimes.php?...`
4. Envia la peticion con cabeceras que simulan venir de `crtm.es`
5. Devuelve la respuesta al frontend con cabeceras CORS

**Cabeceras inyectadas:**
- `Origin: https://www.crtm.es`
- `Referer: https://www.crtm.es/`
- `User-Agent: Chrome/122`

### Configuracion de rutas (`vercel.json`)

| Ruta | Destino | Tipo |
|------|---------|------|
| `/api/emt/(.*)` | `https://openapi.emtmadrid.es/v1/$1` | Rewrite directo |
| `/api/crtm/(.*)` | `/api/crtm-proxy` | Edge Function |
| `/(.*)`| `/index.html` | SPA fallback |

---

## 9. Scripts de datos

### `scripts/setup-stops.sql`
SQL que prepara la tabla `static_stops`. Se ejecuta una vez en el SQL Editor de Supabase antes de importar datos.

- Añade las columnas `cod_mode`, `cod_estacion`, `lines`
- Crea indices para latitud y longitud
- Crea politicas RLS de lectura e insercion publica

### `scripts/importStops.mjs`
Script Node.js que descarga todas las paradas del CRTM y las inserta en Supabase.

**Fuentes de datos:**
- Interurbanas (modo 8): ArcGIS FeatureServer `M8_Red`
- Urbanas EMT (modo 6): ArcGIS FeatureServer `M6_Red`

**Proceso:**
1. Descarga paradas paginando de 1000 en 1000
2. Convierte al formato de la tabla (calcula `stop_id` como `codMode * 1000000 + codEstacion`)
3. Filtra paradas sin coordenadas y elimina duplicados
4. Hace `upsert` en lotes de 500 (inserta nuevas, actualiza existentes)

**Ejecucion:** `node scripts/importStops.mjs` (solo hace falta una vez, o para re-sincronizar)

---

## 10. APIs externas

### EMT Madrid (buses urbanos)
| Dato | Valor |
|------|-------|
| Base URL | `https://openapi.emtmadrid.es` |
| Auth | Email + password → access token |
| Endpoints | `/v2/transport/busemtmad/stops/{id}/arrives/all/` |
| Limite | Rate limiting por IP |
| Registro | https://apidocs.emtmadrid.es/ |

### CRTM (buses interurbanos)
| Dato | Valor |
|------|-------|
| Base URL | `https://www.crtm.es` (via proxy) |
| Auth | Ninguna (acceso libre via proxy) |
| Endpoints | `/widgets/api/GetStopsTimes.php`, `/widgets/api/GetLineLocation.php` |
| Cache | 2 minutos en el cliente |
| Reintentos | 3 intentos con backoff exponencial (2s, 4s, 8s) |

### ArcGIS CRTM (datos estaticos)
| Dato | Valor |
|------|-------|
| Base URL | `https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services` |
| Uso | Importacion de paradas (script offline) |
| Endpoints | `M8_Red/FeatureServer/0/query` (interurbanas), `M6_Red/FeatureServer/0/query` (urbanas) |

### CartoDB (tiles del mapa)
| Dato | Valor |
|------|-------|
| Uso | Tiles base del mapa (modo claro y oscuro) |
| Auth | Ninguna |

---

## 11. Auditorias y correcciones aplicadas

El 25 de marzo de 2026 se realizo una auditoria de seguridad de la base de datos. Se encontraron y corrigieron los siguientes problemas:

### Correccion 1: Funcion `user_has_role()` rota
- **Problema:** La funcion leia el campo `role` del JWT de Supabase, que siempre contiene `"authenticated"` o `"anon"` (es el rol de PostgreSQL, no el rol de la app). Esto significaba que `user_has_role('moderator')` nunca devolvia `true`.
- **Solucion:** Se reescribio para que consulte la tabla `profiles`, igual que `is_admin()` e `is_moderator()`.

### Correccion 2: RLS desactivado en 4 tablas
- **Problema:** Las tablas `achievements`, `static_lines`, `route_stops` y `static_stops` no tenian RLS activado, lo que permitia a cualquier usuario con la anon key leer, insertar, modificar y borrar datos sin restriccion.
- **Solucion:** Se activo RLS en las 4 tablas y se crearon politicas apropiadas:
  - `achievements`, `static_lines`, `route_stops`: lectura publica + solo admin puede modificar
  - `static_stops`: lectura + insercion + actualizacion publica (necesario para el script de importacion)

### Correccion 3: Politica `reports_moderator_select` era un agujero de seguridad
- **Problema:** La condicion era `is_moderator() OR (id IS NOT NULL)`. Como `id` es la clave primaria y nunca es NULL, la condicion equivalia a `true`, permitiendo a cualquier usuario autenticado ver todos los reportes.
- **Solucion:** Se elimino la condicion `OR (id IS NOT NULL)`, dejando solo `is_moderator()`.

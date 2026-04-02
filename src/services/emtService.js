// emtService.js - Servicio para la API de EMT Madrid (buses urbanos)
// Docs: https://apidocs.emtmadrid.es/
// Las peticiones van a traves del proxy de Vite (/api/emt -> openapi.emtmadrid.es)

const BASE_URL = '/api/emt';

// Guardar el token para no hacer login en cada peticion
let tokenGuardado = null;
let tokenExpira = null;

// Hacer login en la API de EMT y obtener el token de acceso
export async function emtLogin() {
  // Si ya tenemos un token valido, lo reutilizamos
  if (tokenGuardado && tokenExpira && Date.now() < tokenExpira - 60000) {
    return tokenGuardado;
  }

  // Las credenciales las inyecta el proxy del servidor (emt-proxy.js)
  // desde variables de entorno. No se envían desde el frontend.

  // Probar diferentes endpoints de login por si alguno falla
  const intentos = [
    {
      url: `${BASE_URL}/v2/mobilitylabs/user/login/`,
      nombre: 'v2',
    },
    {
      url: `${BASE_URL}/v1/mobilitylabs/user/login/`,
      nombre: 'v1',
    },
    {
      url: `${BASE_URL}/v3/mobilitylabs/user/login/`,
      nombre: 'v3',
    },
  ];

  for (const intento of intentos) {
    try {
      console.log(`EMT Login: Probando ${intento.nombre}...`);
      const response = await fetch(intento.url, {
        method: 'GET',
      });

      if (!response.ok) {
        console.warn(`EMT Login (${intento.nombre}): ${response.status}`);
        continue;
      }

      const json = await response.json();
      const datos = json.data?.[0] || json.data;

      if (datos?.accessToken) {
        tokenGuardado = datos.accessToken;
        const segundos = datos.tokenSecExpiration || 86400;
        tokenExpira = Date.now() + segundos * 1000;
        console.log(`EMT Login OK (${intento.nombre})`);
        return tokenGuardado;
      }
    } catch (err) {
      console.warn(`EMT Login (${intento.nombre}): Error -`, err.message);
    }
  }

  throw new Error('No se pudo hacer login en EMT. Revisa las credenciales del .env');
}

// Obtener paradas cercanas a unas coordenadas
export async function getStopsAroundPoint(lng, lat, radius = 500) {
  const token = await emtLogin();
  const url = `${BASE_URL}/v2/transport/busemtmad/stops/arroundxy/${lng}/${lat}/${radius}/`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'accessToken': token },
  });

  if (!response.ok) {
    // Si el token caduco, hacer login de nuevo y reintentar
    if (response.status === 401 || response.status === 403) {
      tokenGuardado = null;
      tokenExpira = null;
      const nuevoToken = await emtLogin();
      const retry = await fetch(url, {
        method: 'GET',
        headers: { 'accessToken': nuevoToken },
      });
      if (!retry.ok) throw new Error(`Error paradas EMT: ${retry.status}`);
      const retryJson = await retry.json();
      return retryJson.data || [];
    }
    throw new Error(`Error paradas EMT: ${response.status}`);
  }

  const json = await response.json();
  return json.data || [];
}

// Obtener tiempos de llegada en tiempo real de una parada EMT
// Esta API es mucho mas fiable que la del CRTM para buses urbanos
export async function getEMTArrivals(stopId, signal) {
  try {
    const token = await emtLogin();

    const url = `${BASE_URL}/v2/transport/busemtmad/stops/${stopId}/arrives/all/`;
    const body = {
      cultureInfo: 'ES',
      Text_StopRequired_YN: 'Y',
      Text_EstimationsRequired_YN: 'Y',
      Text_IncidencesRequired_YN: 'N',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'accessToken': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      // Token caducado -> hacer login de nuevo
      if (response.status === 401 || response.status === 403) {
        tokenGuardado = null;
        tokenExpira = null;
        const nuevoToken = await emtLogin();
        const retry = await fetch(url, {
          method: 'POST',
          headers: { 'accessToken': nuevoToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        if (!retry.ok) {
          console.warn(`[EMT] Retry fallo: ${retry.status}`);
          return { arrivals: [], stale: false, cachedAt: null, error: true };
        }
        const retryJson = await retry.json();
        return parsearLlegadasEMT(retryJson);
      }

      console.warn(`[EMT] Error ${response.status} para parada ${stopId}`);
      return { arrivals: [], stale: false, cachedAt: null, error: true };
    }

    const json = await response.json();
    return parsearLlegadasEMT(json);

  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('[EMT] Error:', error.message);
    return { arrivals: [], stale: false, cachedAt: null, error: true };
  }
}

// Obtener las ubicaciones GPS de los buses de una linea en una parada EMT
// Reutiliza el endpoint de llegadas que ya devuelve coordenadas del bus
export async function getEMTBusLocations(stopId, lineFilter, busId) {
  try {
    const token = await emtLogin();
    const url = `${BASE_URL}/v2/transport/busemtmad/stops/${stopId}/arrives/all/`;
    const body = {
      cultureInfo: 'ES',
      Text_StopRequired_YN: 'N',
      Text_EstimationsRequired_YN: 'Y',
      Text_IncidencesRequired_YN: 'N',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'accessToken': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        tokenGuardado = null;
        tokenExpira = null;
        const nuevoToken = await emtLogin();
        const retry = await fetch(url, {
          method: 'POST',
          headers: { 'accessToken': nuevoToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!retry.ok) return [];
        const retryJson = await retry.json();
        return extraerUbicacionesBus(retryJson, lineFilter, busId);
      }
      return [];
    }

    const json = await response.json();
    return extraerUbicacionesBus(json, lineFilter, busId);
  } catch (error) {
    console.error('[EMT Location] Error:', error.message);
    return [];
  }
}

// Extraer coordenadas de los buses de la respuesta de llegadas EMT
function extraerUbicacionesBus(json, lineFilter, busId) {
  const datos = json.data?.[0]?.Arrive || [];

  return datos
    .filter(a => {
      if (!a.geometry?.coordinates) return false;
      if (busId && String(a.bus) !== String(busId)) return false;
      if (!busId && lineFilter && String(a.line) !== String(lineFilter)) return false;
      return a.estimateArrive > 0 && a.estimateArrive < 999999;
    })
    .map(a => ({
      latitude: a.geometry.coordinates[1],
      longitude: a.geometry.coordinates[0],
      vehicleId: String(a.bus),
      lineCode: String(a.line),
    }));
}

// Convertir la respuesta de EMT al formato que usa nuestro popup
function parsearLlegadasEMT(json) {
  const datos = json.data?.[0]?.Arrive || [];

  if (datos.length === 0) {
    return { arrivals: [], stale: false, cachedAt: null, error: false };
  }

  const llegadas = datos
    .filter(a => a.estimateArrive > 0 && a.estimateArrive < 999999)
    .map(a => ({
      line: a.line || '?',
      lineDescription: `Linea ${a.line}`,
      destination: a.destination || '',
      minutes: Math.round(a.estimateArrive / 60),
      arrivalTime: new Date(Date.now() + a.estimateArrive * 1000)
        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      codMode: '6',
      codLine: a.line || '',
      direction: 1,
      busId: a.bus,
      distanceMeters: a.DistanceBus,
      busLocation: a.geometry?.coordinates
        ? { longitude: a.geometry.coordinates[0], latitude: a.geometry.coordinates[1] }
        : null,
    }))
    .slice(0, 6);

  console.log(`[EMT] ${llegadas.length} llegadas obtenidas`);
  return { arrivals: llegadas, stale: false, cachedAt: null, error: false };
}

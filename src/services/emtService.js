// emtService.js — Servicio para comunicar con la API de EMT Madrid
// Docs: https://apidocs.emtmadrid.es/
// Las peticiones se enrutan a través del proxy de Vite (/api/emt -> openapi.emtmadrid.es)

const BASE_URL = '/api/emt';

let cachedToken = null;
let tokenExpiry = null;

/**
 * Inicia sesión en la API de EMT y obtiene un accessToken.
 * Usa email y password como headers (nivel Advanced).
 * Si falla, intenta con X-ClientId y passKey (nivel Protected).
 */
export async function emtLogin() {
  // Si tenemos un token válido con margen, lo reutilizamos
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const email = import.meta.env.VITE_EMT_EMAIL;
  const password = import.meta.env.VITE_EMT_PASSWORD;
  const clientId = import.meta.env.VITE_EMT_CLIENT_ID;
  const passKey = import.meta.env.VITE_EMT_PASSKEY;

  // Intentar primero con email + password (nivel básico/advanced)
  const loginAttempts = [
    {
      url: `${BASE_URL}/v2/mobilitylabs/user/login/`,
      headers: { 'email': email, 'password': password },
      label: 'v2 email+password',
    },
    {
      url: `${BASE_URL}/v1/mobilitylabs/user/login/`,
      headers: { 'email': email, 'password': password },
      label: 'v1 email+password',
    },
    {
      url: `${BASE_URL}/v3/mobilitylabs/user/login/`,
      headers: { 'email': email, 'password': password },
      label: 'v3 email+password',
    },
    {
      url: `${BASE_URL}/v1/mobilitylabs/user/login/`,
      headers: { 'X-ClientId': clientId, 'passKey': passKey },
      label: 'v1 clientId+passKey',
    },
  ];

  for (const attempt of loginAttempts) {
    try {
      console.log(`EMT Login: Intentando ${attempt.label}...`);
      const response = await fetch(attempt.url, {
        method: 'GET',
        headers: attempt.headers,
      });

      if (!response.ok) {
        console.warn(`EMT Login (${attempt.label}): ${response.status} ${response.statusText}`);
        continue;
      }

      const json = await response.json();

      // El token puede venir en distintas estructuras
      const tokenData = json.data?.[0] || json.data;
      if (tokenData?.accessToken) {
        cachedToken = tokenData.accessToken;
        const expiresInSec = tokenData.tokenSecExpiration || 86400;
        tokenExpiry = Date.now() + expiresInSec * 1000;
        console.log(`EMT Login (${attempt.label}): ✅ Token obtenido`);
        return cachedToken;
      }
    } catch (err) {
      console.warn(`EMT Login (${attempt.label}): Error de red -`, err.message);
    }
  }

  throw new Error('No se pudo iniciar sesión en EMT con ningún método. Revisa tus credenciales en .env');
}

/**
 * Obtiene las paradas de bus cercanas a un punto geográfico.
 * @param {number} lng - Longitud
 * @param {number} lat - Latitud
 * @param {number} radius - Radio en metros (ej: 500)
 * @returns {Array} Array de objetos de paradas
 */
export async function getStopsAroundPoint(lng, lat, radius = 500) {
  const token = await emtLogin();

  const url = `${BASE_URL}/v2/transport/busemtmad/stops/arroundxy/${lng}/${lat}/${radius}/`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accessToken': token,
    },
  });

  if (!response.ok) {
    // Si el token expiró, reintentar con login fresco
    if (response.status === 401 || response.status === 403) {
      cachedToken = null;
      tokenExpiry = null;
      const freshToken = await emtLogin();
      const retryResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'accessToken': freshToken,
        },
      });
      if (!retryResponse.ok) {
        throw new Error(`Error al obtener paradas EMT (retry): ${retryResponse.status}`);
      }
      const retryJson = await retryResponse.json();
      return retryJson.data || [];
    }
    throw new Error(`Error al obtener paradas EMT: ${response.status}`);
  }

  const json = await response.json();
  return json.data || [];
}

/**
 * Obtiene tiempos de llegada en tiempo real para una parada EMT urbana.
 * Usa la API oficial de EMT (la misma que usa la app Transportes Madrid).
 * Mucho más fiable que el endpoint de widgets del CRTM.
 *
 * @param {string|number} stopId - ID numérico de la parada EMT (ej: 2443)
 * @param {AbortSignal} [signal] - Señal para cancelar la petición
 * @returns {Object} { arrivals: Array, stale: false, cachedAt: null, error: boolean }
 */
export async function getEMTArrivals(stopId, signal) {
  try {
    const token = await emtLogin();

    const url = `${BASE_URL}/v2/transport/busemtmad/stops/${stopId}/arrives/all/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accessToken': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cultureInfo: 'ES',
        Text_StopRequired_YN: 'Y',
        Text_EstimationsRequired_YN: 'Y',
        Text_IncidencesRequired_YN: 'N',
      }),
      signal,
    });

    if (!response.ok) {
      // Si el token expiró, reintentar
      if (response.status === 401 || response.status === 403) {
        cachedToken = null;
        tokenExpiry = null;
        const freshToken = await emtLogin();
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'accessToken': freshToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cultureInfo: 'ES',
            Text_StopRequired_YN: 'Y',
            Text_EstimationsRequired_YN: 'Y',
            Text_IncidencesRequired_YN: 'N',
          }),
          signal,
        });
        if (!retryResponse.ok) {
          console.warn(`[EMT Arrivals] Retry falló: ${retryResponse.status}`);
          return { arrivals: [], stale: false, cachedAt: null, error: true };
        }
        const retryJson = await retryResponse.json();
        return parseEMTArrivals(retryJson);
      }

      console.warn(`[EMT Arrivals] Error ${response.status} para parada ${stopId}`);
      return { arrivals: [], stale: false, cachedAt: null, error: true };
    }

    const json = await response.json();
    return parseEMTArrivals(json);

  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('[EMT Arrivals] Error:', error.message);
    return { arrivals: [], stale: false, cachedAt: null, error: true };
  }
}

/**
 * Parsea la respuesta de la API EMT arrives y la convierte al mismo formato
 * que usa getStopTimes en crtmService.js.
 */
function parseEMTArrivals(json) {
  const arrivesData = json.data?.[0]?.Arrive || [];

  if (arrivesData.length === 0) {
    return { arrivals: [], stale: false, cachedAt: null, error: false };
  }

  const arrivals = arrivesData
    .filter(a => a.estimateArrive > 0 && a.estimateArrive < 999999)
    .map(a => ({
      line: a.line || '?',
      lineDescription: `Línea ${a.line}`,
      destination: a.destination || '',
      minutes: Math.round(a.estimateArrive / 60),
      arrivalTime: new Date(Date.now() + a.estimateArrive * 1000)
        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      // Datos para localización del bus (ya incluidos en la respuesta EMT)
      codMode: '6',
      codLine: a.line || '',
      direction: 1,
      // Datos extra de EMT
      busId: a.bus,
      distanceMeters: a.DistanceBus,
      busLocation: a.geometry?.coordinates
        ? { longitude: a.geometry.coordinates[0], latitude: a.geometry.coordinates[1] }
        : null,
    }))
    .slice(0, 6);

  console.log(`[EMT Arrivals] ✅ ${arrivals.length} llegadas obtenidas`);
  return { arrivals, stale: false, cachedAt: null, error: false };
}

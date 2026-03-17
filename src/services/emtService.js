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

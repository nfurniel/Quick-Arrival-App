// Proxy para las peticiones a la API de EMT Madrid en produccion (Vercel Edge Function)
// Necesario porque las peticiones directas a openapi.emtmadrid.es fallan por CORS
// Las credenciales de login se inyectan desde variables de entorno del servidor
// para evitar que los navegadores las pierdan al reenviar headers que no son estandar.

export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'accessToken, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(request) {
  // Responder preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';

    // Reconstruir la URL de EMT
    const otherParams = new URLSearchParams(url.searchParams);
    otherParams.delete('path');
    const qs = otherParams.toString();

    // Si hay query params adicionales los añadimos, si no dejamos la URL limpia
    let targetUrl = 'https://openapi.emtmadrid.es/' + path;
    if (qs) {
      targetUrl = targetUrl + '?' + qs;
    }

    console.log('[Proxy EMT] Target URL:', targetUrl);
    console.log('[Proxy EMT] Method:', request.method);

    const headers = new Headers();

    // Si es un endpoint de login, inyectar credenciales desde env vars del servidor
    // (los navegadores no reenvían bien headers personalizados como "email"/"password")
    if (path.includes('user/login')) {
      headers.set('email', process.env.EMT_EMAIL || '');
      headers.set('password', process.env.EMT_PASSWORD || '');
      if (process.env.EMT_CLIENT_ID) headers.set('X-ClientId', process.env.EMT_CLIENT_ID);
      if (process.env.EMT_PASSKEY) headers.set('passKey', process.env.EMT_PASSKEY);
      console.log('[Proxy EMT] Login request — credenciales inyectadas desde env vars');
    } else {
      // Para el resto de peticiones, reenviamos el token que manda el frontend
      const accessToken = request.headers.get('accesstoken');
      if (accessToken) headers.set('accessToken', accessToken);
    }

    // Content-Type siempre se reenvía
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);

    let body = null;
    if (request.method === 'POST') {
      body = await request.text();
    }

    const emtResponse = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
    });

    console.log('[Proxy EMT] Response status:', emtResponse.status);

    const responseBody = await emtResponse.text();

    return new Response(responseBody, {
      status: emtResponse.status,
      headers: {
        'Content-Type': emtResponse.headers.get('Content-Type') || 'application/json',
        ...CORS_HEADERS,
      },
    });

  } catch (error) {
    console.error('[Proxy EMT] Error:', error.message);
    return new Response(JSON.stringify({ error: 'Error en el proxy EMT', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// Proxy para las peticiones a la API de EMT Madrid en produccion (Vercel Edge Function)
// Necesario porque las peticiones directas a openapi.emtmadrid.es fallan por CORS

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Responder preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'accessToken, email, password, X-ClientId, passKey, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';

    // Reconstruir la URL de EMT
    const otherParams = new URLSearchParams(url.searchParams);
    otherParams.delete('path');
    const qs = otherParams.toString();
    const targetUrl = 'https://openapi.emtmadrid.es/' + path + (qs ? '?' + qs : '');

    console.log('[Proxy EMT] Target URL:', targetUrl);
    console.log('[Proxy EMT] Method:', request.method);

    // Copiar las cabeceras relevantes (accessToken, email, password, etc.)
    const headers = new Headers();
    const forwardHeaders = ['accesstoken', 'email', 'password', 'x-clientid', 'passkey', 'content-type'];
    for (const h of forwardHeaders) {
      const val = request.headers.get(h);
      if (val) headers.set(h, val);
    }

    // Leer body si es POST
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'accessToken, email, password, X-ClientId, passKey, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

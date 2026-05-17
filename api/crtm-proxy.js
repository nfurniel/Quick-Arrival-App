// Proxy para las peticiones al CRTM en produccion (Vercel Edge Function)
// Necesario porque el CRTM bloquea peticiones que no vienen de su propia web
// Este proxy va a "disfrazar" nuestras peticiones para que parezcan de crtm.es basicamente

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    // Reconstruir la URL del CRTM a partir del query param "path"
    // que Vercel pasa desde el rewrite: /api/crtm/(.*) -> /api/crtm-proxy?path=$1
    const url = new URL(request.url);
    const path = url.searchParams.get('path');

    let targetUrl;
    if (path) {
      // Viene del rewrite de Vercel con el path capturado
      // Los query params originales llegan como params de la edge function
      const otherParams = new URLSearchParams(url.searchParams);
      otherParams.delete('path');
      const qs = otherParams.toString();
      targetUrl = 'https://www.crtm.es/' + path + (qs ? '?' + qs : '');
    } else {
      // Crear un Fallback para  intentar extraer del path directo
      const apiIndex = request.url.indexOf('/api/crtm/');
      if (apiIndex !== -1) {
        targetUrl = 'https://www.crtm.es/' + request.url.substring(apiIndex + 10);
      } else {
        targetUrl = request.url.replace(url.origin + '/api/crtm/', 'https://www.crtm.es/');
      }
    }

    // Cabeceras para simular que la peticion viene de la web del CRTM
    const headers = new Headers();
    headers.set('Origin', 'https://www.crtm.es');
    headers.set('Referer', 'https://www.crtm.es/');
    headers.set('Accept', '*/*');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    headers.set('Accept-Language', 'es-ES,es;q=0.9');

    console.log('[Proxy CRTM] Target URL:', targetUrl);

    // Timeout de 18s porque CRTM es muy lento, pero Vercel Edge permite hasta 25s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    // Hacer la peticion real al CRTM
    let crtmResponse;
    try {
      crtmResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('[Proxy CRTM] Response status:', crtmResponse.status);

    // Leer el body como texto
    const body = await crtmResponse.text();

    // Devolver la respuesta con los headers CORS para que el navegador no la bloquee
    return new Response(body, {
      status: crtmResponse.status,
      headers: {
        'Content-Type': crtmResponse.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[Proxy CRTM] Error:', error.message);
    // Devolver 504 si es timeout para que el frontend lo distinga de un error real y poder validar mejor basicamnete
    const isTimeout = error.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'Timeout del proxy CRTM' : 'Error en el proxy',
      details: error.message,
    }), {
      status: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

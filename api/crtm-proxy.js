// Proxy para las peticiones al CRTM en produccion (Vercel Edge Function)
// Necesario porque el CRTM bloquea peticiones que no vienen de su propia web
// Este proxy "disfraza" nuestras peticiones para que parezcan de crtm.es

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
      // Fallback: intentar extraer del path directo
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

    // Timeout de 8s para no depender del límite de Vercel (25s edge)
    // Si CRTM no responde a tiempo, el frontend reintentará automáticamente
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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

    // Leer el body como texto para evitar problemas con Content-Encoding
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
    return new Response(JSON.stringify({ error: 'Error en el proxy', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

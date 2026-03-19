export const config = {
  runtime: 'edge', // Usar Vercel Edge Network para latencia mínima
};

export default async function handler(request) {
  try {
    // 1. Obtener la URL objetivo del CRTM reconstruyéndola a partir de la petición entrante
    const url = new URL(request.url);
    
    // Extraemos todo lo que hay después de "/api/crtm/"
    // Como Vercel reescribe desde "/api/crtm/widgets/..." a "/api/crtm-proxy", 
    // necesitamos recoger los parámetros de búsqueda (query strings).
    // Vercel Edge Functions exponen la URL completa original si miramos request.url.
    // Para asegurar que intercepta la ruta correcta, cambiamos el origen de la app por la de crtm
    let targetUrlString = request.url;
    // Buscamos donde empieza "/api/crtm/"
    const apiIndex = targetUrlString.indexOf('/api/crtm/');
    if (apiIndex !== -1) {
      targetUrlString = 'https://www.crtm.es/' + targetUrlString.substring(apiIndex + 10);
    } else {
      targetUrlString = targetUrlString.replace(url.origin + '/api/crtm/', 'https://www.crtm.es/');
    }

    // 2. Preparar los Headers Mágicos (Spoofing) para engañar al CRTM
    const headers = new Headers();
    headers.set('Origin', 'https://www.crtm.es');
    headers.set('Referer', 'https://www.crtm.es/');
    headers.set('Accept', '*/*');
    // Simulamos que somos un navegador Chrome de verdad, no un robot de Vercel
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    headers.set('Accept-Language', 'es-ES,es;q=0.9');

    // 3. Hacer la petición real al CRTM desde Madrid/Frankfurt (Red de Vercel)
    const crtmResponse = await fetch(targetUrlString, {
      method: 'GET',
      headers: headers,
    });

    // 4. Copiar los headers de respuesta para decirle al navegador que es JSON válido
    const responseHeaders = new Headers(crtmResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // Evitar problemas CORS de Vercel

    // 5. Devolver la respuesta exactamente como la mandó el CRTM
    return new Response(crtmResponse.body, {
      status: crtmResponse.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    console.error('[CRTM Edge Proxy Error]', error.message);
    return new Response(JSON.stringify({ error: 'Error del Proxy Vercel', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

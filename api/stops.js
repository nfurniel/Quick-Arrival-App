// api/stops.js —Devuelve las paradas dentro del viewport del mapa (esto es lo del video del bbox)

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

export default async function handler(request) {
  const url = new URL(request.url);
  const minLat = url.searchParams.get('minLat');
  const maxLat = url.searchParams.get('maxLat');
  const minLng = url.searchParams.get('minLng');
  const maxLng = url.searchParams.get('maxLng');

  if (!minLat || !maxLat || !minLng || !maxLng) {
    return new Response(JSON.stringify({ error: 'Faltan parámetros: minLat, maxLat, minLng, maxLng' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Configuración del servidor incompleta' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const query = `select=stop_id,name,lat,lng,cod_mode,cod_estacion,lines&lat=gte.${minLat}&lat=lte.${maxLat}&lng=gte.${minLng}&lng=lte.${maxLng}&cod_mode=in.(6,8)&limit=500`;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/static_stops?${query}`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok) {
      console.error('[api/stops] Error Supabase:', response.status); // debugging ** acordase de borrar 88
      return new Response(JSON.stringify({ error: 'Error consultando la base de datos' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60', // cache compartida 60 segundos
      },
    });

  } catch (error) {
    console.error('[api/stops] Error:', error.message);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

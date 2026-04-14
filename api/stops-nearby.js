// api/stops-nearby.js — Devuelve las paradas más cercanas al usuario para una línea concreta
// Sustituye la llamada directa a Supabase desde el frontend (stopsService.js)

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

// Distancia Haversine entre dos puntos (en metros)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  const line = url.searchParams.get('line');
  const radiusKm = parseFloat(url.searchParams.get('radius') || '1.5');

  if (!lat || !lng || !line) {
    return new Response(JSON.stringify({ error: 'Faltan parámetros: lat, lng, line' }), {
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
    const latOffset = radiusKm / 111;
    const lngOffset = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const minLat = lat - latOffset;
    const maxLat = lat + latOffset;
    const minLng = lng - lngOffset;
    const maxLng = lng + lngOffset;

    const query = `select=stop_id,name,lat,lng,cod_mode,cod_estacion,lines&lat=gte.${minLat}&lat=lte.${maxLat}&lng=gte.${minLng}&lng=lte.${maxLng}&cod_mode=in.(6,8)&lines=ilike.*${encodeURIComponent(line)}*&limit=100`;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/static_stops?${query}`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok) {
      console.error('[api/stops-nearby] Error Supabase:', response.status);
      return new Response(JSON.stringify({ error: 'Error consultando la base de datos' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    const search = line.toLowerCase().trim();

    const filtered = data
      .filter(stop => {
        if (!stop.lines) return false;
        const lineas = stop.lines.split(',').map(l => l.trim().toLowerCase());
        return lineas.includes(search);
      })
      .map(stop => ({
        ...stop,
        distance: Math.round(haversine(lat, lng, stop.lat, stop.lng)),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[api/stops-nearby] Error:', error.message);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

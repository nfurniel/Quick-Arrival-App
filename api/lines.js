// api/lines.js — Devuelve todas las líneas únicas disponibles en la base de datos
// Sustituye la llamada directa a Supabase desde el frontend (stopsService.js)

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

export default async function handler(request) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Configuración del servidor incompleta' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const query = `select=lines&cod_mode=in.(6,8)&lines=not.is.null`;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/static_stops?${query}`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok) {
      console.error('[api/lines] Error Supabase:', response.status);
      return new Response(JSON.stringify({ error: 'Error consultando la base de datos' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    // Extraer líneas únicas y ordenarlas (igual que hacía el frontend)
    const linesSet = new Set();
    data.forEach(stop => {
      if (stop.lines) {
        stop.lines.split(',').forEach(l => {
          const trimmed = l.trim();
          if (trimmed) linesSet.add(trimmed);
        });
      }
    });

    const lines = [...linesSet].sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return a.localeCompare(b);
    });

    return new Response(JSON.stringify(lines), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // caché 1 hora — las líneas cambian poco
      },
    });

  } catch (error) {
    console.error('[api/lines] Error:', error.message);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

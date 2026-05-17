// api/lines.js  Devuelve todas las lineas unicas disponibles en la base de datos

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

    // Validacion
    if (!response.ok) {
      console.error('[api/lines] Error Supabase:', response.status);
      return new Response(JSON.stringify({ error: 'Error consultando la base de datos' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    // Extraer lineas unicas y ordenarlas
    const linesSet = new Set();
    data.forEach(stop => {
      if (stop.lines) {
        stop.lines.split(',').forEach(l => {
          const trimmed = l.trim();
          if (trimmed) linesSet.add(trimmed);
        });
      }
    });

    // Ordenamos: primero las líneas numéricas (27, 148...) y al final las que tienen letras (C1, T1...)
    const lines = [...linesSet].sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB; // las dos son numeross
      if (!isNaN(numA)) return -1; // a es numero, va antes
      if (!isNaN(numB)) return 1;  // b es numero, va antes
      return a.localeCompare(b);   // las dos son letras, orden alfabetico
    });

    return new Response(JSON.stringify(lines), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // cache  de 1 hora  las líneas cambian poco
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

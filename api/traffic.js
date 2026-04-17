// Proxy para la API de incidencias de tráfico de TomTom.
// Oculta la API key en el servidor y usa caché global con bbox redondeado.

const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const GRID = 0.02; // ~2km — agrupa peticiones cercanas en la misma celda

function snapBbox(minLon, minLat, maxLon, maxLat) {
  return {
    minLon: (Math.floor(parseFloat(minLon) / GRID) * GRID).toFixed(3),
    minLat: (Math.floor(parseFloat(minLat) / GRID) * GRID).toFixed(3),
    maxLon: (Math.ceil(parseFloat(maxLon)  / GRID) * GRID).toFixed(3),
    maxLat: (Math.ceil(parseFloat(maxLat)  / GRID) * GRID).toFixed(3),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { minLon, minLat, maxLon, maxLat } = req.query;
  if (!minLon || !minLat || !maxLon || !maxLat) {
    return res.status(400).json({ error: 'Faltan parámetros bbox', incidents: [] });
  }

  const key = process.env.TOMTOM_API_KEY;
  if (!key) return res.status(500).json({ error: 'TOMTOM_API_KEY no configurada', incidents: [] });

  const snapped = snapBbox(minLon, minLat, maxLon, maxLat);
  const cacheKey = `${snapped.minLon},${snapped.minLat},${snapped.maxLon},${snapped.maxLat}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json({ incidents: cached.data, cached: true });
  }

  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${key}&bbox=${cacheKey}&language=es-ES&projection=EPSG4326`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`TomTom ${r.status}: ${body}`);
    }
    const json = await r.json();
    const incidents = json.incidents || [];
    CACHE.set(cacheKey, { data: incidents, timestamp: Date.now() });
    return res.status(200).json({ incidents, cached: false });
  } catch (err) {
    if (cached) return res.status(200).json({ incidents: cached.data, cached: true, stale: true });
    return res.status(502).json({ error: err.message, incidents: [] });
  }
}

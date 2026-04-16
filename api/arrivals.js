// Endpoint que devuelve los tiempos de llegada de una parada.
// Guarda los resultados en caché para que varios usuarios que consulten
// la misma parada no generen peticiones repetidas a EMT/CRTM.

const arrivalsCache = new Map();
const CACHE_TTL = {
  '6': 20 * 1000, // EMT: 20 segundos
  '8': 30 * 1000, // CRTM: 30 segundos
};
const DEFAULT_TTL = 25 * 1000;

let emtToken = null;
let emtTokenExpiry = null;

async function getEmtToken() {
  if (emtToken && emtTokenExpiry && Date.now() < emtTokenExpiry - 60000) {
    return emtToken;
  }
  const urls = [
    'https://openapi.emtmadrid.es/v2/mobilitylabs/user/login/',
    'https://openapi.emtmadrid.es/v1/mobilitylabs/user/login/',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          email: process.env.EMT_EMAIL || '',
          password: process.env.EMT_PASSWORD || '',
          'X-ClientId': process.env.EMT_CLIENT_ID || '',
          passKey: process.env.EMT_PASSKEY || '',
        },
      });
      if (!r.ok) continue;
      const json = await r.json();
      const data = json.data?.[0] || json.data;
      if (data?.accessToken) {
        emtToken = data.accessToken;
        emtTokenExpiry = Date.now() + (data.tokenSecExpiration || 86400) * 1000;
        return emtToken;
      }
    } catch { /* intentar con la siguiente URL */ }
  }
  throw new Error('No se pudo obtener token EMT');
}

async function fetchEmtArrivals(stopId) {
  const token = await getEmtToken();
  const url = `https://openapi.emtmadrid.es/v2/transport/busemtmad/stops/${stopId}/arrives/all/`;
  const body = JSON.stringify({
    cultureInfo: 'ES',
    Text_StopRequired_YN: 'Y',
    Text_EstimationsRequired_YN: 'Y',
    Text_IncidencesRequired_YN: 'N',
  });

  let r = await fetch(url, {
    method: 'POST',
    headers: { accessToken: token, 'Content-Type': 'application/json' },
    body,
  });

  // Si el token ha caducado, renovarlo y reintentar
  if (r.status === 401 || r.status === 403) {
    emtToken = null;
    const newToken = await getEmtToken();
    r = await fetch(url, {
      method: 'POST',
      headers: { accessToken: newToken, 'Content-Type': 'application/json' },
      body,
    });
  }

  if (!r.ok) throw new Error(`EMT ${r.status}`);

  const json = await r.json();
  const datos = json.data?.[0]?.Arrive || [];

  return datos
    .filter(a => a.estimateArrive > 0 && a.estimateArrive < 999999)
    .map(a => ({
      line:           a.line || '?',
      lineDescription:`Linea ${a.line}`,
      destination:    a.destination || '',
      minutes:        Math.round(a.estimateArrive / 60),
      arrivalTime:    new Date(Date.now() + a.estimateArrive * 1000)
                        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      codMode:        '6',
      codLine:        String(a.line || ''),
      direction:      1,
      busId:          a.bus,
      distanceMeters: a.DistanceBus,
      busLocation:    a.geometry?.coordinates
        ? { longitude: a.geometry.coordinates[0], latitude: a.geometry.coordinates[1] }
        : null,
    }))
    .slice(0, 6);
}

async function fetchCrtmArrivals(codStop) {
  // Se envían cabeceras que simulan que la petición viene de la web del CRTM,
  // porque su API bloquea peticiones externas.
  const r = await fetch(
    `https://www.crtm.es/widgets/api/GetStopsTimes.php?codStop=${codStop}&type=0&orderBy=2&stopTimesByIti=${codStop}&_=${Date.now()}`,
    {
      headers: {
        Origin: 'https://www.crtm.es',
        Referer: 'https://www.crtm.es/',
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }
  );

  if (!r.ok) throw new Error(`CRTM ${r.status}`);

  const json = await r.json();
  const timesData = json?.stopTimes?.times?.Time;
  if (!timesData) return [];

  const timesArray = Array.isArray(timesData) ? timesData : [timesData];
  const now = new Date();

  return timesArray
    .map(t => {
      const arrivalTime = new Date(t.time);
      return {
        line:           t.line?.shortDescription || '?',
        lineDescription:t.line?.description || '',
        destination:    t.destination || '',
        minutes:        Math.max(0, Math.round((arrivalTime - now) / 60000)),
        arrivalTime:    arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        codMode:        t.line?.codMode || '8',
        codLine:        t.line?.codLine || '',
        direction:      t.direction || 1,
      };
    })
    .filter(t => t.minutes >= 0)
    .slice(0, 6);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const codStop = req.query?.codStop;
  if (!codStop) {
    return res.status(400).json({ error: 'Falta parámetro: codStop' });
  }

  const mode = codStop.split('_')[0];
  const ttl = CACHE_TTL[mode] ?? DEFAULT_TTL;
  const cached = arrivalsCache.get(codStop);

  if (cached && Date.now() - cached.timestamp < ttl) {
    const age = Math.round((Date.now() - cached.timestamp) / 1000);
    return res.status(200).json({ arrivals: cached.data, cached: true, age, error: false });
  }

  try {
    let arrivals;
    if (mode === '6') {
      arrivals = await fetchEmtArrivals(codStop.replace('6_', ''));
    } else {
      arrivals = await fetchCrtmArrivals(codStop);
    }

    arrivalsCache.set(codStop, { data: arrivals, timestamp: Date.now() });
    return res.status(200).json({ arrivals, cached: false, age: 0, error: false });

  } catch (error) {
    // Si falla la API, devolver los últimos datos guardados aunque estén desactualizados
    if (cached) {
      const age = Math.round((Date.now() - cached.timestamp) / 1000);
      return res.status(200).json({ arrivals: cached.data, cached: true, stale: true, age, error: false });
    }
    return res.status(502).json({ arrivals: [], cached: false, error: true, message: error.message });
  }
}

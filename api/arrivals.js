// Endpoint que devuelve los tiempos de llegada de una parada.
// Guarda los resultados en caché para que varios usuarios que consulten
// la misma parada no generen peticiones repetidas a EMT/CRTM 
// Esto tengo que revisarlo tiene bug en prod*****

// Usamos un Map para guardar los datos en memoria del servidor
// La clave es el codStop y el valor son { data, timestamp }
const arrivalsCache = new Map();

const CACHE_TTL = {
  '6': 20 * 1000, // EMT (buses urbanos): 20 segundos
  '8': 30 * 1000, // CRTM (interurbanos): 30 segundos, cambian menos rápido
};
const DEFAULT_TTL = 25 * 1000;

// Guardamos el token de EMt entre peticiones para no pedir uno nuevo cada vez
let emtToken = null;
let emtTokenExpiry = null;

async function getEmtToken() {
  // Si ya tenemos un token valido (con 1 minuto de margen), lo reutilizamos
  if (emtToken && emtTokenExpiry && Date.now() < emtTokenExpiry - 60000) {
    return emtToken;
  }

  // Intentamos primero con v2, si falla probamos v1 
  //  *** V2 funciona mejor cambiar 
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

      // La respuesta puede venir como array (v2) o directo (v1)
      let data = json.data;
      if (Array.isArray(json.data) && json.data.length > 0) {
        data = json.data[0];
      }

      if (data && data.accessToken) {
        emtToken = data.accessToken;
        emtTokenExpiry = Date.now() + (data.tokenSecExpiration || 86400) * 1000;
        return emtToken;
      }
    } catch {
      // esta URL falló, se prueba la siguiente
    }
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

  // Los datos vienen dentro de data[0].Arrive
  let datos = [];
  if (json.data && json.data[0] && json.data[0].Arrive) {
    datos = json.data[0].Arrive;
  }

  // Filtramos los que tienen tiempo válido (999999 = sin datos)
  const validos = datos.filter(a => a.estimateArrive > 0 && a.estimateArrive < 999999);

  const arrivals = validos.map(a => {
    // Si la API da la posición GPS del bus la guardamos, si no dejamos null
    let busLocation = null;
    if (a.geometry && a.geometry.coordinates) {
      busLocation = {
        longitude: a.geometry.coordinates[0],
        latitude: a.geometry.coordinates[1],
      };
    }

    return {
      line: a.line || '?',
      lineDescription: `Linea ${a.line}`,
      destination: a.destination || '',
      minutes: Math.round(a.estimateArrive / 60),
      arrivalTime: new Date(Date.now() + a.estimateArrive * 1000)
        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      codMode: '6',
      codLine: String(a.line || ''),
      direction: 1,
      busId: a.bus,
      distanceMeters: a.DistanceBus,
      busLocation,
    };
  });

  return arrivals.slice(0, 6);
}

async function fetchCrtmArrivals(codStop) {
  // Simulamos que la petición viene de la web del CRTM porque su API bloquea las externas 
  // Recordar video de Moure :: IMPORTANTE ********
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

  // A veces la API devuelve un objeto suelto en vez de un array
  let timesArray;
  if (Array.isArray(timesData)) {
    timesArray = timesData;
  } else {
    timesArray = [timesData];
  }

  const now = new Date();

  return timesArray
    .map(t => {
      const arrivalTime = new Date(t.time);
      return {
        line: t.line?.shortDescription || '?',
        lineDescription: t.line?.description || '',
        destination: t.destination || '',
        minutes: Math.max(0, Math.round((arrivalTime - now) / 60000)),
        arrivalTime: arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        codMode: t.line?.codMode || '8',
        codLine: t.line?.codLine || '',
        direction: t.direction || 1,
        codItinerary: t.destinationStop?.codStop || '',
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

  // El modo se saca del prefijo del codStop: 6_xxx = EMT, 8_xxx = CRTM
  const mode = codStop.split('_')[0];

  let ttl = DEFAULT_TTL;
  if (CACHE_TTL[mode]) {
    ttl = CACHE_TTL[mode];
  }

  const cached = arrivalsCache.get(codStop);

  // Si los datos en cache siguen siendo recientes, los devolvemos sin llamar a la API
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

    // Guardamos en cache para las siguientes peticiones
    arrivalsCache.set(codStop, { data: arrivals, timestamp: Date.now() });
    return res.status(200).json({ arrivals, cached: false, age: 0, error: false });

  } catch (error) {
    // Si la API falla pero tenemos datos aunque sean viejos, los devolvemos igualmente
    if (cached) {
      const age = Math.round((Date.now() - cached.timestamp) / 1000);
      return res.status(200).json({ arrivals: cached.data, cached: true, stale: true, age, error: false });
    }
    return res.status(502).json({ arrivals: [], cached: false, error: true, message: error.message });
  }
}

// Endpoint admin: consulta el calendario de la EMT para HOY y decide si toca
// crear un aviso global (festivo entre semana o huelga). Lo usa el panel de
// admin de anuncios. Devuelve además un texto sugerido listo para publicar.

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

// Este es el mismo token de la Emt 
let emtToken = null;
let emtTokenExpiry = null;

async function getEmtToken() {
  if (emtToken && emtTokenExpiry && Date.now() < emtTokenExpiry - 60000) return emtToken;

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
      let data = json.data;
      if (Array.isArray(json.data) && json.data.length > 0) data = json.data[0];
      if (data && data.accessToken) {
        emtToken = data.accessToken;
        emtTokenExpiry = Date.now() + (data.tokenSecExpiration || 86400) * 1000;
        return emtToken;
      }
    } catch {
      // probar siguiente URL
    }
  }
  throw new Error('No se pudo obtener token EMT');
}

// Comprueba que quien llama es admin (mismo patrón que announcements.js)
async function getUser(token, serviceKey) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  return res.ok ? res.json() : null;
}

// Fecha de hoy en horario de Madrid (evita el desfase de UTC del servidor)
function fechaMadridHoy() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const y = get('year'), m = get('month'), d = get('day');
  return {
    yyyymmdd: `${y}${m}${d}`,
    humana: `${d}/${m}/${y}`,
    esEntreSemana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(get('weekday')),
  };
}

// Caché simple del resultado del día (el calendario no cambia durante el día)
let cache = null; // { yyyymmdd, payload, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1h

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Config servidor incompleta' });

  // Solo admin (consume token EMT, lo protegemos)
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUser(token, serviceKey);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const hoy = fechaMadridHoy();

  if (cache && cache.yyyymmdd === hoy.yyyymmdd && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json(cache.payload);
  }

  try {
    const accessToken = await getEmtToken();
    const r = await fetch(
      `https://openapi.emtmadrid.es/v1/transport/busemtmad/calendar/${hoy.yyyymmdd}/${hoy.yyyymmdd}/`,
      { headers: { accessToken } }
    );
    if (!r.ok) throw new Error(`EMT calendar ${r.status}`);
    const json = await r.json();
    const dia = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!dia) throw new Error('Calendario EMT sin datos');

    const dayType = dia.dayType; // LA=laborable, SA=sábado, FE=festivo (incluye domingos)
    const esHuelga = !!dia.strike && String(dia.strike).toUpperCase() !== 'N';
    // Festivo "real" = FE en día entre semana (los domingos también son FE → se ignoran)
    const esFestivoEntreSemana = dayType === 'FE' && hoy.esEntreSemana;

    // La huelga manda sobre el festivo a la hora de avisar
    let reason = null;
    let suggestion = null;
    if (esHuelga) {
      reason = 'strike';
      suggestion = {
        type: 'danger',
        title: 'Huelga de transporte hoy',
        body: `Hoy ${hoy.humana} hay huelga en la EMT. El servicio de autobuses puede sufrir retrasos o cancelaciones. Consulta los tiempos en tiempo real desde la app antes de salir.`,
      };
    } else if (esFestivoEntreSemana) {
      reason = 'holiday';
      suggestion = {
        type: 'warning',
        title: 'Hoy es festivo',
        body: `Hoy ${hoy.humana} es festivo: los autobuses de la EMT circulan con horario de festivo, así que las frecuencias son menores y puede haber esperas más largas de lo habitual.`,
      };
    }

    const payload = {
      date: hoy.humana,
      dayType,
      strike: esHuelga,
      shouldAnnounce: reason !== null,
      reason,
      suggestion,
    };

    cache = { yyyymmdd: hoy.yyyymmdd, payload, ts: Date.now() };
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[emt-calendar]', e.message);
    return res.status(502).json({ error: 'No se pudo consultar el calendario de la EMT' });
  }
}

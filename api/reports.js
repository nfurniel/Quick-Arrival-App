const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

const VALID_TYPES = ['seats', 'punctuality', 'crowding', 'noise', 'temperature', 'driver', 'accessibility'];

const VALID_OPTIONS = {
  seats:         ['many', 'some', 'few', 'none'],
  punctuality:   ['early', 'on_time', 'slightly_late', 'very_late'],
  crowding:      ['empty', 'normal', 'full', 'overcrowded'],
  noise:         ['quiet', 'normal', 'noisy'],
  temperature:   ['cold', 'ok', 'hot'],
  driver:        ['great', 'normal', 'bad'],
  accessibility: ['ramp_ok', 'ramp_broken'],
};

// España peninsular + islas (bbox amplio)
const LAT_MIN = 27.5, LAT_MAX = 44.0;
const LNG_MIN = -18.5, LNG_MAX = 4.5;

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

async function verifyUser(authHeader, serviceKey) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: serviceKey },
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuración del servidor incompleta' });

  // GET /api/reports?lineName=27&busId=1234
  if (req.method === 'GET') {
    const lineName = req.query.lineName;
    if (!lineName || lineName.length > 20) {
      return res.status(400).json({ error: 'Parámetro lineName inválido' });
    }

    const busId = req.query.busId && String(req.query.busId).length <= 30
      ? String(req.query.busId)
      : null;

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let params = `select=id,type,metadata,description,line_name,created_at,report_votes(vote_type,user_id)&status=eq.active&line_name=eq.${encodeURIComponent(lineName)}&created_at=gte.${since}&order=created_at.desc&limit=20`;
    if (busId) params += `&metadata->>busId=eq.${encodeURIComponent(busId)}`;

    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/reports?${params}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const raw = await r.json();

      const reports = raw.map(({ report_votes, ...report }) => ({
        ...report,
        votes: {
          up:   (report_votes || []).filter(v => v.vote_type === 'up').length,
          down: (report_votes || []).filter(v => v.vote_type === 'down').length,
        },
      }));

      return res.status(200).json({ reports });
    } catch (err) {
      return res.status(502).json({ error: err.message, reports: [] });
    }
  }

  // POST /api/reports
  if (req.method === 'POST') {
    const user = await verifyUser(req.headers.authorization, serviceKey);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { type, metadata, description, lat, lng, lineName, busId } = req.body || {};

    // Tipo
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de reporte no válido' });
    }

    // Opción del tipo
    const optionValue = metadata?.value;
    if (!optionValue || !VALID_OPTIONS[type].includes(optionValue)) {
      return res.status(400).json({ error: 'Opción no válida para este tipo de reporte' });
    }

    // Coordenadas
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN) || latN < LAT_MIN || latN > LAT_MAX || lngN < LNG_MIN || lngN > LNG_MAX) {
      return res.status(400).json({ error: 'Coordenadas fuera del rango válido' });
    }

    // Nombre de línea
    if (!lineName || typeof lineName !== 'string' || lineName.trim().length === 0 || lineName.length > 20) {
      return res.status(400).json({ error: 'Nombre de línea inválido' });
    }
    const cleanLineName = stripHtml(lineName).slice(0, 20);

    // Descripción opcional
    let cleanDescription = null;
    if (description) {
      if (typeof description !== 'string') return res.status(400).json({ error: 'Descripción inválida' });
      cleanDescription = stripHtml(description).slice(0, 150) || null;
    }

    // Validar busId opcional
    const cleanBusId = busId && typeof busId === 'string' && busId.length <= 30
      ? busId.trim()
      : null;

    // Duplicado: mismo usuario, mismo tipo, mismo bus (o línea si no hay busId) en las últimas 2h
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let dupUrl = `${SUPABASE_URL}/rest/v1/reports?user_id=eq.${user.id}&type=eq.${type}&line_name=eq.${encodeURIComponent(cleanLineName)}&status=eq.active&created_at=gte.${since}&select=id&limit=1`;
    if (cleanBusId) dupUrl += `&metadata->>busId=eq.${encodeURIComponent(cleanBusId)}`;
    const dupCheck = await fetch(dupUrl,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (dupCheck.ok) {
      const existing = await dupCheck.json();
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya has reportado esta categoría en esta línea recientemente' });
      }
    }

    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          user_id: user.id,
          type,
          metadata: { value: optionValue, ...(cleanBusId ? { busId: cleanBusId } : {}) },
          description: cleanDescription,
          lat: latN,
          lng: lngN,
          line_name: cleanLineName,
          status: 'active',
        }),
      });

      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Supabase ${r.status}: ${body}`);
      }

      const [report] = await r.json();
      return res.status(201).json({ report });
    } catch (err) {
      console.error('[api/reports] Error:', err.message);
      return res.status(502).json({ error: 'Error guardando el reporte' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

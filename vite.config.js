import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Caché de tiempos compartida para dev local ────────────────────────────────
const arrivalsCache = new Map();
const ARRIVALS_TTL = { '6': 20000, '8': 30000 };
let trafficCache = new Map();
let devEmtToken = null;
let devEmtTokenExpiry = null;

// Plugin que simula las Edge Functions localmente durante el desarrollo
// Esto es para poder probar localmente todo para luego subirlo a produccion 
function localApiPlugin(env) {
  const serviceKey = env.SUPABASE_SERVICE_KEY;

  async function supabaseFetch(query) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/static_stops?${query}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    });
    if (!r.ok) throw new Error(`Supabase error ${r.status}`);
    return r.json();
  }

  function send(res, status, data, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra });
    res.end(JSON.stringify(data));
  }

  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const [pathname, search] = req.url.split('?');
        const params = new URLSearchParams(search || '');

        // GET /api/stops
        if (pathname === '/api/stops') {
          const { minLat, maxLat, minLng, maxLng } = Object.fromEntries(params);
          if (!minLat || !maxLat || !minLng || !maxLng)
            return send(res, 400, { error: 'Faltan parámetros: minLat, maxLat, minLng, maxLng' });
          if (!serviceKey)
            return send(res, 500, { error: 'SUPABASE_SERVICE_KEY no configurada en .env' });
          try {
            const query = `select=stop_id,name,lat,lng,cod_mode,cod_estacion,lines&lat=gte.${minLat}&lat=lte.${maxLat}&lng=gte.${minLng}&lng=lte.${maxLng}&cod_mode=in.(6,8)&limit=500`;
            const data = await supabaseFetch(query);
            return send(res, 200, data, { 'Cache-Control': 'public, max-age=60' });
          } catch (e) {
            console.error('[local-api/stops]', e.message);
            return send(res, 502, { error: 'Error consultando Supabase' });
          }
        }

        // GET /api/stops-nearby
        if (pathname === '/api/stops-nearby') {
          const lat = parseFloat(params.get('lat'));
          const lng = parseFloat(params.get('lng'));
          const line = params.get('line');
          const radiusKm = parseFloat(params.get('radius') || '1.5');
          if (!lat || !lng || !line)
            return send(res, 400, { error: 'Faltan parámetros: lat, lng, line' });
          if (!serviceKey)
            return send(res, 500, { error: 'SUPABASE_SERVICE_KEY no configurada en .env' });
          try {
            const latOffset = radiusKm / 111;
            const lngOffset = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
            const query = `select=stop_id,name,lat,lng,cod_mode,cod_estacion,lines&lat=gte.${lat - latOffset}&lat=lte.${lat + latOffset}&lng=gte.${lng - lngOffset}&lng=lte.${lng + lngOffset}&cod_mode=in.(6,8)&lines=ilike.*${encodeURIComponent(line)}*&limit=100`;
            const raw = await supabaseFetch(query);
            const search = line.toLowerCase().trim();
            const filtered = raw
              .filter(s => s.lines?.split(',').map(l => l.trim().toLowerCase()).includes(search))
              .map(s => ({ ...s, distance: Math.round(haversine(lat, lng, s.lat, s.lng)) }))
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 4);
            return send(res, 200, filtered);
          } catch (e) {
            console.error('[local-api/stops-nearby]', e.message);
            return send(res, 502, { error: 'Error consultando Supabase' });
          }
        }

        // GET /api/lines
        if (pathname === '/api/lines') {
          if (!serviceKey)
            return send(res, 500, { error: 'SUPABASE_SERVICE_KEY no configurada en .env' });
          try {
            const data = await supabaseFetch('select=lines&cod_mode=in.(6,8)&lines=not.is.null');
            const linesSet = new Set();
            data.forEach(s => s.lines?.split(',').forEach(l => { const t = l.trim(); if (t) linesSet.add(t); }));
            const lines = [...linesSet].sort((a, b) => {
              const nA = parseInt(a), nB = parseInt(b);
              if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
              if (!isNaN(nA)) return -1;
              if (!isNaN(nB)) return 1;
              return a.localeCompare(b);
            });
            return send(res, 200, lines, { 'Cache-Control': 'public, max-age=3600' });
          } catch (e) {
            console.error('[local-api/lines]', e.message);
            return send(res, 502, { error: 'Error consultando Supabase' });
          }
        }

        // GET /api/arrivals — tiempos con caché compartida
        if (pathname === '/api/arrivals') {
          const codStop = params.get('codStop');
          if (!codStop) return send(res, 400, { error: 'Falta parámetro: codStop' });

          const mode = codStop.split('_')[0];
          const ttl = ARRIVALS_TTL[mode] ?? 25000;
          const cached = arrivalsCache.get(codStop);

          if (cached && Date.now() - cached.timestamp < ttl) {
            const age = Math.round((Date.now() - cached.timestamp) / 1000);
            console.log(`[local-api/arrivals] Cache hit ${codStop} (${age}s)`);
            return send(res, 200, { arrivals: cached.data, cached: true, age, error: false });
          }

          try {
            let arrivals;

            if (mode === '6') {
              // EMT — token cacheado a nivel de módulo
              if (!devEmtToken || !devEmtTokenExpiry || Date.now() >= devEmtTokenExpiry - 60000) {
                const urls = [
                  'https://openapi.emtmadrid.es/v2/mobilitylabs/user/login/',
                  'https://openapi.emtmadrid.es/v1/mobilitylabs/user/login/',
                ];
                for (const u of urls) {
                  const r = await fetch(u, {
                    headers: {
                      email: env.VITE_EMT_EMAIL || '', password: env.VITE_EMT_PASSWORD || '',
                      'X-ClientId': env.VITE_EMT_CLIENT_ID || '', passKey: env.VITE_EMT_PASSKEY || '',
                    },
                  });
                  if (!r.ok) continue;
                  const j = await r.json();
                  const d = j.data?.[0] || j.data;
                  if (d?.accessToken) {
                    devEmtToken = d.accessToken;
                    devEmtTokenExpiry = Date.now() + (d.tokenSecExpiration || 86400) * 1000;
                    break;
                  }
                }
              }
              const stopId = codStop.replace('6_', '');
              const body = JSON.stringify({ cultureInfo: 'ES', Text_StopRequired_YN: 'Y', Text_EstimationsRequired_YN: 'Y', Text_IncidencesRequired_YN: 'N' });
              const r = await fetch(`https://openapi.emtmadrid.es/v2/transport/busemtmad/stops/${stopId}/arrives/all/`, {
                method: 'POST', headers: { 'accessToken': devEmtToken, 'Content-Type': 'application/json' }, body,
              });
              const json = await r.json();
              const datos = json.data?.[0]?.Arrive || [];
              arrivals = datos
                .filter(a => a.estimateArrive > 0 && a.estimateArrive < 999999)
                .map(a => ({
                  line: a.line || '?', lineDescription: `Linea ${a.line}`, destination: a.destination || '',
                  minutes: Math.round(a.estimateArrive / 60),
                  arrivalTime: new Date(Date.now() + a.estimateArrive * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                  codMode: '6', codLine: String(a.line || ''), direction: 1, busId: a.bus,
                  distanceMeters: a.DistanceBus,
                  busLocation: a.geometry?.coordinates ? { longitude: a.geometry.coordinates[0], latitude: a.geometry.coordinates[1] } : null,
                })).slice(0, 6);

            } else {
              // CRTM
              const r = await fetch(`https://www.crtm.es/widgets/api/GetStopsTimes.php?codStop=${codStop}&type=0&orderBy=2&stopTimesByIti=${codStop}&_=${Date.now()}`, {
                headers: { Origin: 'https://www.crtm.es', Referer: 'https://www.crtm.es/', Accept: '*/*', 'User-Agent': 'Mozilla/5.0' },
              });
              const json = await r.json();
              const timesData = json?.stopTimes?.times?.Time;
              if (!timesData) {
                arrivals = [];
              } else {
                const arr = Array.isArray(timesData) ? timesData : [timesData];
                const now = new Date();
                arrivals = arr.map(t => {
                  const at = new Date(t.time);
                  return { line: t.line?.shortDescription || '?', lineDescription: t.line?.description || '', destination: t.destination || '', minutes: Math.max(0, Math.round((at - now) / 60000)), arrivalTime: at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), codMode: t.line?.codMode || '8', codLine: t.line?.codLine || '', direction: t.direction || 1 };
                }).filter(t => t.minutes >= 0).slice(0, 6);
              }
            }

            arrivalsCache.set(codStop, { data: arrivals, timestamp: Date.now() });
            console.log(`[local-api/arrivals] Fetch fresco ${codStop}: ${arrivals.length} llegadas`);
            return send(res, 200, { arrivals, cached: false, age: 0, error: false });

          } catch (e) {
            console.error('[local-api/arrivals]', e.message);
            if (cached) {
              const age = Math.round((Date.now() - cached.timestamp) / 1000);
              return send(res, 200, { arrivals: cached.data, cached: true, stale: true, age, error: false });
            }
            return send(res, 502, { arrivals: [], cached: false, error: true });
          }
        }

        // GET + POST /api/reports
        if (pathname === '/api/reports') {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
            return res.end();
          }

          if (req.method === 'GET') {
            const lineName = params.get('lineName');
            if (!lineName) return send(res, 400, { error: 'Falta parámetro: lineName' });
            const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const q = `select=id,type,metadata,description,line_name,created_at,report_votes(vote_type,user_id)&status=eq.active&line_name=eq.${encodeURIComponent(lineName)}&created_at=gte.${since}&order=created_at.desc&limit=20`;
            try {
              const r = await fetch(`${SUPABASE_URL}/rest/v1/reports?${q}`, {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              });
              if (!r.ok) throw new Error(`Supabase ${r.status}`);
              const raw = await r.json();
              const reports = raw.map(({ report_votes, ...rep }) => ({
                ...rep,
                votes: {
                  up: (report_votes || []).filter(v => v.vote_type === 'up').length,
                  down: (report_votes || []).filter(v => v.vote_type === 'down').length,
                },
              }));
              return send(res, 200, { reports });
            } catch (e) {
              console.error('[local-api/reports GET]', e.message);
              return send(res, 502, { error: e.message, reports: [] });
            }
          }

          if (req.method === 'POST') {
            // Leer body
            const body = await new Promise((resolve) => {
              let data = '';
              req.on('data', chunk => { data += chunk; });
              req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
            });

            // Verificar JWT
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
            if (!token) return send(res, 401, { error: 'No autenticado' });

            const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
            });
            if (!authRes.ok) return send(res, 401, { error: 'Token inválido' });
            const user = await authRes.json();

            const { type, metadata, description, lat, lng, lineName, lineId } = body;
            if (!type || lat == null || lng == null) return send(res, 400, { error: 'Faltan campos: type, lat, lng' });

            const VALID_TYPES = ['seats', 'punctuality', 'crowding', 'noise', 'temperature', 'driver', 'accessibility'];
            if (!VALID_TYPES.includes(type)) return send(res, 400, { error: 'Tipo de reporte no válido' });

            const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const dupRes = await fetch(
              `${SUPABASE_URL}/rest/v1/reports?user_id=eq.${user.id}&type=eq.${type}&line_name=eq.${encodeURIComponent(lineName || '')}&status=eq.active&created_at=gte.${since}&select=id&limit=1`,
              { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
            );
            if (dupRes.ok) {
              const existing = await dupRes.json();
              if (existing.length > 0) return send(res, 409, { error: 'Ya has reportado esta categoría en esta línea recientemente' });
            }

            const payload = {
              user_id: user.id,
              type,
              metadata: metadata || {},
              description: description?.slice(0, 300) || null,
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              line_name: lineName || null,
              status: 'active',
            };

            try {
              const r = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
                method: 'POST',
                headers: {
                  apikey: serviceKey,
                  Authorization: `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=representation',
                },
                body: JSON.stringify(payload),
              });
              if (!r.ok) { const t = await r.text(); console.error('[local-api/reports] Supabase error:', t); throw new Error(`Supabase ${r.status}: ${t}`); }
              const [report] = await r.json();
              console.log('[local-api/reports] Reporte creado:', report?.id);
              return send(res, 201, { report });
            } catch (e) {
              console.error('[local-api/reports]', e.message);
              return send(res, 502, { error: 'Error guardando el reporte' });
            }
          }
        }

        // POST /api/report-votes
        if (pathname === '/api/report-votes') {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
            return res.end();
          }
          if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });

          const body = await new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
          });

          const authHeader = req.headers['authorization'] || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
          if (!token) return send(res, 401, { error: 'No autenticado' });

          const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
          });
          if (!authRes.ok) return send(res, 401, { error: 'Token inválido' });
          const user = await authRes.json();

          const { reportId, voteType } = body;
          if (!reportId || !['up', 'down'].includes(voteType))
            return send(res, 400, { error: 'Faltan campos: reportId, voteType (up|down)' });

          try {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/report_votes`, {
              method: 'POST',
              headers: {
                apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=representation',
              },
              body: JSON.stringify({ report_id: reportId, user_id: user.id, vote_type: voteType }),
            });
            if (!r.ok) { const t = await r.text(); throw new Error(`Supabase ${r.status}: ${t}`); }

            const countsRes = await fetch(
              `${SUPABASE_URL}/rest/v1/report_votes?report_id=eq.${reportId}&select=vote_type`,
              { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
            );
            const votes = await countsRes.json();
            const up = votes.filter(v => v.vote_type === 'up').length;
            const down = votes.filter(v => v.vote_type === 'down').length;
            console.log(`[local-api/report-votes] report ${reportId}: ${up}👍 ${down}👎`);
            return send(res, 200, { up, down, userVote: voteType });
          } catch (e) {
            console.error('[local-api/report-votes]', e.message);
            return send(res, 502, { error: 'Error guardando el voto' });
          }
        }

        // GET /api/traffic — incidencias TomTom
        if (pathname === '/api/traffic') {
          const { minLon, minLat, maxLon, maxLat } = Object.fromEntries(params);
          if (!minLon || !minLat || !maxLon || !maxLat)
            return send(res, 400, { error: 'Faltan parámetros bbox', incidents: [] });

          const tomtomKey = env.TOMTOM_API_KEY;
          if (!tomtomKey)
            return send(res, 500, { error: 'TOMTOM_API_KEY no configurada en .env', incidents: [] });

          const GRID = 0.02;
          const snapped = {
            minLon: (Math.floor(parseFloat(minLon) / GRID) * GRID).toFixed(3),
            minLat: (Math.floor(parseFloat(minLat) / GRID) * GRID).toFixed(3),
            maxLon: (Math.ceil(parseFloat(maxLon) / GRID) * GRID).toFixed(3),
            maxLat: (Math.ceil(parseFloat(maxLat) / GRID) * GRID).toFixed(3),
          };
          const cacheKey = `${snapped.minLon},${snapped.minLat},${snapped.maxLon},${snapped.maxLat}`;

          const cached = trafficCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            console.log(`[local-api/traffic] cache hit ${cacheKey}`);
            return send(res, 200, { incidents: cached.data, cached: true });
          }

          const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${tomtomKey}&bbox=${cacheKey}&language=es-ES&projection=EPSG4326`;

          try {
            const r = await fetch(url);
            if (!r.ok) {
              const body = await r.text();
              console.error(`[local-api/traffic] TomTom ${r.status}:`, body);
              throw new Error(`TomTom ${r.status}: ${body}`);
            }
            const json = await r.json();
            const incidents = json.incidents || [];
            trafficCache.set(cacheKey, { data: incidents, timestamp: Date.now() });
            console.log(`[local-api/traffic] ${incidents.length} incidencias (${cacheKey})`);
            return send(res, 200, { incidents, cached: false });
          } catch (e) {
            console.error('[local-api/traffic]', e.message);
            if (cached) return send(res, 200, { incidents: cached.data, cached: true, stale: true });
            return send(res, 502, { error: e.message, incidents: [] });
          }
        }

        // GET + POST /api/support
        if (pathname === '/api/support') {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
            return res.end();
          }

          const authHeader = req.headers['authorization'] || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
          if (!token) return send(res, 401, { error: 'No autenticado' });

          const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
          });
          if (!authRes.ok) return send(res, 401, { error: 'Token inválido' });
          const user = await authRes.json();

          if (req.method === 'POST') {
            const body = await new Promise((resolve) => {
              let data = '';
              req.on('data', chunk => { data += chunk; });
              req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
            });

            const { type, description } = body;
            if (!type) return send(res, 400, { error: 'Falta el tipo' });
            if (description && description.length > 500) return send(res, 400, { error: 'Descripción demasiado larga' });

            try {
              const r = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
                method: 'POST',
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({ user_id: user.id, type, description: description || null, status: 'pending' }),
              });
              if (!r.ok) throw new Error(`Supabase ${r.status}`);
              console.log(`[local-api/support] Ticket creado por ${user.email}`);
              return send(res, 201, { ok: true });
            } catch (e) {
              console.error('[local-api/support]', e.message);
              return send(res, 500, { error: 'Error al guardar el ticket' });
            }
          }

          if (req.method === 'GET') {
            if (user.app_metadata?.role !== 'admin') return send(res, 403, { error: 'No autorizado' });

            try {
              const r = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?select=*&order=created_at.desc`, {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              });
              const tickets = await r.json();
              return send(res, 200, { tickets: Array.isArray(tickets) ? tickets : [] });
            } catch (e) {
              console.error('[local-api/support]', e.message);
              return send(res, 502, { error: 'Error cargando tickets' });
            }
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApiPlugin(env)],
    server: {
      proxy: {
        '/api/emt': {
          target: 'https://openapi.emtmadrid.es',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/emt/, ''),
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.url.includes('user/login')) {
                proxyReq.setHeader('email', env.VITE_EMT_EMAIL || '');
                proxyReq.setHeader('password', env.VITE_EMT_PASSWORD || '');
                if (env.VITE_EMT_CLIENT_ID) proxyReq.setHeader('X-ClientId', env.VITE_EMT_CLIENT_ID);
                if (env.VITE_EMT_PASSKEY) proxyReq.setHeader('passKey', env.VITE_EMT_PASSKEY);
              }
            });
          },
        },
        '/api/crtm': {
          target: 'https://www.crtm.es',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/crtm/, ''),
          secure: false,
          timeout: 30000,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log('[CRTM Proxy] → ', req.url);
              proxyReq.setHeader('origin', 'https://www.crtm.es');
              proxyReq.setHeader('referer', 'https://www.crtm.es/');
              proxyReq.setHeader('accept', '*/*');
              proxyReq.removeHeader('sec-fetch-mode');
              proxyReq.removeHeader('sec-fetch-site');
              proxyReq.removeHeader('sec-fetch-dest');
              proxyReq.removeHeader('sec-fetch-user');
              proxyReq.removeHeader('sec-ch-ua');
              proxyReq.removeHeader('sec-ch-ua-mobile');
              proxyReq.removeHeader('sec-ch-ua-platform');
              proxyReq.removeHeader('upgrade-insecure-requests');
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log('[CRTM Proxy] ← ', proxyRes.statusCode, req.url);
            });
          },
        },
      },
    },
  };
})

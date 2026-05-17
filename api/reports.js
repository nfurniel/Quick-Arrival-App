// nodemailer como servidor SMTP 
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

// TIpos 
const VALID_TYPES = ['seats', 'punctuality', 'crowding', 'noise', 'temperature', 'driver', 'accessibility'];

const TYPE_LABELS_ES = {
  seats: 'Asientos',
  punctuality: 'Puntualidad',
  crowding: 'Ocupación',
  noise: 'Ruido',
  temperature: 'Temperatura',
  driver: 'Conducción',
  accessibility: 'Accesibilidad',
};

async function enviarEmailAdvertencia(toEmail, motivo, reporteResumen) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('[reports/warn] GMAIL_USER o GMAIL_APP_PASSWORD no configuradas');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"Quick Arrival — Moderación" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Aviso sobre un reporte tuyo — Quick Arrival',
    text: `Hola,\n\nHemos revisado uno de tus reportes (${reporteResumen}) y queremos avisarte de lo siguiente:\n\n${motivo}\n\nLos reportes ayudan a otros usuarios, así que te pedimos que los uses con responsabilidad. Si seguimos detectando reportes falsos podríamos restringir tu cuenta.\n\nGracias.`,
    html: `<p>Hola,</p><p>Hemos revisado uno de tus reportes (<b>${reporteResumen}</b>) y queremos avisarte de lo siguiente:</p><blockquote style="border-left:3px solid #f59e0b;padding-left:1rem;color:#334155;margin:1rem 0">${motivo.replace(/\n/g, '<br>')}</blockquote><p>Los reportes ayudan a otros usuarios, así que te pedimos que los uses con responsabilidad. Si seguimos detectando reportes falsos podríamos restringir tu cuenta.</p><p>Gracias.</p>`,
  });
  return true;
}

// Para cada tipo de reporte, los valores que acepta
const VALID_OPTIONS = {
  seats: ['many', 'some', 'few', 'none'],
  punctuality: ['early', 'on_time', 'slightly_late', 'very_late'],
  crowding: ['empty', 'normal', 'full', 'overcrowded'],
  noise: ['quiet', 'normal', 'noisy'],
  temperature: ['cold', 'ok', 'hot'],
  driver: ['great', 'normal', 'bad'],
  accessibility: ['ramp_ok', 'ramp_broken'],
};

// España peninsular + islas (bbox amplio)
const LAT_MIN = 27.5, LAT_MAX = 44.0;
const LNG_MIN = -18.5, LNG_MAX = 4.5;

// Quitamos etiquetas HTML para evitar que alguien inyecte código en los textos
// Ver video S4avitarrr *************
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuración del servidor incompleta' });

  // Listado para el panel admin: GET /api/reports?admin=1
  if (req.method === 'GET' && req.query.admin === '1') {
    const user = await verifyUser(req.headers.authorization, serviceKey);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    try {
      // Primero traemos los reportes
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/reports?select=id,user_id,type,metadata,description,line_name,created_at,status&order=created_at.desc&limit=200`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Supabase ${r.status}: ${body}`);
      }
      const reports = await r.json();

      // Y después cogemos los usernames de los que lo han hecho en una sola consulta
      const ids = [...new Set(reports.map(rep => rep.user_id).filter(Boolean))];
      const profilesMap = {};
      if (ids.length > 0) {
        const list = ids.map(id => `"${id}"`).join(',');
        const pr = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${list})`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        if (pr.ok) {
          const profiles = await pr.json();
          for (const p of profiles) profilesMap[p.id] = p.username;
        }
      }

      const enriched = reports.map(rep => ({
        ...rep,
        username: profilesMap[rep.user_id] || null,
      }));
      return res.status(200).json({ reports: enriched });
    } catch (err) {
      console.error('[api/reports admin GET] Error:', err.message);
      return res.status(502).json({ error: 'Error cargando reportes' });
    }
  }

  // Eliminar un reporte (solo  puede hacerlo admin)
  if (req.method === 'DELETE') {
    const user = await verifyUser(req.headers.authorization, serviceKey);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    const { reportId } = req.body || {};
    if (!reportId) return res.status(400).json({ error: 'Falta reportId' });

    const del = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!del.ok) return res.status(500).json({ error: 'Error eliminando el reporte' });
    return res.status(200).json({ ok: true });
  }

  // GET /api/reports?lineName=27&busId=1234
  if (req.method === 'GET') {
    const lineName = req.query.lineName;
    if (!lineName || lineName.length > 20) {
      return res.status(400).json({ error: 'Parámetro lineName inválido' });
    }

    // El busId en verdad es opcional, solo lo usamos si viene y no es demasiado largo
    let busId = null;
    if (req.query.busId && String(req.query.busId).length <= 30) {
      busId = String(req.query.busId);
    }

    // Solo mostramos reportes de las últimas 2 horas
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let params = `select=id,type,metadata,description,line_name,created_at,report_votes(vote_type,user_id)&status=eq.active&line_name=eq.${encodeURIComponent(lineName)}&created_at=gte.${since}&order=created_at.desc&limit=20`;
    if (busId) params += `&metadata->>busId=eq.${encodeURIComponent(busId)}`;

    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/reports?${params}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const raw = await r.json();

      // Transformamos los datos: contamos votos y los separamos del reporte
      const reports = raw.map(({ report_votes, ...report }) => ({
        ...report,
        votes: {
          up: (report_votes || []).filter(v => v.vote_type === 'up').length,
          down: (report_votes || []).filter(v => v.vote_type === 'down').length,
        },
      }));

      return res.status(200).json({ reports });
    } catch (err) {
      return res.status(502).json({ error: err.message, reports: [] });
    }
  }

  // Cuando el admin avisa al autor de un reporte, manda email y opcionalmente borra el reporte
  if (req.method === 'POST' && req.body?.action === 'warn') {
    const user = await verifyUser(req.headers.authorization, serviceKey);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    const { reportId, motivo, deleteAfter } = req.body || {};
    if (!reportId) return res.status(400).json({ error: 'Falta reportId' });
    if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({ error: 'Falta el motivo de la advertencia' });
    }
    const cleanMotivo = stripHtml(motivo).slice(0, 500);

    // Necesitamos saber quién hizo el reporte para mandarle el email
    const rRes = await fetch(
      `${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&select=id,user_id,type,line_name`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!rRes.ok) return res.status(500).json({ error: 'Error cargando el reporte' });
    const reports = await rRes.json();
    const reporte = reports[0];
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

    // Sacamos el email del autor desde auth.users
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${reporte.user_id}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!userRes.ok) return res.status(500).json({ error: 'No se pudo obtener el email del usuario' });
    const ticketUser = await userRes.json();
    const email = ticketUser?.email;
    if (!email) return res.status(400).json({ error: 'El usuario no tiene email' });

    const resumen = `${TYPE_LABELS_ES[reporte.type] || reporte.type} — línea ${reporte.line_name}`;
    try {
      const ok = await enviarEmailAdvertencia(email, cleanMotivo, resumen);
      if (!ok) return res.status(500).json({ error: 'Email no enviado (faltan credenciales SMTP)' });
    } catch (err) {
      console.error('[reports/warn] Error enviando email:', err.message);
      return res.status(502).json({ error: 'Error enviando el email' });
    }

    // Si el admin marcó la casilla, borramos el reporte también
    if (deleteAfter) {
      await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    }

    return res.status(200).json({ ok: true, deleted: !!deleteAfter });
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

    // Opcion del tipo
    const optionValue = metadata?.value;
    if (!optionValue || !VALID_OPTIONS[type].includes(optionValue)) {
      return res.status(400).json({ error: 'Opción no válida para este tipo de reporte' });
    }

    // Coordenadas — tienen que estar dentro de España xD
    // REVISARRRR ****
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN) || latN < LAT_MIN || latN > LAT_MAX || lngN < LNG_MIN || lngN > LNG_MAX) {
      return res.status(400).json({ error: 'Coordenadas fuera del rango válido' });
    }

    // Nombre de linea
    if (!lineName || typeof lineName !== 'string' || lineName.trim().length === 0 || lineName.length > 20) {
      return res.status(400).json({ error: 'Nombre de línea inválido' });
    }
    const cleanLineName = stripHtml(lineName).slice(0, 20);

    // Descripción opcional (texto libre del usuario)
    let cleanDescription = null;
    if (description) {
      if (typeof description !== 'string') return res.status(400).json({ error: 'Descripción inválida' });
      cleanDescription = stripHtml(description).slice(0, 150) || null;
    }

    // El busId es opcional, solo lo guardamos si viene y es válido
    let cleanBusId = null;
    if (busId && typeof busId === 'string' && busId.length <= 30) {
      cleanBusId = busId.trim();
    }

    // Comprobamos que el mismo usuario no haya reportado lo mismo en las últimas 2h
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
      // Construimos el objeto metadata: siempre lleva el valor, y el busId solo si existe 
      // Seguir el curso miduddev ***************
      const metadataToSave = { value: optionValue };
      if (cleanBusId) {
        metadataToSave.busId = cleanBusId;
      }

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
          metadata: metadataToSave,
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

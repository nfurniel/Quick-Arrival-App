// Endpoint para los anuncios globales. El popup del mapa usa el GET sin params
// y el panel admin usa el resto de métodos.

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';
const VALID_TYPES = ['info', 'warning', 'danger'];

// Quitamos etiquetas HTML para que nadie inyecte código en los textos
function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

async function getUser(token, serviceKey) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  return res.ok ? res.json() : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Config servidor incompleta' });

  const token = req.headers.authorization?.replace('Bearer ', '');

  // Si viene ?admin=1 devolvemos todos, sii no solo los activos
  if (req.method === 'GET') {
    const isAdminMode = req.query.admin === '1';
    let filter = 'order=created_at.desc';
    if (isAdminMode) {
      const user = await getUser(token, serviceKey);
      if (!user) return res.status(401).json({ error: 'No autenticado' });
      if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    } else {
      filter = 'active=eq.true&order=created_at.desc&limit=10';
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements?select=*&${filter}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) return res.status(502).json({ error: 'Error cargando anuncios' });
    const announcements = await r.json();
    return res.status(200).json({ announcements });
  }

  // El resto de operaciones solo las puede hacer el admin
  const user = await getUser(token, serviceKey);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  // Crear anuncio
  if (req.method === 'POST') {
    const { title, body, type, active } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'Faltan title o body' });
    const cleanTitle = stripHtml(title).slice(0, 120);
    const cleanBody = stripHtml(body).slice(0, 600);
    const cleanType = VALID_TYPES.includes(type) ? type : 'info';

    const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        title: cleanTitle,
        body: cleanBody,
        type: cleanType,
        active: active !== false,
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('[announcements POST]', txt);
      return res.status(500).json({ error: 'Error creando anuncio' });
    }
    const [announcement] = await r.json();
    return res.status(201).json({ announcement });
  }

  // Editar o activar/desactivar
  if (req.method === 'PATCH') {
    const { id, title, body, type, active } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Falta id' });

    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = stripHtml(title).slice(0, 120);
    if (body !== undefined) patch.body = stripHtml(body).slice(0, 600);
    if (type !== undefined && VALID_TYPES.includes(type)) patch.type = type;
    if (active !== undefined) patch.active = !!active;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return res.status(500).json({ error: 'Error actualizando anuncio' });
    const [announcement] = await r.json();
    return res.status(200).json({ announcement });
  }

  // Eliminar
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Falta id' });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) return res.status(500).json({ error: 'Error eliminando anuncio' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

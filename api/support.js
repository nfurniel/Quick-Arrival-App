const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  return res.ok ? res.json() : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const user = await getUser(token);
  if (!user?.id) return res.status(401).json({ error: 'Token inválido' });

  // POST — crear ticket de soporte
  if (req.method === 'POST') {
    const { type, description } = req.body || {};
    if (!type) return res.status(400).json({ error: 'Falta el tipo' });
    if (description && description.length > 500) return res.status(400).json({ error: 'Descripción demasiado larga' });

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ user_id: user.id, type, description: description || null, status: 'pending' }),
    });

    if (!insert.ok) return res.status(500).json({ error: 'Error al guardar el ticket' });
    return res.status(201).json({ ok: true });
  }

  // GET — listar tickets (solo admin)
  if (req.method === 'GET') {
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    const ticketsRes = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?select=*&order=created_at.desc`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const tickets = await ticketsRes.json();
    return res.status(200).json({ tickets: Array.isArray(tickets) ? tickets : [] });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

// Comprueba que el token del usuario es válido preguntándole a Supabase
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuración del servidor incompleta' });

  const user = await verifyUser(req.headers.authorization, serviceKey);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const { reportId, voteType } = req.body || {};

  // reportId debe ser  un entero positivo (no dejamos pasar strings ni decimales)
  const reportIdN = parseInt(reportId, 10);
  if (!reportId || isNaN(reportIdN) || reportIdN <= 0 || String(reportIdN) !== String(reportId)) {
    return res.status(400).json({ error: 'reportId inválido' });
  }

  if (!['up', 'down'].includes(voteType)) {
    return res.status(400).json({ error: 'voteType debe ser "up" o "down"' });
  }

  // Comprobamos que el reporte existe y sigue activo antes de guardar el voto
  const reportCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/reports?id=eq.${reportIdN}&status=eq.active&select=id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const reportData = await reportCheck.json();
  if (!reportCheck.ok || reportData.length === 0) {
    return res.status(404).json({ error: 'Reporte no encontrado o ya no está activo' });
  }

  try {
    // Aqui hacemos un Upsert,  si ya existe un voto de este usuario para este reporte, lo sobreescribe
    // sino duplicamos las filas basicamente
    // on_conflict=report_id,user_id obligatorio para que PostgREST sepa qué constraint usar
    const r = await fetch(`${SUPABASE_URL}/rest/v1/report_votes?on_conflict=report_id,user_id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ report_id: reportIdN, user_id: user.id, vote_type: voteType }),
    });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Supabase ${r.status}: ${body}`);
    }

    // Devolvemos el conteo actualizado de votos para actualizar la UI al momento
    const countsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/report_votes?report_id=eq.${reportIdN}&select=vote_type`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const votes = await countsRes.json();
    const up = votes.filter(v => v.vote_type === 'up').length;
    const down = votes.filter(v => v.vote_type === 'down').length;

    return res.status(200).json({ up, down, userVote: voteType });
  } catch (err) {
    console.error('[api/report-votes]', err.message);
    return res.status(502).json({ error: 'Error guardando el voto' });
  }
}

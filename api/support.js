import nodemailer from 'nodemailer';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_URL = 'https://tumoqeuueqbvfstdhdmn.supabase.co';

async function getUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  return res.ok ? res.json() : null;
}

async function enviarEmailRespuesta(toEmail, respuesta) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('[support] GMAIL_USER o GMAIL_APP_PASSWORD no configuradas en Vercel');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"Quick Arrival Soporte" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Respuesta a tu solicitud de soporte — Quick Arrival',
    text: `Hola,\n\nHemos revisado tu solicitud y te enviamos la siguiente respuesta:\n\n${respuesta}\n\nGracias por usar Quick Arrival.`,
    html: `<p>Hola,</p><p>Hemos revisado tu solicitud y te enviamos la siguiente respuesta:</p><blockquote style="border-left:3px solid #e2e8f0;padding-left:1rem;color:#334155;margin:1rem 0">${respuesta.replace(/\n/g, '<br>')}</blockquote><p>Gracias por usar Quick Arrival.</p>`,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

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

  // PATCH — responder ticket (solo admin)
  if (req.method === 'PATCH') {
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    const { ticketId, response } = req.body || {};
    if (!ticketId || !response?.trim()) return res.status(400).json({ error: 'Faltan datos: ticketId y response' });

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        admin_response: response.trim(),
        responded_at: new Date().toISOString(),
        status: 'reviewed',
      }),
    });

    if (!updateRes.ok) return res.status(500).json({ error: 'Error actualizando el ticket' });
    const [ticket] = await updateRes.json();

    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ticket.user_id}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (userRes.ok) {
        const ticketUser = await userRes.json();
        await enviarEmailRespuesta(ticketUser.email, response.trim());
      }
    } catch (e) {
      console.error('[support/PATCH] Error enviando email:', e.message);
    }

    return res.status(200).json({ ok: true });
  }

  // DELETE — eliminar ticket (solo admin)
  if (req.method === 'DELETE') {
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

    const { ticketId } = req.body || {};
    if (!ticketId) return res.status(400).json({ error: 'Falta ticketId' });

    const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });

    if (!deleteRes.ok) return res.status(500).json({ error: 'Error eliminando el ticket' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

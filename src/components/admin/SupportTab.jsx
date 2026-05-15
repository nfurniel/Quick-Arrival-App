import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../../supabaseClient';

const TYPE_LABELS = {
  bug: 'Error en la app',
  datos: 'Datos incorrectos',
  sugerencia: 'Sugerencia',
  cuenta: 'Problema con cuenta',
  otro: 'Otro',
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  reviewed: 'Revisado',
  dismissed: 'Descartado',
};

export default function SupportTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('No autenticado'); setLoading(false); return; }

      const res = await fetch('/api/support', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) { setError('No tienes permisos de administrador'); setLoading(false); return; }
      if (!res.ok) { setError('Error al cargar los tickets'); setLoading(false); return; }

      const data = await res.json();
      setTickets(data.tickets || []);
      setLoading(false);
    }
    cargar();
  }, []);

  function abrirRespuesta(ticketId) {
    setReplyingTo(replyingTo === ticketId ? null : ticketId);
    setReplyText('');
    setSendError('');
  }

  async function handleReply(ticketId) {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, response: replyText }),
      });
      if (!res.ok) { setSendError('Error al enviar la respuesta'); setSending(false); return; }
      setTickets(prev => prev.map(t =>
        t.id === ticketId
          ? { ...t, admin_response: replyText.trim(), responded_at: new Date().toISOString(), status: 'reviewed' }
          : t
      ));
      setReplyingTo(null);
      setReplyText('');
    } catch {
      setSendError('Error de conexión');
    }
    setSending(false);
  }

  async function handleDelete(ticketId) {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/support', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    });
    setTickets(prev => prev.filter(t => t.id !== ticketId));
    setConfirmingDelete(null);
  }

  if (loading) return <p>Cargando...</p>;
  if (error) return <p className="admin-error">{error}</p>;

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">
        Tickets de soporte <span className="admin-count">({tickets.length})</span>
      </h2>

      {tickets.length === 0 ? (
        <p className="admin-empty">No hay tickets todavía.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <Fragment key={t.id}>
                  <tr>
                    <td data-label="Fecha" className="admin-date">
                      {new Date(t.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </td>
                    <td data-label="Tipo"><span className="admin-badge">{TYPE_LABELS[t.type] || t.type}</span></td>
                    <td data-label="Descripción" className="admin-desc">{t.description || <span className="admin-empty-cell">—</span>}</td>
                    <td data-label="Estado">
                      <span className={`admin-status admin-status-${t.status}`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td className="admin-actions-cell">
                      <button
                        className={`admin-action-btn ${t.admin_response ? 'admin-action-view' : 'admin-action-reply'}`}
                        onClick={() => abrirRespuesta(t.id)}
                      >
                        {replyingTo === t.id ? 'Cerrar' : t.admin_response ? 'Ver respuesta' : 'Responder'}
                      </button>

                      {confirmingDelete === t.id ? (
                        <span className="admin-confirm-inline">
                          <span className="admin-confirm-text">¿Eliminar?</span>
                          <button className="admin-confirm-yes" onClick={() => handleDelete(t.id)}>Sí</button>
                          <button className="admin-confirm-no" onClick={() => setConfirmingDelete(null)}>No</button>
                        </span>
                      ) : (
                        <button className="admin-action-btn admin-action-delete" onClick={() => setConfirmingDelete(t.id)}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>

                  {replyingTo === t.id && (
                    <tr className="admin-reply-row">
                      <td colSpan={5}>
                        {t.admin_response ? (
                          <div className="admin-existing-response">
                            <p className="admin-response-label">Respuesta enviada:</p>
                            <p className="admin-response-text">{t.admin_response}</p>
                          </div>
                        ) : (
                          <div className="admin-reply-form">
                            <textarea
                              className="admin-reply-textarea"
                              placeholder="Escribe tu respuesta al usuario..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              rows={3}
                            />
                            {sendError && <p className="admin-send-error">{sendError}</p>}
                            <div className="admin-reply-actions">
                              <button
                                className="admin-reply-send"
                                onClick={() => handleReply(t.id)}
                                disabled={sending || !replyText.trim()}
                              >
                                {sending ? 'Enviando...' : 'Enviar respuesta por email'}
                              </button>
                              <button
                                className="admin-reply-cancel"
                                onClick={() => setReplyingTo(null)}
                                disabled={sending}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
